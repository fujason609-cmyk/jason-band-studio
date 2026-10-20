/**
 * Instagram recording frame settings: the score on top and a flat chroma-key box
 * below, in one IG-shaped frame. Record the screen, crop to the frame, then key
 * the colour out in a video editor to put other footage in its place.
 */

export type OverlayColor = "green" | "blue" | "magenta" | "black";
/** Instagram shapes for the recording frame: Reels / Stories, portrait post, square post. */
export type RecordFrame = "9:16" | "4:5" | "1:1";

export interface OverlaySettings {
  color: OverlayColor;
  frame: RecordFrame;
}

export const DEFAULT_OVERLAY: OverlaySettings = { color: "green", frame: "9:16" };

/** Exact key colours. Fixed, never themed, so the editor's keyer sees one flat value. */
export const OVERLAY_COLORS: Record<OverlayColor, string> = {
  green: "#00ff00",
  blue: "#0000ff",
  magenta: "#ff00ff",
  black: "#000000",
};

export const RECORD_FRAMES: RecordFrame[] = ["9:16", "4:5", "1:1"];

/** The key area holds landscape anime footage: full frame width, 16:9. */
export const KEY_ASPECT = 16 / 9;

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;

/** Stored settings from older versions may carry extra keys (enabled, aspect, size, split); they're dropped. */
export function sanitizeOverlay(raw: unknown): OverlaySettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    color: pick(r.color, Object.keys(OVERLAY_COLORS) as OverlayColor[], DEFAULT_OVERLAY.color),
    frame: pick(r.frame, RECORD_FRAMES, DEFAULT_OVERLAY.frame),
  };
}

/** Smallest lane that still reads on video. */
export const MIN_RECORD_LANE = 24;

/**
 * Split a recording frame: the key area is a 16:9 strip as wide as the frame,
 * and the score gets every pixel above it, shared by the ruler and the lanes.
 */
export function recordLayout(frameWidth: number, frameHeight: number, rulerPx: number, lanes: number) {
  const keyHeight = Math.round(frameWidth / KEY_ASPECT);
  const scoreHeight = Math.max(0, frameHeight - keyHeight);
  const laneHeight = Math.max(MIN_RECORD_LANE, Math.floor((scoreHeight - rulerPx) / lanes));
  return { keyHeight, scoreHeight, laneHeight };
}
