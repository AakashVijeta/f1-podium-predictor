from fastapi import APIRouter, HTTPException
import httpx

router = APIRouter()

JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"

race_results_cache = {}

@router.get("/results/{year}/{round}")
async def get_race_results(year: int, round: int):
    cache_key = f"{year}-{round}"
    if cache_key in race_results_cache:
        return race_results_cache[cache_key]

    url = f"{JOLPICA_BASE}/{year}/{round}/results.json?limit=20"

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url)

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to fetch results from Jolpica")

    data = resp.json()
    races = data["MRData"]["RaceTable"]["Races"]

    if not races:
        # Race hasn't happened yet — not an error, just not available
        return {"available": False, "results": []}

    results = races[0]["Results"]

    formatted = [
        {
            "position": int(r["position"]),
            "driver_code": r["Driver"]["code"],          # e.g. "VER"
            "driver_name": (
                r["Driver"]["givenName"] + " " + r["Driver"]["familyName"]
            ),
            "constructor": r["Constructor"]["name"],
            "status": r["status"],                       # "Finished", "+1 Lap", "DNF" etc.
            "points": float(r["points"]),
        }
        for r in results
    ]

    ret = {"available": True, "results": formatted}
    if formatted:
        race_results_cache[cache_key] = ret
    return ret