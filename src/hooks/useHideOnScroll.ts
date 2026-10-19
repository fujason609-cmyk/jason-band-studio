import { useEffect, useState } from "react";

/** Don't hide while this close to the top: the bar is still in its normal place. */
export const HIDE_AFTER_Y = 160;
/** Ignore scroll jitter smaller than this. */
const MIN_DELTA = 6;

/**
 * Hide when scrolling down past the top area, show again on any scroll up.
 * Returns null when the movement is too small to change anything.
 */
export function scrollVisibility(prevY: number, y: number): boolean | null {
  if (y <= HIDE_AFTER_Y) return false;
  const dy = y - prevY;
  if (Math.abs(dy) < MIN_DELTA) return null;
  return dy > 0;
}

/** True while the page is being scrolled down. Always false when `enabled` is off. */
export function useHideOnScroll(enabled: boolean): [hidden: boolean, show: () => void] {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setHidden(false);
      return;
    }
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        const next = scrollVisibility(last, y);
        if (next === null) return;
        last = y;
        setHidden(next);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [enabled]);

  return [enabled && hidden, () => setHidden(false)];
}
