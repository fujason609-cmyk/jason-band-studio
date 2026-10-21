/**
 * Instagram recording frame settings: the score on top and a flat chroma-key box
 * below, in one IG-shaped frame. The app records the frame as a video; key the colour
 * out in a video editor to put other footage in its place.
 */

export type OverlayColor = "green" | "blue" | "magenta" | "black";
/** Instagram shapes for the recording frame: Reels / Stories, portrait post, square post. */
export type RecordFrame = "9:16" | "4:5" | "1:1";

/**
 * Video frame rate. 30 is the default: plenty for a scrolling score on Instagram and easy
 * on older phones, which repaint the frame and play the band at the same time; 60 scrolls
 * smoother, at about twice the file size.
 */
export type RecordFps = 30 | 60;
export const RECORD_FPS: RecordFps[] = [30, 60];

export interface OverlaySettings {
  color: OverlayColor;
  frame: RecordFrame;
  fps: RecordFps;
}

export const DEFAULT_OVERLAY: OverlaySettings = { color: "green", frame: "9:16", fps: 30 };

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
    fps: r.fps === 60 ? 60 : DEFAULT_OVERLAY.fps,
  };
}

/**
 * Reels and Stories (9:16) play full screen under Instagram's own controls: the top bar
 * (back, title, camera) covers about the top 14%, and on phones taller than 9:16 the video
 * is scaled to the screen's height, so a few percent of each side is cut off. The score
 * keeps out of both (Meta's safe zone for Reels: 14% at the top, 6% at each side); that
 * band is plain score background. Feed posts (4:5, 1:1) show whole, so they get none.
 * The key strip is 92% of the width, centred (still 16:9), so the 4% cut off each side
 * is plain background and not the footage; the caption over its bottom is expected.
 */
export const REELS_SAFE_TOP = 0.14;
export const REELS_SAFE_SIDE = 0.06;
export const REELS_KEY_SIDE = 0.04;

export interface SafeArea {
  /** px kept clear above the score */
  top: number;
  /** px kept clear left and right of the score */
  side: number;
  /** px left and right of the key strip */
  keySide: number;
}

export const NO_SAFE_AREA: SafeArea = { top: 0, side: 0, keySide: 0 };

export function safeArea(frame: RecordFrame, width: number, height: number): SafeArea {
  if (frame !== "9:16") return NO_SAFE_AREA;
  return {
    top: Math.round(height * REELS_SAFE_TOP),
    side: Math.round(width * REELS_SAFE_SIDE),
    keySide: Math.round(width * REELS_KEY_SIDE),
  };
}

/** Smallest lane that still reads on video. */
export const MIN_RECORD_LANE = 24;

/**
 * Split a recording frame: the key area is a 16:9 strip as wide as the frame (less the
 * safe area's sides), and the score gets every pixel above it (less the safe area's
 * top), shared by the ruler and the lanes.
 */
export function recordLayout(frameWidth: number, frameHeight: number, rulerPx: number, lanes: number, safe: SafeArea = NO_SAFE_AREA) {
  const keyWidth = frameWidth - 2 * safe.keySide;
  const keyHeight = Math.round(keyWidth / KEY_ASPECT);
  const scoreHeight = Math.max(0, frameHeight - keyHeight - safe.top);
  const laneHeight = Math.max(MIN_RECORD_LANE, Math.floor((scoreHeight - rulerPx) / lanes));
  return { keyWidth, keyHeight, scoreHeight, laneHeight };
}
