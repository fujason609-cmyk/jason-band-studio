import { drawPixelInstrument, poseAt } from "@/features/band/pixelInstruments";
import { drumVoiceFor } from "@/lib/drums";
import type { NoteEvent } from "@/types/midi";
import {
  ACCENTS,
  DRUM_ROWS,
  FONT,
  SPARKLE_SECONDS,
  dotGrid,
  drumGlyph,
  firstVisible,
  laneFlash,
  pill,
  roundRect,
  sparkle,
  summarise,
  type LaneInput,
  type Palette,
} from "@/features/timeline/drawTimeline";

/**
 * The falling-notes view of the recording frame, like a rhythm game: one upright lane per
 * member, side by side, notes falling towards a hit line near the bottom and sounding as
 * they reach it, each member's pixel instrument under the line. Inside a lane, pitch runs left to right (a little
 * piano roll), so a tune keeps its shape; drum hits sit in one column per drum sound.
 * Notes held past the line shrink into it. Only what is on screen is drawn.
 */
export interface HighwayInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  lanes: LaneInput[];
  /** song seconds of the sound being heard */
  position: number;
  /** the timeline zoom (px per song second); notes fall FALL_SPEED times that */
  zoom: number;
  baseBpm: number;
  beatsPerBar: number;
  durationSeconds: number;
  palette: Palette;
  /** effects that move: flashes, sparkles, twinkles (only while playing, not with reduced motion) */
  ripples: boolean;
  /** how busy the music is now, 0–1 (energy.ts) */
  energy: number;
  /** px on the right left without lanes (Reels' icon column, overlay.fallRightInset) */
  rightInset?: number;
}

/** Falling speed against the horizontal zoom: the frame is taller than it is wide. */
export const FALL_SPEED = 2.2;
const LANE_GAP = 6;
/** under the hit line: the member's pixel instrument (no name: the instrument says who it is) */
const SPRITE = 36;
const LABEL_H = SPRITE + 18;
const DRUM_GLOW_SECONDS = 0.14;

/** Where a lane's hit line is, and the time-to-height scale. */
export function highwayGeometry(width: number, height: number, lanes: number, zoom: number) {
  const hitY = height - LABEL_H - 8;
  const laneW = (width - LANE_GAP * (lanes - 1)) / lanes;
  return { hitY, laneW, pps: zoom * FALL_SPEED };
}

