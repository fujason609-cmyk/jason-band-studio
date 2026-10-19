/**
 * Video overlay zone: a flat chroma-key box below the timeline. Record the screen,
 * then key this colour out in a video editor to put other footage in its place.
 */

export type OverlayColor = "green" | "blue" | "magenta" | "black";
export type OverlayAspect = "16:9" | "4:3" | "1:1" | "9:16";
export type OverlaySize = "s" | "m" | "l";

export interface OverlaySettings {
  enabled: boolean;
  color: OverlayColor;
  aspect: OverlayAspect;
  size: OverlaySize;
}

export const DEFAULT_OVERLAY: OverlaySettings = { enabled: false, color: "green", aspect: "16:9", size: "m" };

/** Exact key colours. Fixed, never themed, so the editor's keyer sees one flat value. */
export const OVERLAY_COLORS: Record<OverlayColor, string> = {
  green: "#00ff00",
  blue: "#0000ff",
  magenta: "#ff00ff",
  black: "#000000",
};

export const OVERLAY_ASPECTS: OverlayAspect[] = ["16:9", "4:3", "1:1", "9:16"];
export const OVERLAY_SIZES: OverlaySize[] = ["s", "m", "l"];

/** Box width as a share of the studio width. */
export const OVERLAY_WIDTH: Record<OverlaySize, number> = { s: 0.4, m: 0.65, l: 1 };

export function aspectRatio(aspect: OverlayAspect): string {
  return aspect.replace(":", " / ");
}

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;

export function sanitizeOverlay(raw: unknown): OverlaySettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_OVERLAY.enabled,
    color: pick(r.color, Object.keys(OVERLAY_COLORS) as OverlayColor[], DEFAULT_OVERLAY.color),
    aspect: pick(r.aspect, OVERLAY_ASPECTS, DEFAULT_OVERLAY.aspect),
    size: pick(r.size, OVERLAY_SIZES, DEFAULT_OVERLAY.size),
  };
}
