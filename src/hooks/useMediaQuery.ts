import { useEffect, useState } from "react";

export const NARROW_QUERY = "(max-width: 760px)";
/** Phones and tablets: no hover and a finger for a pointer, so keyboard hints don't apply. */
export const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof matchMedia !== "undefined" && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}
