import time
from fastapi import APIRouter
import httpx

router = APIRouter()

JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"

# key -> (expires_at_monotonic, payload). Negative results cached briefly to
# absorb stampede during live races when Jolpica is unreliable.
_RESULTS_CACHE: dict = {}
_TTL_OK = 3600      # race results, once present, are immutable
_TTL_EMPTY = 30     # race hasn't happened — re-check soon
_TTL_ERROR = 15     # transient upstream error — fail fast, retry soon


def _cache_get(key):
    entry = _RESULTS_CACHE.get(key)
    if entry is None:
        return None
    if entry[0] < time.monotonic():
        _RESULTS_CACHE.pop(key, None)
        return None
    return entry[1]


def _cache_put(key, payload, ttl):
    _RESULTS_CACHE[key] = (time.monotonic() + ttl, payload)


async def _fetch_jolpica(url: str) -> httpx.Response:
    # Single retry on transient failure — race-day Jolpica is flaky.
    async with httpx.AsyncClient(timeout=8) as client:
        try:
            return await client.get(url)
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.TimeoutException):
            return await client.get(url)


@router.get("/results/{year}/{round}")
async def get_race_results(year: int, round: int):
    cache_key = f"{year}-{round}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    url = f"{JOLPICA_BASE}/{year}/{round}/results.json?limit=22"

    try:
        resp = await _fetch_jolpica(url)

        if resp.status_code != 200:
            payload = {"available": False, "results": [], "error": f"External API returned status {resp.status_code}"}
            _cache_put(cache_key, payload, _TTL_ERROR)
            return payload

        races = resp.json()["MRData"]["RaceTable"]["Races"]

        if not races:
            payload = {"available": False, "results": []}
            _cache_put(cache_key, payload, _TTL_EMPTY)
            return payload

        formatted = [
            {
                "position": int(r["position"]),
                "driver_code": r.get("Driver", {}).get("code", "N/A"),
                "driver_name": r["Driver"]["givenName"] + " " + r["Driver"]["familyName"],
                "constructor": r["Constructor"]["name"],
                "status": r["status"],
                "points": float(r["points"]),
            }
            for r in races[0]["Results"]
        ]

        payload = {"available": True, "results": formatted}
        _cache_put(cache_key, payload, _TTL_OK if formatted else _TTL_EMPTY)
        return payload

    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.TimeoutException, httpx.ReadTimeout) as e:
        print(f"[RESULTS] External API connection error: {e}")
        payload = {"available": False, "results": [], "error": "External API is currently down or unreachable"}
        _cache_put(cache_key, payload, _TTL_ERROR)
        return payload
    except Exception as e:
        print(f"[RESULTS] Unexpected error fetching results: {e}")
        return {"available": False, "results": [], "error": f"An unexpected error occurred: {str(e)}"}
