import { useEffect, useState } from "react";

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
const MOBILE_QUERY = "(max-width: 640px)";

function matches(query) {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(query).matches;
}

export function useShouldAnimate({ skipOnMobile = false } = {}) {
  const [should, setShould] = useState(() =>
    !matches(REDUCED_QUERY) && !(skipOnMobile && matches(MOBILE_QUERY))
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const reducedMQ = window.matchMedia(REDUCED_QUERY);
    const mobileMQ  = window.matchMedia(MOBILE_QUERY);
    const update = () =>
      setShould(!reducedMQ.matches && !(skipOnMobile && mobileMQ.matches));
    reducedMQ.addEventListener?.("change", update);
    mobileMQ.addEventListener?.("change", update);
    return () => {
      reducedMQ.removeEventListener?.("change", update);
      mobileMQ.removeEventListener?.("change", update);
    };
  }, [skipOnMobile]);

  return should;
}
