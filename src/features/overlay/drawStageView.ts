import { drumVoiceFor } from "@/lib/drums";
import { poseAt } from "@/features/band/pixelInstruments";
import { IDLE_MEMBER, cheerPoseAt, drawMemberCheering, drawMemberPlaying, memberPoseAt } from "@/features/band/pixelMembers";
import type { MemberId } from "@/features/band/types";
import { cheers, laneFlash, type LaneInput, type Palette } from "@/features/timeline/drawTimeline";
import { beatNow } from "@/lib/time";
import type { NoteEvent, TempoPoint } from "@/types/midi";
import { STAGE_ORDER, drawHighway } from "./drawHighway";
import { drawSign } from "./introSkit";
import { PLACES, STAGE_HEIGHT_IN_FIGURES, cone, paintCurtains, paintStageSet, stageLayout } from "./stageScene";
import { drawCritters } from "./stageCritters";

/**
 * The stage views: the band big, playing the song, the whole time (in the Reels the pixel
 * band was what people liked, and on the falling-notes road they stood small at the bottom,
 * under Instagram's caption). `"stage"` is the stage alone, standing clear of the caption;
 * `"split"` puts it in the top half and the falling-notes road, without its own little band,
 * in the bottom half. Each note sends up a spark from the member who plays it; her light
 * flares on her hits; a member with nothing to play cheers. Like everything else drawn, a
 * function of the playing position.
 */
export interface StageViewInput {
  ctx: CanvasRenderingContext2D;
  /** the frame above the key strip */
  width: number;
  height: number;
  safeTop: number;
  safeSide: number;
  safeBottom: number;
  mode: "stage" | "split";
  lanes: LaneInput[];
  position: number;
  baseBpm: number;
  beatsPerBar: number;
  tempos?: readonly TempoPoint[];
  durationSeconds: number;
  zoom: number;
  palette: Palette;
  /** things move (only while playing, not with reduced motion) */
  ripples: boolean;
  energy: number;
  rightInset?: number;
  loop?: { start: number; length: number; at?: number };
  /** the song's name on the marquee over the stage, how visible (0 hides it), and how long it has hung (it drops in) */
  sign?: { title: string; alpha: number; since: number };
}

/** In Reels without a key strip, the caption covers about this much of the bottom: the band stands above it. */
const CAPTION_SHARE = 0.22;
/** The split: the stage's floor line, as a share of the height; the road takes the rest. */
const SPLIT_AT = 0.5;
/** How long a note's spark rises, and how many of a member's last notes send one. */
const SPARK_SECONDS = 0.9;
const SPARKS_PER_LANE = 12;

/** Where the front row's feet go and how big the band can be, for a frame of this shape. */
export function stageFrame(input: Pick<StageViewInput, "width" | "height" | "safeTop" | "safeSide" | "safeBottom" | "mode">) {
  const { width, height, safeTop, safeSide, safeBottom, mode } = input;
  const contentW = width - 2 * safeSide;
  // in Reels (a bottom safe band) the caption covers more than the safe band itself
  const guard = safeBottom > 0 ? Math.max(safeBottom, height * CAPTION_SHARE) : height * 0.05;
  const feet = mode === "split" ? height * SPLIT_AT : height - guard;
  // room over the back row's heads for the sign and the sparks
  const above = mode === "split" ? 0.75 : 0.9;
  const maxFigure = Math.min(150, (feet - safeTop) / (STAGE_HEIGHT_IN_FIGURES + above));
  const stage = stageLayout({ left: safeSide, width: contentW, feet, maxFigure });
  return { stage, contentW, roadTop: mode === "split" ? feet + stage.fw * 0.35 : height };
}

