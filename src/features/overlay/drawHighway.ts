import { poseAt } from "@/features/band/pixelInstruments";
import { drawCritters } from "./stageCritters";
import { FIGURE_COLS, FIGURE_ROWS, IDLE_MEMBER, drawMemberPlaying, memberPoseAt } from "@/features/band/pixelMembers";
import { drumVoiceFor } from "@/lib/drums";
import type { NoteEvent } from "@/types/midi";
import {
  ACCENTS,
  DRUM_ROWS,
  FONT,
  SPARKLE_SECONDS,
  burstKind,
  dotGrid,
  drumGlyph,
  firstVisible,
  hitBurst,
  laneActivity,
  laneFlash,
  pill,
  roundRect,
  summarise,
  type BurstKind,
  type LaneInput,
  type Palette,
} from "@/features/timeline/drawTimeline";

/**
 * The falling-notes view of the recording frame, like a rhythm game seen from the stage:
 * one wide road, split into one lane per member (side by side, no gaps, faint lines
 * between them, each washed in her colour), running away to a vanishing point above the frame, notes
 * coming down it (growing as they near) and sounding as they reach a hit line near the
 * bottom, each member's pixel instrument under the line. Inside a lane, pitch runs left to
 * right (a little piano roll), so a tune keeps its shape; each note is a gem where it
 * starts with a thinner tail for as long as it holds, and the tail shrinks into the line
 * while it sounds. Drum hits sit in one column per drum sound (hi-hats and ride as small
 * dots), a sung line is one glowing thread, and each lane has a key on the line that
 * lights and presses on her hits. Only what is on screen is drawn.
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
  /** px kept clear on the right for Reels' icon column (overlay.fallRightInset); the left keeps the same, so the road stays centred */
  rightInset?: number;
  /**
   * The frame's safe area, when the box is the whole frame: the road starts `top` down and
   * keeps `side` in from each edge, and the band stands `bottom` up; the stage floor and
   * the wall behind still run to the edges (the stage fills the bottom, under Reels' caption)
   */
  insets?: { top: number; side: number; bottom: number };
  /** a looping take (the highlight): the pets' paths repeat once per loop */
  loop?: { start: number; length: number; at?: number };
  /** the outline colour of the pets (the theme's ink) */
  ink?: string;
}

/** Falling speed against the horizontal zoom: the frame is taller than it is wide. */
export const FALL_SPEED = 2.2;
/** lanes touch: one road, not five (the width a gap took goes to the notes) */
const LANE_GAP = 0;
/**
 * Under the hit line, a stage: the band stands on it as it does live, seen from the
 * audience (STAGE_ORDER: Mugi at her keyboard on the left, Mio, Yui in the middle, Azusa,
 * Ritsu's kit at the back on the right), each under her own lane, so the lanes follow the
 * same order in this view. Mugi and Ritsu are on the riser at the back, a little smaller.
 */
export const STAGE_ORDER = ["tsumugi", "mio", "yui", "azusa", "ritsu"] as const;
const FIGURE_W = 42;
const FIGURE_TALL = (FIGURE_W * FIGURE_ROWS) / FIGURE_COLS;
/** how much higher the riser puts the back row, and how much smaller it looks */
const RISER = 12;
const BACK_SCALE = 0.86;
const LABEL_H = FIGURE_TALL + 12;
export const STAGE = { floor: "#7a4f2e", plank: "#5f3b21", riser: "#5a3820", edge: "#b07a44" };
const BACK_ROW = new Set(["drums", "keys"]);
const DRUM_GLOW_SECONDS = 0.14;
/** The road's far end against its near end (smaller: a steeper view). */
const FAR_SCALE = 0.65;
/** Where the far end is, px from the top of the box. */
const ROAD_TOP = 14;
/** Notes reach the line this much faster than the flat speed (they slow towards the distance). */
const NEAR_BOOST = 1.4;
/** Notes fade in over this much of the scale at the far end, so they don't pop up. */
const FAR_FADE = 0.06;
/** Notes this close to the line (seconds) start to glow: they are what to watch. */
const APPROACH_SECONDS = 0.3;
/** A note's gem, px long on screen at the line (shorter further off). */
const HEAD_PX = 7;
/** A tail against the gem's width. */
const TAIL_WIDTH = 0.36;
/** Sung notes closer than this (seconds) are joined into one thread. */
const LEGATO_SECONDS = 0.3;
/** Drum sounds drawn as small dots: they keep time, the accents carry the beat. */
const TIME_KEEPERS = new Set(["closed-hat", "open-hat", "ride"]);