export function drawHighway(input: HighwayInput) {
  const { ctx, width, height, lanes, position, palette } = input;
  const { hitY, laneW, pps } = highwayGeometry(width - (input.rightInset ?? 0), height, lanes.length, input.zoom);
  const yOfTime = (t: number) => hitY - (t - position) * pps;
  const ahead = hitY / pps; // seconds visible above the line
  const live = input.ripples;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, width, height);

  // the dot grid falls with the notes
  dotGrid(ctx, { x: 0, y: 0, w: width, h: hitY }, 0, -position * pps, live ? input.energy : 0, position, palette);

  // bar lines (and beat lines when they're far enough apart), falling with the notes
  const beatSec = 60 / input.baseBpm;
  const showBeats = beatSec * pps >= 18;
  const firstBeat = Math.max(0, Math.floor(position / beatSec));
  const lastBeat = Math.ceil(Math.min(position + ahead, input.durationSeconds) / beatSec);
  for (let b = firstBeat; b <= lastBeat; b++) {
    const isBar = b % input.beatsPerBar === 0;
    if (!isBar && !showBeats) continue;
    const y = Math.round(yOfTime(b * beatSec)) + 0.5;
    if (y > hitY) continue;
    ctx.strokeStyle = isBar ? palette.ruleStrong : palette.rule;
    ctx.lineWidth = isBar ? 1.5 : 1;
    ctx.setLineDash(isBar ? [] : [2, 5]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  lanes.forEach((lane, i) => {
    const x0 = i * (laneW + LANE_GAP);
    const soloing = (lane.solos ?? []).some((s) => position >= s.start && position < s.end);
    // the lane: a wash of the member's colour, brighter in their solo
    ctx.fillStyle = lane.color;
    ctx.globalAlpha = soloing ? 0.2 : 0.08;
    roundRect(ctx, x0, 0, laneW, hitY + 4, 10);
    ctx.fill();
    // and a flash of it on each hit
    const flash = live && lane.audible ? laneFlash(lane.notes, position, lane.isDrums) : 0;
    if (flash > 0) {
      const glow = ctx.createLinearGradient(0, hitY - laneW * 2.5, 0, hitY);
      glow.addColorStop(0, "rgba(255,255,255,0)");
      glow.addColorStop(1, lane.color);
      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.55 * flash;
      ctx.fillRect(x0, hitY - laneW * 2.5, laneW, laneW * 2.5);
    }
    ctx.globalAlpha = 1;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, 0, laneW, hitY + 2);
    ctx.clip();
    const sparks = drawLaneNotes(ctx, lane, x0, laneW, hitY, position, ahead, yOfTime, live);
    if (lane.vocal && lane.vocal.notes.length > 0) {
      drawLaneVocal(ctx, lane.vocal.notes, lane.color, lane.audible && lane.vocal.on, x0, laneW, hitY, position, ahead, yOfTime);
    }
    ctx.restore();

    // the hit pad on the line, lit by the flash
    ctx.fillStyle = lane.color;
    ctx.globalAlpha = (lane.audible ? 0.55 : 0.2) + 0.45 * flash;
    pill(ctx, x0 + 3, hitY - 3, laneW - 6, 6);
    ctx.globalAlpha = 1;
    for (const sp of sparks) sparkle(ctx, sp.x, hitY, sp.age, sp.seed, lane.color, 1.35);

    // under the line: her pixel instrument, playing along
    const size = Math.min(SPRITE, laneW - 8);
    if (lane.instrument) {
      // on a light tile of her colour, so the ink outline shows on the dark frame
      ctx.fillStyle = lane.color;
      ctx.globalAlpha = (lane.audible ? 1 : 0.4) * 0.28;
      roundRect(ctx, x0 + (laneW - size) / 2 - 3, hitY + 8 - 3, size + 6, size + 6, 8);
      ctx.fill();
      ctx.globalAlpha = lane.audible ? 1 : 0.4;
      drawPixelInstrument(ctx, lane.instrument, poseAt(lane.notes, position, lane.instrument), x0 + (laneW - size) / 2, hitY + 8, size, lane.color, lane.leftHanded, lane.gear);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (soloing) {
      ctx.font = `800 11px ${FONT}`;
      ctx.fillStyle = lane.color;
      pill(ctx, x0 + laneW / 2 - 26, 8, 52, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText("SOLO ★", x0 + laneW / 2, 17.5);
    }
    ctx.textAlign = "start";
  });

  // the hit line itself, glowing
  ctx.save();
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = 10;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, hitY - 1, width, 2);
  ctx.restore();
}

interface Spark {
  x: number;
  age: number;
  seed: number;
}

/** One member's notes in their lane; returns the sparkles to throw at the hit line. */
function drawLaneNotes(
  ctx: CanvasRenderingContext2D,
  lane: LaneInput,
  x0: number,
  laneW: number,
  hitY: number,
  position: number,
  ahead: number,
  yOfTime: (t: number) => number,
  live: boolean,
): Spark[] {
  const sparks: Spark[] = [];
  const pad = Math.max(3, laneW * 0.08);
  const notes = lane.notes;
  let lastSpark = -1;
  if (lane.isDrums) {
    const g = Math.min(7, Math.max(3.5, laneW / 11));
    const cell = (laneW - 2 * pad) / DRUM_ROWS.length;
    for (let k = firstVisible(notes, position - DRUM_GLOW_SECONDS); k < notes.length; k++) {
      const n = notes[k]!;
      if (n.start > position + ahead) break;
      const voice = drumVoiceFor(n.pitch);
      const cx = x0 + pad + cell * (DRUM_ROWS.length - 1 - DRUM_ROWS.indexOf(voice)) + cell / 2;
      const age = position - n.start;
      if (age >= DRUM_GLOW_SECONDS) continue;
      if (live && lane.audible && age >= 0 && n.start !== lastSpark && ACCENTS.has(voice)) {
        lastSpark = n.start;
        sparks.push({ x: cx, age, seed: Math.round(n.start * 997) + n.pitch * 31 });
      }
      const hit = age >= 0;
      ctx.globalAlpha = (lane.audible ? 1 : 0.22) * (0.6 + 0.4 * n.velocity);
      if (hit && lane.audible) {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.shadowColor = lane.color;
        ctx.shadowBlur = 10;
        drumGlyph(ctx, voice, cx, hitY - g, g * 1.45, lane.color);
        ctx.restore();
      } else {
        drumGlyph(ctx, voice, cx, Math.min(hitY - g, yOfTime(n.start) - g), g, lane.color);
      }
    }
    ctx.globalAlpha = 1;
    return sparks;
  }

  const { lo, hi } = summarise(notes);
  const span = Math.max(12, hi - lo);
  const bottom = (lo + hi) / 2 - span / 2;
  const noteW = Math.min(12, Math.max(4, laneW * 0.16));
  const xOf = (pitch: number) => x0 + pad + ((pitch - bottom) / span) * (laneW - 2 * pad - noteW);
  const glowing: { x: number; top: number; h: number }[] = [];
  for (let k = firstVisible(notes, position); k < notes.length; k++) {
    const n = notes[k]!;
    if (n.start > position + ahead) break;
    const end = n.start + n.duration;
    if (end <= position) continue;
    const x = xOf(n.pitch);
    const top = yOfTime(end) + 1;
    const foot = Math.min(hitY, yOfTime(n.start) - 1);
    const h = Math.max(3, foot - top);
    const age = position - n.start;
    if (live && lane.audible && age >= 0 && age < SPARKLE_SECONDS && n.start !== lastSpark) {
      lastSpark = n.start;
      sparks.push({ x: x + noteW / 2, age, seed: Math.round(n.start * 997) + n.pitch * 31 });
    }
    if (age >= 0 && lane.audible) {
      glowing.push({ x, top, h });
      continue;
    }
    ctx.globalAlpha = (lane.audible ? 1 : 0.22) * (0.6 + 0.4 * n.velocity);
    ctx.fillStyle = "rgba(0, 0, 0, 0.14)";
    pill(ctx, x + 1, top, noteW, h);
    ctx.fillStyle = lane.color;
    pill(ctx, x, top, noteW, h);
    if (h > 8 && noteW >= 5) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      pill(ctx, x + 1, top + 2, 1.4, h - 4);
    }
  }
  // sounding notes on top: glowing, with a white rim
  ctx.globalAlpha = 1;
  for (const gl of glowing) {
    ctx.save();
    ctx.shadowColor = lane.color;
    ctx.shadowBlur = 12;
    ctx.fillStyle = lane.color;
    pill(ctx, gl.x - 1, gl.top, noteW + 2, gl.h);
    ctx.restore();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    roundRect(ctx, gl.x - 1, gl.top, noteW + 2, gl.h);
    ctx.stroke();
  }
  return sparks;
}