export function drawStageView(input: StageViewInput) {
  const { ctx, width, height, safeTop, safeSide, safeBottom, position, lanes, palette } = input;
  const live = input.ripples;
  const { stage, contentW, roadTop } = stageFrame(input);
  const { fw, place } = stage;
  const beat = beatNow(position, input.tempos, input.baseBpm);
  const ink = palette.ink;

  ctx.clearRect(0, 0, width, height);
  paintStageSet(ctx, width, stage, 0, roadTop);
  const laneOf = (m: MemberId) => lanes.find((l) => l.member === m);

  // each member's light, flaring on her hits
  for (const m of STAGE_ORDER) {
    const lane = laneOf(m);
    if (!lane) continue;
    const p = place(m);
    const flash = live && !cheers(lane) ? laneFlash(lane.notes, position, lane.isDrums) : 0;
    cone(ctx, p.x, safeTop, p.feet, p.w, lane.color, (lane.audible ? 1 : 0.4) * (0.18 + 0.4 * flash));
  }

  // the back row first, then the front
  const order = [...STAGE_ORDER].sort((x, y) => Number(PLACES[y].back) - Number(PLACES[x].back));
  for (const m of order) {
    const lane = laneOf(m);
    if (!lane?.instrument) continue;
    const p = place(m);
    ctx.save();
    ctx.globalAlpha = lane.audible ? 1 : 0.4;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.feet - 2, p.w * 0.45, p.w * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (cheers(lane)) {
      drawMemberCheering(ctx, m, cheerPoseAt(m, position, live ? beat : undefined), p.x - p.w / 2, p.feet - p.h, p.w, lane.color, ink);
    } else {
      const sung = lane.vocal?.on ? lane.vocal.notes : undefined;
      const pose = live ? memberPoseAt(m, lane.notes, sung, position, lane.isDrums, beat) : IDLE_MEMBER;
      drawMemberPlaying(ctx, m, lane.instrument, pose, poseAt(lane.notes, position, lane.instrument), p.x - p.w / 2, p.feet - p.h, p.w, lane.color, lane.leftHanded, lane.gear, ink);
      if (live) {
        // sparks from her hands, and from her mouth as she sings
        drawSparks(ctx, lane.notes, position, p.x, p.feet - p.h * 0.42, p.w, lane.color, lane.isDrums);
        if (sung) drawSparks(ctx, sung, position, p.x, p.feet - p.h * 0.72, p.w * 0.7, "#fff6d8", false);
      }
    }
    ctx.restore();
  }

  if (input.mode === "stage") {
    // the pets, on the floor in front of the band
    drawCritters({
      ctx,
      x: safeSide + 8,
      width: contentW - 16,
      floorY: stage.frontFeet + fw * 0.3,
      unit: Math.max(1.5, Math.min(3, width / 140)),
      position,
      live,
      ink,
      loop: input.loop,
    });
  }

  // drapes at the sides, a valance up top (under Instagram's bar)
  const valance = safeTop * 0.6 + 14;
  paintCurtains(ctx, width, roadTop, valance, 1, Math.min(roadTop, height - safeBottom));
  if (input.sign?.title && input.sign.alpha > 0) {
    ctx.save();
    ctx.globalAlpha = input.sign.alpha;
    drawSign(ctx, input.sign.title, width / 2, valance, safeTop + 4, contentW * 0.9, fw, input.sign.since, ink);
    ctx.restore();
  }

  if (input.mode === "split") {
    // the road underneath, without its own little band
    ctx.save();
    ctx.translate(0, roadTop);
    ctx.beginPath();
    ctx.rect(0, 0, width, height - roadTop);
    ctx.clip();
    drawHighway({
      ctx,
      width,
      height: height - roadTop,
      lanes,
      position,
      zoom: input.zoom,
      baseBpm: input.baseBpm,
      beatsPerBar: input.beatsPerBar,
      tempos: input.tempos,
      durationSeconds: input.durationSeconds,
      palette,
      ripples: live,
      energy: input.energy,
      rightInset: input.rightInset,
      insets: { top: 0, side: safeSide, bottom: safeBottom },
      ink,
      band: false,
    });
    ctx.restore();
  }
}

/**
 * A rising spark for each of a member's notes in the last SPARK_SECONDS: from (`x`, `y`),
 * spread across her by pitch, floating up and fading (drums: kick, snare and crash only, or
 * the hi-hat would fill the air). Notes sorted by start.
 */
export function sparksAt(notes: readonly NoteEvent[], position: number, isDrums: boolean) {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.start <= position) lo = mid + 1;
    else hi = mid;
  }
  const out: { age: number; spread: number; size: number }[] = [];
  for (let k = lo - 1; k >= 0 && out.length < SPARKS_PER_LANE; k--) {
    const n = notes[k]!;
    const age = position - n.start;
    if (age >= SPARK_SECONDS) break;
    if (isDrums && !["kick", "snare", "crash"].includes(drumVoiceFor(n.pitch))) continue;
    // across her, by pitch (a run spreads out), and a little by when it came
    const spread = ((((n.pitch * 7 + Math.floor(n.start * 13)) % 11) + 11) % 11) / 10 - 0.5;
    out.push({ age: age / SPARK_SECONDS, spread, size: 0.6 + 0.4 * n.velocity });
  }
  return out;
}

function drawSparks(ctx: CanvasRenderingContext2D, notes: readonly NoteEvent[], position: number, x: number, y: number, w: number, color: string, isDrums: boolean) {
  for (const s of sparksAt(notes, position, isDrums)) {
    const sx = x + s.spread * w * 0.8 + Math.sin(s.age * Math.PI * 2) * w * 0.05;
    const sy = y - s.age * w * 1.3;
    const r = w * 0.1 * s.size * (1 - s.age * 0.4);
    ctx.save();
    ctx.globalAlpha *= Math.pow(1 - s.age, 1.3);
    // a four-pointed star in her colour with a white heart
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(sx, sy - r);
    ctx.lineTo(sx + r * 0.32, sy - r * 0.32);
    ctx.lineTo(sx + r, sy);
    ctx.lineTo(sx + r * 0.32, sy + r * 0.32);
    ctx.lineTo(sx, sy + r);
    ctx.lineTo(sx - r * 0.32, sy + r * 0.32);
    ctx.lineTo(sx - r, sy);
    ctx.lineTo(sx - r * 0.32, sy - r * 0.32);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(sx, sy, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