/** The road: hit line, lane width, and the perspective (`scale`, `project`) for a time ahead. */
export function highwayGeometry(width: number, height: number, lanes: number, zoom: number, top = 0, bottom = 0) {
  const hitY = height - bottom - LABEL_H - 8;
  const roadTop = ROAD_TOP + top;
  const laneW = (width - LANE_GAP * (lanes - 1)) / lanes;
  const pps = zoom * FALL_SPEED;
  // the vanishing point sits above the box, so the far end lands on ROAD_TOP at FAR_SCALE
  const vanishY = (roadTop - FAR_SCALE * hitY) / (1 - FAR_SCALE);
  /** seconds ahead at which a note is drawn half size */
  const depth = (hitY - vanishY) / (pps * NEAR_BOOST);
  const ahead = depth * (1 / FAR_SCALE - 1);
  const vanishX = width / 2;
  const scale = (d: number) => 1 / (1 + Math.max(-0.5 * depth, d) / depth);
  /** a point `xNear` across the road (at the line) and `d` seconds ahead, on screen */
  const project = (xNear: number, d: number) => {
    const s = scale(d);
    return { x: vanishX + (xNear - vanishX) * s, y: vanishY + (hitY - vanishY) * s, s };
  };
  /** the time ahead that is drawn at screen height `y` */
  const timeAt = (y: number) => depth * ((hitY - vanishY) / (y - vanishY) - 1);
  return { hitY, roadTop, laneW, pps, ahead, depth, scale, project, timeAt };
}

type Geometry = ReturnType<typeof highwayGeometry>;

/** A strip of the road from `xl` to `xr` (near-end x), `d0` to `d1` seconds ahead, as a path. */
function quad(ctx: CanvasRenderingContext2D, g: Geometry, xl: number, xr: number, d0: number, d1: number) {
  const a = g.project(xl, d0);
  const b = g.project(xr, d0);
  const c = g.project(xr, d1);
  const e = g.project(xl, d1);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(e.x, e.y);
  ctx.closePath();
}

/** How visible something is at scale `s`: fading in at the far end. */
const farFade = (s: number) => Math.min(1, Math.max(0, (s - FAR_SCALE) / FAR_FADE));

