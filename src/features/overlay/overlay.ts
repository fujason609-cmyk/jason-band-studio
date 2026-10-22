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

/**
 * How the frame shows the score: the scrolling timeline, or notes falling down one upright
 * lane per member, like a rhythm game (drawHighway.ts).
 */
export type RecordView = "scroll" | "fall";

export interface OverlaySettings {
  color: OverlayColor;
  frame: RecordFrame;
  fps: RecordFps;
  /** the key-colour strip for footage; off, the score fills the frame */
  keyStrip: boolean;
  view: RecordView;
  /** a take is the whole song, or the 15–20 s highlight that loops (highlight.ts) */
  clip: RecordClip;
}

export const DEFAULT_OVERLAY: OverlaySettings = { color: "green", frame: "9:16", fps: 30, keyStrip: true, view: "scroll", clip: "full" };
export const RECORD_CLIPS = ["full", "highlight"] as const;
export type RecordClip = (typeof RECORD_CLIPS)[number];

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
    keyStrip: r.keyStrip !== false,
    view: r.view === "fall" ? "fall" : "scroll",
    // "highlight20" was a separate 20 s take before the highlight's length went free (15–20 s)
    clip: r.clip === "highlight" || r.clip === "highlight20" ? "highlight" : "full",
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
 * Without a key strip the score would run under the account name and caption, so the
 * bottom 12% stays clear too.
 */
export const REELS_SAFE_TOP = 0.14;
export const REELS_SAFE_SIDE = 0.06;
export const REELS_KEY_SIDE = 0.04;
export const REELS_SAFE_BOTTOM = 0.12;
/**
 * Reels' like / comment / share column sits over the lower right. The falling-notes view
 * has its hit line and names down there, so without a key strip its lanes also keep this
 * much more clear on the right (measured on an upload: the icons cover about the right 10%
 * of the screen, past the 6% side margin and the 4% crop).
 */
export const REELS_ICONS_RIGHT = 0.08;

/** Extra px kept clear on the right of the falling-notes lanes (Reels without a key strip). */
export function fallRightInset(frame: RecordFrame, width: number, keyStrip: boolean): number {
  return frame === "9:16" && !keyStrip ? Math.round(width * REELS_ICONS_RIGHT) : 0;
}

export interface SafeArea {
  /** px kept clear above the score */
  top: number;
  /** px kept clear left and right of the score */
  side: number;
  /** px left and right of the key strip */
  keySide: number;
  /** px kept clear below the score (Reels without a key strip: the caption) */
  bottom: number;
}

export const NO_SAFE_AREA: SafeArea = { top: 0, side: 0, keySide: 0, bottom: 0 };

export function safeArea(frame: RecordFrame, width: number, height: number, keyStrip = true): SafeArea {
  if (frame !== "9:16") return NO_SAFE_AREA;
  return {
    top: Math.round(height * REELS_SAFE_TOP),
    side: Math.round(width * REELS_SAFE_SIDE),
    keySide: Math.round(width * REELS_KEY_SIDE),
    bottom: keyStrip ? 0 : Math.round(height * REELS_SAFE_BOTTOM),
  };
}

/** Smallest lane that still reads on video. */
export const MIN_RECORD_LANE = 24;

/**
 * Split a recording frame: the key area is a 16:9 strip as wide as the frame (less the
 * safe area's sides), and the score gets every pixel above it (less the safe area's
 * top), shared by the ruler and the lanes. Without the key strip the score gets it all
 * (less the safe area's top and bottom).
 */
export function recordLayout(
  frameWidth: number,
  frameHeight: number,
  rulerPx: number,
  lanes: number,
  safe: SafeArea = NO_SAFE_AREA,
  keyStrip = true,
) {
  const keyWidth = keyStrip ? frameWidth - 2 * safe.keySide : 0;
  const keyHeight = keyStrip ? Math.round(keyWidth / KEY_ASPECT) : 0;
  const scoreHeight = Math.max(0, frameHeight - keyHeight - safe.top - safe.bottom);
  const laneHeight = Math.max(MIN_RECORD_LANE, Math.floor((scoreHeight - rulerPx) / lanes));
  return { keyWidth, keyHeight, scoreHeight, laneHeight };
}
