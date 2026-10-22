import { drawTimeline, type LaneInput, type Palette } from "@/features/timeline/drawTimeline";
import { drawHighway } from "./drawHighway";
import { drawTeaCorner } from "./drawTeaCorner";
import { BREATH_SCALE, breathAt, energyAt } from "./energy";
import type { RecordView } from "./overlay";
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
  /** background left and right of the key strip (Reels crops the sides) */
  keySide: number;
  /** kept clear below the score (Reels without a key strip: the caption) */
  safeBottom: number;
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
  view: RecordView;
  /** falling notes: px kept clear on the right (Reels' icons) */
  fallRightInset: number;
  /** a looping take (the highlight), song seconds: the tea corner's turtle keeps to it */
  loop?: { start: number; length: number; at: number };
}

// the same guitar pick the page's playhead uses (Playhead.tsx), 20 × 22
const PICK = "M10 21C6 16 1.5 10.5 1.5 6.2 1.5 2.8 5.2 1 10 1s8.5 1.8 8.5 5.2C18.5 10.5 14 16 10 21Z";

/** Paint one frame: score on top (same drawing as the page), playhead, flat key colour below. */
export function drawRecordFrame(ctx: CanvasRenderingContext2D, s: RecordScene) {
  const keyTop = s.height - s.keyHeight - s.safeBottom;
  // the score's own box, inside the safe area
  const width = s.width - 2 * s.safeSide;
  const scoreHeight = keyTop - s.safeTop;
  const timelineHeight = Math.min(scoreHeight, RULER_HEIGHT + s.lanes.length * s.laneHeight);
  const scrollLeft = cameraLeft(s.position, s.zoom, width, s.durationSeconds);

  ctx.fillStyle = s.palette.surface;
  ctx.fillRect(0, 0, s.width, s.height);

  // how busy the music is, and the swell of a crash (both only while things move)
  const barSeconds = (60 / s.baseBpm) * s.beatsPerBar;
  const energy = s.ripples ? energyAt(s.lanes.map((l) => l.notes), barSeconds, s.position) : 0;
  const drums = s.lanes.find((l) => l.isDrums && l.audible);
  const breath = s.ripples && drums ? breathAt(drums.notes, barSeconds, s.position, energy) : 0;
  ctx.save();
  if (breath > 0) {
    // the score swells from its centre; the key strip is painted over it afterwards, flat
    const cx = s.safeSide + width / 2;
    const cy = s.safeTop + scoreHeight / 2;
    ctx.translate(cx, cy);
    ctx.scale(1 + breath * BREATH_SCALE, 1 + breath * BREATH_SCALE);
    ctx.translate(-cx, -cy);
  }

  if (s.view === "fall") {
    ctx.translate(s.safeSide, s.safeTop);
    ctx.beginPath();
    ctx.rect(0, 0, width, scoreHeight);
    ctx.clip();
    drawHighway({
      ctx,
      width,
      height: scoreHeight,
      lanes: s.lanes,
      position: s.position,
      zoom: s.zoom,
      baseBpm: s.baseBpm,
      beatsPerBar: s.beatsPerBar,
      durationSeconds: s.durationSeconds,
      palette: s.palette,
      ripples: s.ripples,
      energy,
      rightInset: s.fallRightInset,
    });
    ctx.restore();
    paintTeaCorner(ctx, s);
    paintKey(ctx, s, keyTop);
    return;
  }

  // the score sits right on the key strip: lane heights are whole pixels, and the few left
  // over went below the last lane as a strip of background between score and key
  ctx.translate(s.safeSide, s.safeTop + Math.max(0, scoreHeight - timelineHeight));
  ctx.beginPath();
  ctx.rect(0, 0, width, timelineHeight);
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
    showcase: { energy },
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
  paintTeaCorner(ctx, s);
  paintKey(ctx, s, keyTop);
}

/** Reels: the club room's tea table and turtle in the top band (nothing else is there). */
function paintTeaCorner(ctx: CanvasRenderingContext2D, s: RecordScene) {
  if (s.safeTop <= 0) return;
  drawTeaCorner({ ctx, x: 0, y: 0, width: s.width, height: s.safeTop, lanes: s.lanes, position: s.position, live: s.ripples, ink: s.palette.ink, loop: s.loop });
}

/** The key colour: one flat rectangle, nothing drawn over it. */
function paintKey(ctx: CanvasRenderingContext2D, s: RecordScene, keyTop: number) {
  if (s.keyHeight <= 0) return;
  ctx.fillStyle = s.keyColor;
  ctx.fillRect(s.keySide, keyTop, s.width - 2 * s.keySide, s.keyHeight);
}