export function drawHighway(input: HighwayInput) {
  const { ctx, width, height, position, palette } = input;
  const place = (m: string | undefined) => (m ? (STAGE_ORDER as readonly string[]).indexOf(m) : -1);
  const lanes = [...input.lanes].sort((a, b) => place(a.member) - place(b.member));
  // the same margin on both sides, so the road (and its vanishing point) stays centred
  // while its right edge keeps clear of Reels' icons
  const insets = input.insets ?? { top: 0, side: 0, bottom: 0 };
  const side = insets.side + (input.rightInset ?? 0);
  const roadW = width - 2 * side;
  const g = highwayGeometry(roadW, height, lanes.length, input.zoom, insets.top, insets.bottom);
  const { hitY, laneW, ahead } = g;
  const near = g.timeAt(hitY + 4); // a little past the line, so the lanes run under the pads
  const live = input.ripples;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.surface;
  ctx.fillRect(0, 0, width, height);

  // the dot grid stays behind as the back wall; the road covers most of it
  dotGrid(ctx, { x: 0, y: 0, w: width, h: hitY }, 0, 0, live ? input.energy : 0, position, palette);
  ctx.save();
  ctx.translate(side, 0);
  ctx.fillStyle = palette.surface;
  ctx.globalAlpha = 0.75;
  quad(ctx, g, 0, roadW, ahead, near);
  ctx.fill();
  ctx.globalAlpha = 1;

  // bar lines (and beat lines where they're far enough apart), coming down the road
  const beatSec = 60 / input.baseBpm;
  const firstBeat = Math.max(0, Math.ceil(position / beatSec));
  const lastBeat = Math.floor(Math.min(position + ahead, input.durationSeconds) / beatSec);
  for (let b = firstBeat; b <= lastBeat; b++) {
    const d = b * beatSec - position;
    const isBar = b % input.beatsPerBar === 0;
    const s = g.scale(d);
    // on screen a beat is this many px long here
    if (!isBar && beatSec * g.pps * NEAR_BOOST * s * s < 14) continue;
    const l = g.project(0, d);
    const r = g.project(roadW, d);
    ctx.strokeStyle = isBar ? palette.ruleStrong : palette.rule;
    ctx.globalAlpha = farFade(s);
    ctx.lineWidth = (isBar ? 1.5 : 1) * Math.max(0.6, s);
    ctx.setLineDash(isBar ? [] : [2, 5]);
    ctx.beginPath();
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  drawStage(ctx, -side, width, hitY, height, insets.bottom);
  // the pets wander the front of the stage (in the bottom band when there is one, at the
  // band's feet when not)
  drawCritters({
    ctx,
    x: -side + 8,
    width: width - 16,
    floorY: insets.bottom > 24 ? height - insets.bottom * 0.35 : height - 3,
    unit: Math.max(1.5, Math.min(3, width / 140)),
    position,
    live,
    ink: input.ink ?? palette.ink,
    loop: input.loop,
  });
  const keys: { x0: number; color: string; audible: boolean; flash: number; sparks: Spark[] }[] = [];
  lanes.forEach((lane, i) => {
    const x0 = i * (laneW + LANE_GAP);
    const x1 = x0 + laneW;
    const soloing = (lane.solos ?? []).some((s) => position >= s.start && position < s.end);
    // the lane: a wash of the member's colour, deeper towards the hit line, brighter while
    // she plays (quiet lanes dim, so the eye goes to whoever plays) and in her solo
    const playing = live && lane.audible ? laneActivity(lane.notes, position, lane.isDrums) : 0;
    const wash = ctx.createLinearGradient(0, g.roadTop, 0, hitY);
    wash.addColorStop(0, "rgba(255,255,255,0)");
    wash.addColorStop(1, lane.color);
    ctx.fillStyle = soloing ? lane.color : wash;
    ctx.globalAlpha = soloing ? 0.2 : 0.05 + 0.13 * playing;
    quad(ctx, g, x0, x1, ahead, near);
    ctx.fill();
    // a stage light down the lane from the far end, up while she plays
    if (playing > 0) {
      const beam = ctx.createLinearGradient(0, g.roadTop, 0, g.roadTop + (hitY - g.roadTop) * 0.55);
      beam.addColorStop(0, lane.color);
      beam.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = beam;
      ctx.globalAlpha = 0.16 * playing;
      quad(ctx, g, x0, x1, ahead, 0);
      ctx.fill();
    }
    // and a flash of it near the line on each hit
    const flash = live && lane.audible ? laneFlash(lane.notes, position, lane.isDrums) : 0;
    if (flash > 0) {
      const top = hitY - laneW * 2.5;
      const glow = ctx.createLinearGradient(0, top, 0, hitY);
      glow.addColorStop(0, "rgba(255,255,255,0)");
      glow.addColorStop(1, lane.color);
      ctx.fillStyle = glow;
      ctx.globalAlpha = 0.45 * flash;
      quad(ctx, g, x0, x1, g.timeAt(top), 0);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.save();
    quad(ctx, g, x0, x1, ahead, g.timeAt(hitY + 2));
    ctx.clip();
    // the sung thread first: a singer often doubles her own tune, and her gems sit on it
    if (lane.vocal && lane.vocal.notes.length > 0) {
      drawLaneVocal(ctx, g, lane.vocal.notes, lane.color, lane.audible && lane.vocal.on, x0, position);
    }
    const sparks = drawLaneNotes(ctx, g, lane, x0, position, live);
    ctx.restore();

    keys.push({ x0, color: lane.color, audible: lane.audible, flash, sparks });

    // on the stage: the member playing (a hop on her notes, her hands on a hit, a blink, her
    // mouth open while she sings), in a spotlight of her colour that flares on her hits
    if (lane.instrument && lane.member) {
      const back = BACK_ROW.has(lane.instrument);
      const w = Math.min(FIGURE_W, laneW - 2) * (back ? BACK_SCALE : 1);
      const tall = (w * FIGURE_ROWS) / FIGURE_COLS;
      const feet = height - insets.bottom - 4 - (back ? RISER : 0);
      const cx = x0 + laneW / 2;
      ctx.save();
      ctx.fillStyle = lane.color;
      ctx.globalAlpha = (lane.audible ? 1 : 0.4) * (0.18 + 0.15 * playing + 0.35 * flash);
      ctx.beginPath();
      ctx.ellipse(cx, feet - 2, w * 0.55, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      const beam = ctx.createLinearGradient(0, feet - tall, 0, feet);
      beam.addColorStop(0, "rgba(255,255,255,0)");
      beam.addColorStop(1, lane.color);
      ctx.fillStyle = beam;
      ctx.globalAlpha = (lane.audible ? 1 : 0.4) * (0.08 + 0.2 * flash);
      ctx.fillRect(cx - w * 0.55, feet - tall, w * 1.1, tall);
      ctx.translate(cx, feet);
      ctx.scale(1 + 0.04 * flash, 1 + 0.04 * flash);
      ctx.translate(-cx, -feet);
      ctx.globalAlpha = lane.audible ? 1 : 0.4;
      const member = live ? memberPoseAt(lane.member, lane.notes, lane.vocal?.on ? lane.vocal.notes : undefined, position, lane.isDrums) : IDLE_MEMBER;
      drawMemberPlaying(
        ctx,
        lane.member,
        lane.instrument,
        member,
        poseAt(lane.notes, position, lane.instrument),
        cx - w / 2,
        feet - tall,
        w,
        lane.color,
        lane.leftHanded,
        lane.gear,
        palette.ink,
      );
      ctx.restore();
    }
    if (soloing) {
      // at the lane's far end, where her notes come from
      const cx = g.project(x0 + laneW / 2, ahead).x;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 11px ${FONT}`;
      ctx.fillStyle = lane.color;
      pill(ctx, cx - 26, g.roadTop + 2, 52, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText("SOLO ★", cx, g.roadTop + 11.5);
      ctx.textAlign = "start";
    }
  });

  // faint lines between the members' lanes, then the road's edges and the hit line, glowing
  ctx.save();
  ctx.strokeStyle = palette.ruleStrong;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  for (let i = 1; i < lanes.length; i++) {
    const x = i * laneW;
    const far = g.project(x, ahead);
    const end = g.project(x, 0);
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.strokeStyle = palette.accent;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = 1.5;
  for (const x of [0, roadW]) {
    const far = g.project(x, ahead);
    const end = g.project(x, 0);
    ctx.beginPath();
    ctx.moveTo(far.x, far.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.85;
  ctx.shadowColor = palette.accent;
  ctx.shadowBlur = 5;
  ctx.fillStyle = palette.accent;
  ctx.fillRect(0, hitY - 1, roadW, 2);
  ctx.restore();

  // each lane's key on the line: dim at rest, lit and pressed down on her hits; the bursts over it
  for (const k of keys) drawKey(ctx, k.x0 + 4, hitY, laneW - 8, k.color, k.audible, k.flash);
  for (const k of keys) for (const sp of k.sparks) hitBurst(ctx, sp.kind, sp.x, hitY, sp.age, sp.seed, k.color, 1.35);
  ctx.restore(); // the side margin
}

/** A lane's key on the hit line, `flash` (0–1) pressing it down and lighting it. */
function drawKey(ctx: CanvasRenderingContext2D, x: number, hitY: number, w: number, color: string, audible: boolean, flash: number) {
  const h = 9;
  const depth = 3;
  const press = depth * flash;
  const top = hitY - h / 2 + press;
  ctx.save();
  // its side, which shows less as it goes down
  ctx.fillStyle = color;
  ctx.globalAlpha = audible ? 0.35 : 0.15;
  roundRect(ctx, x, top + depth - press, w, h, 4);
  ctx.fill();
  // its face
  ctx.fillStyle = color;
  ctx.globalAlpha = (audible ? 0.4 : 0.15) + 0.55 * flash;
  if (flash > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * flash;
  }
  roundRect(ctx, x, top, w, h, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = color;
  ctx.globalAlpha = audible ? 0.9 : 0.35;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  if (flash > 0) {
    ctx.fillStyle = "#fff";
    ctx.globalAlpha = 0.55 * flash;
    roundRect(ctx, x + 3, top + 2, w - 6, 2, 1);
    ctx.fill();
  }
  ctx.restore();
}

/** The stage under the hit line: a plank floor, the riser across the back. */
function drawStage(ctx: CanvasRenderingContext2D, x: number, width: number, hitY: number, height: number, bottom: number) {
  const top = hitY + 8;
  const riserFront = height - bottom - 4 - RISER;
  ctx.save();
  ctx.translate(x, 0);
  ctx.fillStyle = STAGE.riser;
  ctx.fillRect(0, top, width, riserFront - top);
  ctx.fillStyle = STAGE.floor;
  ctx.fillRect(0, riserFront, width, height - riserFront);
  ctx.fillStyle = STAGE.plank;
  for (let y = riserFront + 5; y < height; y += 5) ctx.fillRect(0, Math.round(y), width, 1);
  for (let y = top + 6; y < riserFront - 2; y += 6) ctx.fillRect(0, Math.round(y), width, 1);
  // the riser's front edge, catching the light
  ctx.fillStyle = STAGE.edge;
  ctx.fillRect(0, riserFront - 2, width, 2);
  ctx.restore();
}

interface Spark {
  x: number;
  age: number;
  seed: number;
  kind: BurstKind;
}

/** One member's notes in their lane; returns the sparkles to throw at the hit line. */
function drawLaneNotes(ctx: CanvasRenderingContext2D, g: Geometry, lane: LaneInput, x0: number, position: number, live: boolean): Spark[] {
  const { laneW, hitY, ahead } = g;
  const sparks: Spark[] = [];
  const pad = Math.max(3, laneW * 0.08);
  const notes = lane.notes;
  let lastSpark = -1;
  if (lane.isDrums) {
    const gl = Math.min(8.5, Math.max(3.5, laneW / 9));
    const cell = (laneW - 2 * pad) / DRUM_ROWS.length;
    for (let k = firstVisible(notes, position - DRUM_GLOW_SECONDS); k < notes.length; k++) {
      const n = notes[k]!;
      const d = n.start - position;
      if (d > ahead) break;
      const voice = drumVoiceFor(n.pitch);
      const cx = x0 + pad + cell * (DRUM_ROWS.length - 1 - DRUM_ROWS.indexOf(voice)) + cell / 2;
      const age = -d;
      if (age >= DRUM_GLOW_SECONDS) continue;
      if (live && lane.audible && age >= 0 && n.start !== lastSpark && ACCENTS.has(voice)) {
        lastSpark = n.start;
        sparks.push({ x: cx, age, seed: Math.round(n.start * 997) + n.pitch * 31, kind: burstKind(undefined, voice) });
      }
      // hats, rides and toms lighter and smaller than kick, snare and crash
      const accent = ACCENTS.has(voice);
      const dot = TIME_KEEPERS.has(voice);
      if (age >= 0 && lane.audible) {
        ctx.save();
        ctx.globalAlpha = dot ? 0.8 : 1;
        ctx.shadowColor = lane.color;
        ctx.shadowBlur = dot ? 5 : 10;
        if (dot) {
          ctx.fillStyle = lane.color;
          ctx.beginPath();
          ctx.arc(cx, hitY - gl, gl * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else drumGlyph(ctx, voice, cx, hitY - gl, gl * 1.45, lane.color);
        ctx.restore();
        continue;
      }
      const p = g.project(cx, Math.max(0, d));
      const size = (accent ? gl : gl * 0.8) * p.s;
      ctx.globalAlpha = (lane.audible ? 1 : 0.22) * (0.6 + 0.4 * n.velocity) * (accent ? 1 : dot ? 0.55 : 0.6) * farFade(p.s);
      if (dot) {
        ctx.fillStyle = lane.color;
        ctx.beginPath();
        ctx.arc(p.x, Math.min(hitY - gl, p.y - size), Math.max(1.2, gl * 0.32 * p.s), 0, Math.PI * 2);
        ctx.fill();
      } else drumGlyph(ctx, voice, p.x, Math.min(hitY - gl, p.y - size), size, lane.color);
    }
    ctx.globalAlpha = 1;
    return sparks;
  }

  const { lo, hi } = summarise(notes);
  const span = Math.max(12, hi - lo);
  const bottom = (lo + hi) / 2 - span / 2;
  const noteW = Math.min(17, Math.max(4, laneW * 0.23));
  const xOf = (pitch: number) => x0 + pad + ((pitch - bottom) / span) * (laneW - 2 * pad - noteW);
  const tailW = Math.max(2, noteW * TAIL_WIDTH);
  const glowing: { x: number; d0: number; d1: number; head: number }[] = [];
  for (let k = firstVisible(notes, position); k < notes.length; k++) {
    const n = notes[k]!;
    const d0 = Math.max(0, n.start - position);
    if (d0 > ahead) break;
    const end = n.start + n.duration;
    if (end <= position) continue;
    const s0 = g.scale(d0);
    // the gem: HEAD_PX on screen, whatever the note's length; the tail runs to its end
    const head = Math.min(ahead, d0 + pxToSeconds(g, HEAD_PX * s0, s0));
    const d1 = Math.min(ahead, end - position);
    const x = xOf(n.pitch);
    const age = position - n.start;
    if (live && lane.audible && age >= 0 && age < SPARKLE_SECONDS && n.start !== lastSpark) {
      lastSpark = n.start;
      sparks.push({ x: x + noteW / 2, age, seed: Math.round(n.start * 997) + n.pitch * 31, kind: burstKind(lane.instrument) });
    }
    if (age >= 0 && lane.audible) {
      glowing.push({ x, d0, d1, head });
      continue;
    }
    const nearness = (s0 - FAR_SCALE) / (1 - FAR_SCALE);
    const alpha = (lane.audible ? 1 : 0.22) * (0.6 + 0.4 * n.velocity) * (0.75 + 0.25 * nearness) * farFade(s0);
    ctx.fillStyle = lane.color;
    if (d1 > head) {
      ctx.globalAlpha = alpha * 0.7;
      quad(ctx, g, x + (noteW - tailW) / 2, x + (noteW + tailW) / 2, head, d1);
      ctx.fill();
    }
    ctx.globalAlpha = alpha;
    quad(ctx, g, x, x + noteW, d0, head);
    const coming = lane.audible && live ? 1 - d0 / APPROACH_SECONDS : 0;
    if (coming > 0) {
      ctx.save();
      ctx.shadowColor = lane.color;
      ctx.shadowBlur = 6 * coming;
      ctx.fill();
      ctx.restore();
    } else ctx.fill();
    gemShine(ctx, g, x, noteW, d0, head, s0);
  }
  // sounding notes on top: the tail glowing as it shrinks into the line, the gem held on it
  ctx.globalAlpha = 1;
  for (const gl of glowing) {
    ctx.save();
    ctx.shadowColor = lane.color;
    ctx.shadowBlur = 8;
    ctx.fillStyle = lane.color;
    if (gl.d1 > gl.head) {
      quad(ctx, g, gl.x + (noteW - tailW) / 2 - 0.5, gl.x + (noteW + tailW) / 2 + 0.5, gl.head, gl.d1);
      ctx.fill();
    }
    quad(ctx, g, gl.x - 1, gl.x + noteW + 1, gl.d0, gl.head);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.2;
    quad(ctx, g, gl.x - 1, gl.x + noteW + 1, gl.d0, gl.head);
    ctx.stroke();
  }
  return sparks;
}

/** Seconds ahead that `px` screen px take up at scale `s` (a beat is shorter far off). */
function pxToSeconds(g: Geometry, px: number, s: number) {
  return px / (g.pps * NEAR_BOOST * s * s);
}

/** A gem's shine: a light band across its far half. */
function gemShine(ctx: CanvasRenderingContext2D, g: Geometry, x: number, w: number, d0: number, head: number, s: number) {
  if (w * s < 5) return;
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.globalAlpha *= 0.45;
  quad(ctx, g, x + 1.5, x + w - 1.5, d0 + (head - d0) * 0.5, d0 + (head - d0) * 0.85);
  ctx.fill();
  ctx.restore();
}

/**
 * A sung line in the singer's lane: one thread through the tune (across the lane by pitch,
 * notes closer than LEGATO_SECONDS joined), glowing in her colour with a white core, so it
 * reads apart from her own instrument's gems. Faint when the vocal is switched off.
 */
function drawLaneVocal(ctx: CanvasRenderingContext2D, g: Geometry, notes: readonly NoteEvent[], color: string, on: boolean, x0: number, position: number) {
  const { laneW, ahead } = g;
  const { lo, hi } = summarise(notes);
  const span = Math.max(12, hi - lo);
  const bottom = (lo + hi) / 2 - span / 2;
  const pad = Math.max(4, laneW * 0.1);
  ctx.beginPath();
  let lastEnd = -Infinity;
  for (let k = firstVisible(notes, position); k < notes.length; k++) {
    const n = notes[k]!;
    const d0 = Math.max(0, n.start - position);
    if (d0 > ahead) break;
    const end = n.start + n.duration;
    if (end <= position) {
      lastEnd = end;
      continue;
    }
    const x = x0 + pad + ((n.pitch - bottom) / span) * (laneW - 2 * pad);
    const a = g.project(x, d0);
    const b = g.project(x, Math.min(ahead, Math.max(end - position, d0 + pxToSeconds(g, 3, a.s))));
    if (n.start - lastEnd < LEGATO_SECONDS) ctx.lineTo(a.x, a.y);
    else ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    lastEnd = end;
  }
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.globalAlpha = on ? 0.6 : 0.15;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = on ? 4 : 0;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#fff";
  ctx.globalAlpha = on ? 0.7 : 0.15;
  ctx.lineWidth = 1.1;
  ctx.stroke();
  ctx.restore();
}
