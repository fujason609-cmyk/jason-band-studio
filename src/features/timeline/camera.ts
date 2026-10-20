import { TIMELINE_GUTTER } from "./layout";

/** Where the playhead sits while the score follows it: 30% in from the left. */
export const PLAYHEAD_AT = 0.3;

/**
 * Scroll offset that keeps the playhead at PLAYHEAD_AT: the score glides under a
 * steady playhead instead of jumping a page at a time, clamped to the start and end
 * of the song (so the playhead walks in from the left and out to the right).
 * Used by the page's follow mode and by video recording.
 */
export function cameraLeft(position: number, zoom: number, width: number, durationSeconds: number): number {
  const content = TIMELINE_GUTTER * 2 + durationSeconds * zoom;
  const left = TIMELINE_GUTTER + position * zoom - width * PLAYHEAD_AT;
  return Math.max(0, Math.min(left, Math.max(0, content - width)));
}

/** Further than this from the camera (after a seek, a zoom, a manual scroll), glide rather than jump. */
const GLIDE_FROM_PX = 40;
/** Share of the remaining distance covered each frame while gliding. */
const GLIDE_RATE = 0.25;

/**
 * The next scroll position on the way to `target`. Normal playback moves a few pixels
 * a frame, so it lands exactly on the camera; a big gap is closed over a few frames.
 */
export function followStep(current: number, target: number): number {
  const gap = target - current;
  return Math.abs(gap) < GLIDE_FROM_PX ? target : current + gap * GLIDE_RATE;
}
