import { drawTimeline, type LaneInput, type Palette } from "@/features/timeline/drawTimeline";
import { drawHighway } from "./drawHighway";
import { BREATH_SCALE, breathAt, energyAt } from "./energy";
import { drawIntro, type IntroPlan } from "./introSkit";
import { drawStageView } from "./drawStageView";
import { drawOpening, type OpeningFrame } from "./opening";
import type { TempoPoint } from "@/types/midi";
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
  /** the song's tempo map (song seconds), so the band dips on its real beats */
  tempos?: readonly TempoPoint[];
  lanes: LaneInput[];
  palette: Palette;
  keyColor: string;
  ripples: boolean;
  view: RecordView;
  /** falling notes: px kept clear on the right (Reels' icons) */
  fallRightInset: number;
  /** a looping take (the highlight), song seconds: the stage pets' paths repeat once per loop */
  loop?: { start: number; length: number; at: number };
  /** the opening skit, `t` seconds in, painted over the score */
  intro?: { plan: IntroPlan; t: number };
  /** the take's opening: the hook text and the song's name (opening.ts) */
  opening?: { frame: OpeningFrame; hook: readonly string[]; title: string };
}

// the same guitar pick the page's playhead uses (Playhead.tsx), 20 × 22
const PICK = "M10 21C6 16 1.5 10.5 1.5 6.2 1.5 2.8 5.2 1 10 1s8.5 1.8 8.5 5.2C18.5 10.5 14 16 10 21Z";

/** Paint one frame: score on top (same drawing as the page), playhead, flat key colour below. */
export function drawRecordFrame(ctx: CanvasRenderingContext2D, s: RecordScene) {
  // before the music (the intro), the falling notes are already on their way; the
  // scrolling score waits at the start
  if (s.view === "scroll" && s.position < 0) s = { ...s, position: 0 };
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

  if (s.view === "stage" || s.view === "stageRoad") {
    // the whole frame above the key strip: the band big on the stage, clear of the caption
    const boxHeight = s.height - s.keyHeight;
    ctx.beginPath();
    ctx.rect(0, 0, s.width, boxHeight);
    ctx.clip();
    const f = s.opening?.frame;
    drawStageView({
      ctx,
      width: s.width,
      height: boxHeight,
      safeTop: s.safeTop,
      safeSide: s.safeSide,
      safeBottom: s.safeBottom,
      mode: s.view === "stage" ? "stage" : "split",
      lanes: s.lanes,
      position: s.position,
      baseBpm: s.baseBpm,
      beatsPerBar: s.beatsPerBar,
      tempos: s.tempos,
      durationSeconds: s.durationSeconds,
      zoom: s.zoom,
      palette: s.palette,
      ripples: s.ripples,
      energy,
      rightInset: s.fallRightInset,
      loop: s.loop,
      sign: s.opening && f ? { title: s.opening.title, alpha: f.stageSign, since: f.signSince } : undefined,
    });
    ctx.restore();
    paintIntro(ctx, s);
    paintOpening(ctx, s, true);
    paintKey(ctx, s, keyTop);
    return;
  }

  if (s.view === "fall") {
    // the whole frame above the key strip: the road keeps to the safe area (starting part
    // way into the top band, its faint far end can go under Reels' bar), the stage runs
    // to the bottom edge, under the caption, with the band standing where it did
    const boxHeight = s.height - s.keyHeight;
    ctx.beginPath();
    ctx.rect(0, 0, s.width, boxHeight);
    ctx.clip();
    drawHighway({
      ctx,
      width: s.width,
      height: boxHeight,
      insets: { top: s.safeTop * FALL_TOP_SHARE, side: s.safeSide, bottom: s.safeBottom },
      loop: s.loop,
      ink: s.palette.ink,
      lanes: s.lanes,
      position: s.position,
      zoom: s.zoom,
      baseBpm: s.baseBpm,
      beatsPerBar: s.beatsPerBar,
      tempos: s.tempos,
      durationSeconds: s.durationSeconds,
      palette: s.palette,
      ripples: s.ripples,
      energy,
      rightInset: s.fallRightInset,
    });
    ctx.restore();
    paintIntro(ctx, s);
    paintOpening(ctx, s, false);
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
    tempos: s.tempos,
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
  paintIntro(ctx, s);
  paintOpening(ctx, s, false);
  paintKey(ctx, s, keyTop);
}

/** The hook text over everything (the skit included), and in the score views the name card. */
function paintOpening(ctx: CanvasRenderingContext2D, s: RecordScene, stage: boolean) {
  if (!s.opening) return;
  const f = stage ? { ...s.opening.frame, card: false } : s.opening.frame;
  drawOpening(ctx, { width: s.width, height: s.height - s.keyHeight, safeTop: s.safeTop, safeSide: s.safeSide }, f, s.opening.hook, s.opening.title, s.palette.ink);
}

/** The opening skit, over everything above the key strip. */
function paintIntro(ctx: CanvasRenderingContext2D, s: RecordScene) {
  if (!s.intro) return;
  const area = { width: s.width, height: s.height - s.keyHeight, safeTop: s.safeTop, safeSide: s.safeSide, safeBottom: s.safeBottom };
  drawIntro(ctx, area, s.intro.plan, s.intro.t, s.lanes, s.palette.ink);
}

/** How far into the Reels top band the falling view's road starts (its far end is faint). */
export const FALL_TOP_SHARE = 0.5;

/** The key colour: one flat rectangle, nothing drawn over it. */
function paintKey(ctx: CanvasRenderingContext2D, s: RecordScene, keyTop: number) {
  if (s.keyHeight <= 0) return;
  ctx.fillStyle = s.keyColor;
  ctx.fillRect(s.keySide, keyTop, s.width - 2 * s.keySide, s.keyHeight);
}