/** A sung line in the singer's lane: hollow notes outlined in her colour, filled while sung. */
function drawLaneVocal(
  ctx: CanvasRenderingContext2D,
  notes: readonly NoteEvent[],
  color: string,
  on: boolean,
  x0: number,
  laneW: number,
  hitY: number,
  position: number,
  ahead: number,
  yOfTime: (t: number) => number,
) {
  const { lo, hi } = summarise(notes);
  const span = Math.max(12, hi - lo);
  const bottom = (lo + hi) / 2 - span / 2;
  const pad = Math.max(3, laneW * 0.08);
  const w = Math.min(10, Math.max(4, laneW * 0.13));
  ctx.lineWidth = 1.5;
  for (let k = firstVisible(notes, position); k < notes.length; k++) {
    const n = notes[k]!;
    if (n.start > position + ahead) break;
    if (n.start + n.duration <= position) continue;
    const x = x0 + pad + ((n.pitch - bottom) / span) * (laneW - 2 * pad - w);
    const top = yOfTime(n.start + n.duration) + 1;
    const h = Math.max(3, Math.min(hitY, yOfTime(n.start) - 1) - top);
    const singing = on && n.start <= position;
    ctx.globalAlpha = on ? 1 : 0.25;
    roundRect(ctx, x, top, w, h);
    if (singing) {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.strokeStyle = singing ? "#fff" : color;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
