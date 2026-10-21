import { drawTimeline, type LaneInput, type Palette } from "@/features/timeline/drawTimeline";
import { cameraLeft } from "@/features/timeline/camera";
import { RULER_HEIGHT, TIMELINE_GUTTER } from "@/features/timeline/layout";

/** Everything one video frame shows, in the frame's on-screen (CSS pixel) size. */
export interface RecordScene {
  width: number;
  height: number;
  keyHeight: number;
  laneHeight: number;
  /** kept clear of the score (Reels: Instagram's controls and side crop) */
  safeTop: number;
  safeSide: number;
  zoom: number;
  /** song seconds of the sound being heard */
  position: number;
  durationSeconds: number;
  baseBpm: number;
  beatsPerBar: number;
  lanes: LaneInput[];
  palette: Palette;
  keyColor: string;
  ripples: boolean;
}

// the same guitar pick the page's playhead uses (Playhead.tsx), 20 × 22
const PICK = "M10 21C6 16 1.5 10.5 1.5 6.2 1.5 2.8 5.2 1 10 1s8.5 1.8 8.5 5.2C18.5 10.5 14 16 10 21Z";

/** Paint one frame: score on top (same drawing as the page), playhead, flat key colour below. */
export function drawRecordFrame(ctx: CanvasRenderingContext2D, s: RecordScene) {
  const keyTop = s.height - s.keyHeight;
  // the score's own box, inside the safe area
  const width = s.width - 2 * s.safeSide;
  const scoreHeight = keyTop - s.safeTop;
  const timelineHeight = Math.min(scoreHeight, RULER_HEIGHT + s.lanes.length * s.laneHeight);
  const scrollLeft = cameraLeft(s.position, s.zoom, width, s.durationSeconds);

  ctx.fillStyle = s.palette.surface;
  ctx.fillRect(0, 0, s.width, keyTop);
  ctx.save();
  ctx.translate(s.safeSide, s.safeTop);
  ctx.beginPath();
  ctx.rect(0, 0, width, scoreHeight);
  ctx.clip();
  drawTimeline({
    ctx,
    width,
    height: timelineHeight,
    scrollLeft,
    zoom: s.zoom,
    lanes: s.lanes,
    baseBpm: s.baseBpm,
    beatsPerBar: s.beatsPerBar,
    durationSeconds: s.durationSeconds,
    palette: s.palette,
    showLabels: true,
    laneHeight: s.laneHeight,
    position: s.position,
    ripples: s.ripples,
  });

  // playhead: glowing accent line with the pick in the ruler
  const x = Math.round(TIMELINE_GUTTER + s.position * s.zoom - scrollLeft);
  ctx.save();
  ctx.shadowColor = s.palette.accent;
  ctx.shadowBlur = 8;
  ctx.fillStyle = s.palette.accent;
  ctx.fillRect(x - 1, 0, 2, timelineHeight);
  ctx.restore();
  ctx.save();
  ctx.translate(x - 10, RULER_HEIGHT - 24);
  const pick = new Path2D(PICK);
  ctx.fillStyle = s.palette.accent;
  ctx.fill(pick);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke(pick);
  ctx.restore();
  ctx.restore(); // the safe-area box

  // the key colour: one flat rectangle, nothing drawn over it
  ctx.fillStyle = s.keyColor;
  ctx.fillRect(0, keyTop, s.width, s.keyHeight);
}
