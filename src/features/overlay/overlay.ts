/**
 * Instagram recording frame settings: the score on top and a flat chroma-key box
 * below, in one IG-shaped frame. Record the screen, crop to the frame, then key
 * the colour out in a video editor to put other footage in its place.
 */

export type OverlayColor = "green" | "blue" | "magenta" | "black";
/** Instagram shapes for the recording frame: Reels / Stories, portrait post, square post. */
export type RecordFrame = "9:16" | "4:5" | "1:1";
/** Share of the recording frame's height given to the timeline; the key colour gets the rest. */
export type RecordSplit = 0.4 | 0.5 | 0.6;

export interface OverlaySettings {
  color: OverlayColor;
  frame: RecordFrame;
  split: RecordSplit;
}

export const DEFAULT_OVERLAY: OverlaySettings = { color: "green", frame: "9:16", split: 0.5 };

/** Exact key colours. Fixed, never themed, so the editor's keyer sees one flat value. */
export const OVERLAY_COLORS: Record<OverlayColor, string> = {
  green: "#00ff00",
  blue: "#0000ff",
  magenta: "#ff00ff",
  black: "#000000",
};

export const RECORD_FRAMES: RecordFrame[] = ["9:16", "4:5", "1:1"];
export const RECORD_SPLITS: RecordSplit[] = [0.4, 0.5, 0.6];

const pick = <T extends string>(value: unknown, options: readonly T[], fallback: T): T =>
  typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;

/** Stored settings from older versions may carry extra keys (enabled, aspect, size); they're dropped. */
export function sanitizeOverlay(raw: unknown): OverlaySettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    color: pick(r.color, Object.keys(OVERLAY_COLORS) as OverlayColor[], DEFAULT_OVERLAY.color),
    frame: pick(r.frame, RECORD_FRAMES, DEFAULT_OVERLAY.frame),
    split: RECORD_SPLITS.includes(r.split as RecordSplit) ? (r.split as RecordSplit) : DEFAULT_OVERLAY.split,
  };
}

/** Smallest lane that still reads on video. */
export const MIN_RECORD_LANE = 24;

/** Lane height that fits five lanes plus the ruler into the frame's timeline area. */
export function recordLaneHeight(timelinePx: number, rulerPx: number, lanes: number): number {
  return Math.max(MIN_RECORD_LANE, Math.floor((timelinePx - rulerPx) / lanes));
}
