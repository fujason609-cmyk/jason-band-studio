import { IDLE_POSE, pixelGrid } from "@/features/band/pixelInstruments";
import { drawMemberCheering, drawMemberPlaying } from "@/features/band/pixelMembers";
import type { MemberId } from "@/features/band/types";
import { FONT, cheers, type LaneInput } from "@/features/timeline/drawTimeline";
import { detectKey } from "@/lib/soloRound";
import type { NoteEvent } from "@/types/midi";
import type { StudioProject } from "@/types/project";
import { songTitleFromFileName } from "@/services/file/midiFileService";
import type { IntroTitle } from "./overlay";
import { STAGE_ORDER } from "./drawHighway";
import { CURTAIN, PLACES, cone, paintCurtains, paintStageSet, stageLayout } from "./stageScene";

/**
 * The recording's opening hook: before the music, the pixel band acts out a tiny skit on a
 * stage behind curtains (no words: speech bubbles with pixel icons), then Ritsu counts the
 * song in on her hi-hat, sticks raised, and the scene fades into the score on the downbeat.
 * Which skit plays comes from the song itself (`planIntro`): its tempo, key, whether it is
 * sung and who plays first. Everything here is a function of the time since the intro
 * began, so the video and the screen show the same frames.
 */

/** Seconds of skit before the count-in. */
export const INTRO_SECONDS = 2;
/** A count-in longer than this (a slow song) counts every other beat instead. */
const MAX_COUNT_SECONDS = 2.6;

export type SkitKind = "hype" | "spotlight" | "singer" | "opener";

export interface IntroPlan {
  kind: SkitKind;
  /** whom the skit is about */
  star: MemberId;
  /** hi-hat hits in the count-in */
  beats: number;
  secondsPerBeat: number;
  /** the song's name, on the sign over the stage */
  title: string;
}

/**
 * The name on the sign: the song's name is the score's title (the file's name when the
 * score has none, and for MIDI files), or the name of the file it came from.
 */
export function introTitle(project: StudioProject, source: IntroTitle): string {
  const file = project.midiMeta?.fileName;
  return (source === "file" && file ? songTitleFromFileName(file) : project.name).trim();
}

/** Hits in the count-in: one bar, halved while a slow bar would drag (4 → 2 at 80 BPM). */
export function countInBeats(beatsPerBar: number, secondsPerBeat: number): number {
  let beats = Math.max(2, Math.round(beatsPerBar));
  while (beats * secondsPerBeat > MAX_COUNT_SECONDS && beats % 2 === 0 && beats > 2) beats /= 2;
  return beats;
}

/**
 * The skit for the stretch of the song about to be recorded (`from`–`to`, song seconds):
 * a slow or sad song gets a spotlight finding whoever carries the tune; a sung one, the
 * singer stepping up; a fast one, the band hyped (Ritsu first); anything else, whoever
 * plays first realising it's her, a bandmate nudging her, and her getting ready.
 */
export function planIntro(
  project: StudioProject,
  from = 0,
  to = project.durationSeconds,
  titleFrom: IntroTitle = "score",
): IntroPlan {
  const secondsPerBeat = 60 / project.bpm;
  const beats = countInBeats(project.beatsPerBar, secondsPerBeat);
  const title = introTitle(project, titleFrom);
  const inside = (n: NoteEvent) => n.start >= from - 1e-6 && n.start < to;
  const weight = new Map<MemberId, number>();
  let first: { member: MemberId; at: number } | null = null;
  let sung: MemberId | null = null;
  const pitched: NoteEvent[] = [];
  for (const track of project.tracks) {
    const notes = track.notes.filter(inside);
    const vocal = (track.vocal ?? []).filter(inside);
    if (vocal.length && (!sung || track.memberId === "yui")) sung = track.memberId;
    const drums = track.instrument === "drums";
    if (!drums) pitched.push(...notes);
    pitched.push(...vocal);
    weight.set(track.memberId, (drums ? 0 : notes.length) + 1.5 * vocal.length);
    for (const n of [...notes, ...vocal]) {
      if (!first || n.start < first.at - 1e-6) first = { member: track.memberId, at: n.start };
    }
  }
  let lead: MemberId = "yui";
  for (const [member, w] of weight) if (w > (weight.get(lead) ?? 0)) lead = member;
  const bpm = project.bpm;
  const minor = pitched.length > 0 && detectKey(pitched).minor;
  if (bpm < 100 || (minor && bpm < 130))
    return { kind: "spotlight", star: sung ?? lead, beats, secondsPerBeat, title };
  if (sung) return { kind: "singer", star: sung, beats, secondsPerBeat, title };
  if (bpm >= 150) return { kind: "hype", star: "ritsu", beats, secondsPerBeat, title };
  return { kind: "opener", star: first?.member ?? lead, beats, secondsPerBeat, title };
}

export type Bubble = "!" | "?" | "note" | "heart" | "drop" | "star";

export interface Actor {
  /** offset across the stage, in figure widths */
  x: number;
  /** lift off the floor, in figure heights (negative: stepped forward, towards the audience) */
  y: number;
  scale: number;
  hop: number;
  blink: boolean;
  singing: boolean;
  bubble: Bubble | null;
  /** seconds since the bubble appeared (it pops in) */
  bubbleAge: number;
}

export interface SkitFrame {
  /** 0 closed, 1 open */
  curtain: number;
  /** how dark the stage is (the spotlight skit), 0–1 */
  dim: number;
  /** where the spotlight is, in stage slots (0 = Mugi's place … 4 = Ritsu's), or null */
  spot: number | null;
  actors: Record<MemberId, Actor>;
  /** the count-in: which hit (0-based) and seconds since it, or null during the skit */
  beat: { index: number; age: number } | null;
  /** the whole scene's opacity: it fades out over the last half beat */
  fade: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ease = (v: number) => {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
};
/** 0 → 1 → 0 over [start, start + length] */
const arc = (t: number, start: number, length: number) =>
  t < start || t > start + length ? 0 : Math.sin((Math.PI * (t - start)) / length);

/** The skit `t` seconds after the intro began (the count-in follows at INTRO_SECONDS). */
export function skitFrame(plan: IntroPlan, t: number): SkitFrame {
  const slot = (m: MemberId) => STAGE_ORDER.indexOf(m as (typeof STAGE_ORDER)[number]);
  const star = plan.star;
  const actors = {} as Record<MemberId, Actor>;
  for (const m of STAGE_ORDER) {
    // everyone blinks once, at her own time
    const blinkAt = 0.8 + 0.23 * slot(m);
    actors[m] = {
      x: 0,
      y: 0,
      scale: 1,
      hop: 0,
      blink: t > blinkAt && t < blinkAt + 0.12,
      singing: false,
      bubble: null,
      bubbleAge: 0,
    };
  }
  const say = (m: MemberId, bubble: Bubble, from: number, to: number) => {
    if (t >= from && t < to) Object.assign(actors[m], { bubble, bubbleAge: t - from });
  };
  const jump = (m: MemberId, start: number, length: number, height: number) => {
    const a = arc(t, start, length);
    if (a > 0) {
      actors[m].y = Math.max(actors[m].y, a * height);
      actors[m].hop = 1;
    }
  };
  let dim = 0;
  let spot: number | null = null;
  const skit = Math.min(t, INTRO_SECONDS);

  switch (plan.kind) {
    case "hype":
      say("ritsu", "!", 0.35, 1.0);
      STAGE_ORDER.forEach((m, i) => jump(m, 0.45 + 0.15 * i, 0.3, 0.16));
      for (const m of STAGE_ORDER) {
        jump(m, 1.45, 0.4, 0.24);
        say(m, "star", 1.45, INTRO_SECONDS);
      }
      break;
    case "singer": {
      const forward = ease((skit - 0.4) / 0.5);
      Object.assign(actors[star], { scale: 1 + 0.16 * forward, y: -0.05 * forward });
      say(star, "note", 0.95, INTRO_SECONDS);
      actors[star].singing = t > 1.0 && t < 1.9 && Math.floor((t - 1.0) / 0.22) % 2 === 0;
      STAGE_ORDER.filter((m) => m !== star).forEach((m, k) => {
        say(m, "heart", 1.15 + 0.1 * k, INTRO_SECONDS);
        jump(m, 1.15 + 0.1 * k, 0.22, 0.08);
      });
      break;
    }
    case "spotlight": {
      dim = ease((t - 0.25) / 0.35);
      if (t >= 0.6) spot = slot(star) * ease((t - 0.6) / 0.7);
      say(star, "note", 1.3, INTRO_SECONDS);
      jump(star, 1.3, 0.3, 0.1);
      actors[star].singing = t > 1.35 && t < 1.9 && Math.floor((t - 1.35) / 0.25) % 2 === 0;
      break;
    }
    case "opener": {
      // her neighbour on stage gives the nudge
      const s = slot(star);
      const buddy = STAGE_ORDER[s + 1 < STAGE_ORDER.length ? s + 1 : s - 1]!;
      say(star, "?", 0.4, 0.95);
      if (t >= 0.4 && t < 0.95) actors[star].x = 0.06 * Math.sin((t - 0.4) * 14);
      say(star, "drop", 0.95, 1.5);
      if (t >= 0.95 && t < 1.4) actors[star].x = 0.025 * Math.sin(t * 90);
      say(buddy, "!", 1.2, 1.7);
      jump(buddy, 1.2, 0.25, 0.1);
      say(star, "note", 1.55, INTRO_SECONDS);
      jump(star, 1.55, 0.3, 0.14);
      break;
    }
  }

  let beat: SkitFrame["beat"] = null;
  let fade = 1;
  if (t >= INTRO_SECONDS) {
    const since = t - INTRO_SECONDS;
    const index = Math.min(plan.beats - 1, Math.floor(since / plan.secondsPerBeat));
    beat = { index, age: since - index * plan.secondsPerBeat };
    for (const m of STAGE_ORDER)
      Object.assign(actors[m], { bubble: null, singing: false, y: Math.max(0, actors[m].y) });
    // the band bobs on the count; Ritsu's sticks are drawn by the scene
    if (beat.age < 0.12) for (const m of STAGE_ORDER) actors[m].hop = 1;
    const out = (plan.beats - 0.5) * plan.secondsPerBeat;
    fade = 1 - clamp01((since - out) / (0.5 * plan.secondsPerBeat));
    if (plan.kind === "spotlight") spot = slot(star);
  }
  return { curtain: ease(t / 0.4), dim, spot, actors, beat, fade };
}

/** How long the whole intro lasts, skit and count-in, in seconds. */
export function introLength(plan: IntroPlan) {
  return INTRO_SECONDS + plan.beats * plan.secondsPerBeat;
}

/** Pixel icons in the speech bubbles, 7 × 7, and their colours. */
const ICONS: Record<Bubble, { color: string; rows: readonly string[] }> = {
  "!": {
    color: "#e8384f",
    rows: ["..XXX..", "..XXX..", "..XXX..", "..XXX..", ".......", "..XXX..", "..XXX.."],
  },
  "?": {
    color: "#3b3b58",
    rows: [".XXXXX.", "XX...XX", "....XX.", "...XX..", "...XX..", ".......", "...XX.."],
  },
  note: {
    color: "#7a5cff",
    rows: ["...XXX.", "...X.XX", "...X..X", "...X...", ".XXX...", "XXXX...", ".XX...."],
  },
  heart: {
    color: "#ff6f9f",
    rows: [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X...", "......."],
  },
  drop: {
    color: "#4fb3ff",
    rows: ["...X...", "..XXX..", ".XXXXX.", ".XXXXX.", "XXXXXXX", ".XXXXX.", "..XXX.."],
  },
  star: {
    color: "#ffc533",
    rows: ["...X...", "..XXX..", "XXXXXXX", ".XXXXX.", "..XXX..", ".XX.XX.", ".X...X."],
  },
};

export interface IntroArea {
  width: number;
  /** the scene's height (the frame above the key strip) */
  height: number;
  safeTop: number;
  safeSide: number;
  safeBottom: number;
}

/**
 * Paint the intro `t` seconds in over everything above the key strip: the back wall, the
 * stage floor, the band with their instruments (colours and gear from `lanes`), bubbles,
 * Ritsu's sticks and count, and the curtains. Fades out on the count's last half beat.
 */
export function drawIntro(
  ctx: CanvasRenderingContext2D,
  area: IntroArea,
  plan: IntroPlan,
  t: number,
  lanes: readonly LaneInput[],
  ink: string,
) {
  const f = skitFrame(plan, t);
  if (f.fade <= 0) return;
  const { width, height, safeTop, safeSide, safeBottom } = area;
  const contentW = width - 2 * safeSide;
  const contentH = height - safeTop - safeBottom;
  // the front row on the floor, the riser behind it, as tall as a girl, for the back row
  const stage = stageLayout({ left: safeSide, width: contentW, feet: height - safeBottom - contentH * 0.1, maxFigure: 150 });
  const { fw, riserTop, place } = stage;

  ctx.save();
  ctx.globalAlpha = f.fade;
  paintStageSet(ctx, width, stage, 0, height);

  // each member's light, in her colour (only the spotlight while the stage is dark)
  const laneOf = (m: MemberId) => lanes.find((l) => l.member === m);
  for (const m of STAGE_ORDER) {
    const lane = laneOf(m);
    const p = place(m);
    if (lane) cone(ctx, p.x, safeTop, p.feet, p.w, lane.color, f.fade * 0.22 * (1 - f.dim));
  }

  const drawActor = (m: MemberId) => {
    const lane = laneOf(m);
    const a = f.actors[m];
    if (!lane?.instrument) return;
    const p = place(m);
    const w = p.w * a.scale;
    const h = p.h * a.scale;
    const cx = p.x + a.x * p.w;
    const base = p.feet - a.y * p.h;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx, p.feet - 2, w * 0.45, w * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    if (cheers(lane)) {
      // she has nothing in this song: penlights up, waving every 0.3 s
      const step = Math.floor(t / 0.3);
      const pose = { hop: a.hop, blink: a.blink, singing: a.singing, bob: 0, wave: step % 2, sway: Math.cos((Math.PI * t) / 0.3) };
      drawMemberCheering(ctx, m, pose, cx - w / 2, base - h, w, lane.color, ink);
      if (a.bubble) drawBubble(ctx, cx, base - h - p.w * 0.05, p.w * 0.45, a.bubble, a.bubbleAge, ink);
      return;
    }
    drawMemberPlaying(
      ctx,
      m,
      lane.instrument,
      { hop: a.hop, blink: a.blink, singing: a.singing, bob: 0 },
      IDLE_POSE,
      cx - w / 2,
      base - h,
      w,
      lane.color,
      lane.leftHanded,
      lane.gear,
      ink,
    );
    if (a.bubble)
      drawBubble(ctx, cx, base - h - p.w * 0.05, p.w * 0.45, a.bubble, a.bubbleAge, ink);
  };

  // the back row first; in the dark, whoever the spotlight is on is drawn over the dark
  const lit =
    f.dim > 0 &&
    f.spot !== null &&
    Math.abs(f.spot - STAGE_ORDER.indexOf(plan.star as (typeof STAGE_ORDER)[number])) < 0.35
      ? plan.star
      : null;
  const order = [...STAGE_ORDER].sort((x, y) => Number(PLACES[y].back) - Number(PLACES[x].back));
  for (const m of order) if (m !== lit) drawActor(m);
  if (f.dim > 0) {
    ctx.fillStyle = `rgba(6, 2, 12, ${0.68 * f.dim})`;
    ctx.fillRect(0, 0, width, height);
    if (f.spot !== null) {
      // between two members' places as it sweeps
      const lo = place(STAGE_ORDER[Math.floor(f.spot)]!);
      const hi = place(STAGE_ORDER[Math.ceil(f.spot)]!);
      const k = f.spot - Math.floor(f.spot);
      cone(
        ctx,
        lo.x + (hi.x - lo.x) * k,
        safeTop,
        lo.feet + (hi.feet - lo.feet) * k,
        fw * 1.1,
        "#fff6d8",
        0.3,
      );
    }
    if (lit) drawActor(lit);
  }

  if (f.beat) {
    const r = place("ritsu");
    // between the back row, under the sign
    const count = { x: width / 2, y: riserTop - fw * 0.12 };
    drawCount(ctx, r.x, r.feet - r.h, r.w, f.beat, count, laneOf("ritsu")?.color ?? "#ffc533", ink);
  }

  // the curtains open from the middle, leaving a drape at each side; a valance on top
  const valance = safeTop * 0.6 + 14;
  paintCurtains(ctx, width, height, valance, f.curtain, height - safeBottom);
  // the song's name on a sign hung from it, already there behind the closed curtains (below
  // Reels' top bar, which covers the valance)
  if (plan.title)
    drawSign(ctx, plan.title, width / 2, valance, safeTop + 4, contentW * 0.9, fw, t, ink);
  ctx.restore();
}

/**
 * A theatre marquee: a dark board with a gold frame and bulbs chasing round it, hanging on
 * two cords, the title in cream. It drops in over the first 0.3 s with a little bounce. The
 * title shrinks to fit, then takes two lines, then ends in "…". Returns its bottom.
 */
export function drawSign(
  ctx: CanvasRenderingContext2D,
  title: string,
  cx: number,
  hangY: number,
  top: number,
  maxWidth: number,
  fw: number,
  t: number,
  ink: string,
) {
  const drop =
    t >= 0.3
      ? 0
      : t >= 0.2
        ? 6 * Math.sin(((t - 0.2) / 0.1) * Math.PI)
        : -(1 - t / 0.2) * (top + 80);
  const pad = Math.max(8, fw * 0.12);
  const inner = maxWidth - 2 * pad;
  let size = fw * 0.3;
  const min = fw * 0.17;
  const font = (px: number) => `900 ${px}px ${FONT}`;
  ctx.font = font(size);
  while (ctx.measureText(title).width > inner && size > min) {
    size -= 1;
    ctx.font = font(size);
  }
  let lines = [title];
  if (ctx.measureText(title).width > inner) {
    // two lines: break at the last space that fits (or anywhere, for text without spaces)
    let cut = title.length;
    while (cut > 1 && ctx.measureText(title.slice(0, cut)).width > inner) cut--;
    const space = title.lastIndexOf(" ", cut);
    if (space > cut / 2) cut = space;
    let rest = title.slice(cut).trim();
    if (ctx.measureText(rest).width > inner) {
      while (rest.length > 1 && ctx.measureText(rest + "…").width > inner) rest = rest.slice(0, -1);
      rest = rest.trimEnd() + "…";
    }
    lines = [title.slice(0, cut).trim(), rest];
  }
  const lineH = size * 1.25;
  const w = Math.min(
    maxWidth,
    Math.max(...lines.map((l) => ctx.measureText(l).width)) + 2 * pad + fw * 0.2,
  );
  const h = lines.length * lineH + pad * 1.4;
  const x = cx - w / 2;
  const y = top + drop;
  ctx.save();
  // cords
  ctx.fillStyle = CURTAIN.hem;
  for (const side of [-1, 1])
    ctx.fillRect(cx + side * w * 0.32 - 1, hangY, 2, Math.max(0, y - hangY));
  // the board
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.roundRect(x - 2, y - 2, w + 4, h + 4, 8);
  ctx.fill();
  ctx.fillStyle = CURTAIN.hem;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.fillStyle = "#2b1622";
  const frame = Math.max(4, pad * 0.45);
  ctx.beginPath();
  ctx.roundRect(x + frame, y + frame, w - 2 * frame, h - 2 * frame, 4);
  ctx.fill();
  // bulbs round the frame, every other one lit, chasing
  const bulb = frame * 0.32;
  const step = frame * 1.6;
  const perimeter = 2 * (w + h);
  const count = Math.max(8, Math.floor(perimeter / step));
  const chase = Math.floor(t / 0.12);
  for (let i = 0; i < count; i++) {
    let d = (i / count) * perimeter;
    let bx: number;
    let by: number;
    const half = frame / 2;
    if (d < w) [bx, by] = [x + d, y + half];
    else if ((d -= w) < h) [bx, by] = [x + w - half, y + d];
    else if ((d -= h) < w) [bx, by] = [x + w - d, y + h - half];
    else [bx, by] = [x + half, y + h - (d - w)];
    ctx.fillStyle = (i + chase) % 2 === 0 ? "#fff6d8" : "#8a6a2a";
    ctx.beginPath();
    ctx.arc(bx, by, bulb, 0, Math.PI * 2);
    ctx.fill();
  }
  // the title
  ctx.font = font(size);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff3d0";
  lines.forEach((line, i) =>
    ctx.fillText(line, cx, y + h / 2 + (i - (lines.length - 1) / 2) * lineH),
  );
  ctx.restore();
  return y + h;
}

/** A white speech bubble with a pixel icon, popping in (a little overshoot). */
export function drawBubble(
  ctx: CanvasRenderingContext2D,
  cx: number,
  bottom: number,
  size: number,
  bubble: Bubble,
  age: number,
  ink: string,
) {
  const pop =
    age < 0.12 ? 0.6 + 0.55 * (age / 0.12) : age < 0.2 ? 1.15 - 0.15 * ((age - 0.12) / 0.08) : 1;
  const s = size * pop;
  const x = cx - s / 2;
  const y = bottom - s - s * 0.22;
  const grid = pixelGrid(ctx);
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(1.5, s / 18);
  ctx.beginPath();
  ctx.roundRect(x, y, s, s, s * 0.22);
  ctx.moveTo(cx - s * 0.12, y + s);
  ctx.lineTo(cx, y + s * 1.22);
  ctx.lineTo(cx + s * 0.12, y + s);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(
    cx - s * 0.12 + ctx.lineWidth,
    y + s - ctx.lineWidth,
    s * 0.24 - 2 * ctx.lineWidth,
    ctx.lineWidth * 1.5,
  );
  const icon = ICONS[bubble];
  const cell = (s * 0.66) / 7;
  const ix = cx - cell * 3.5;
  const iy = y + s / 2 - cell * 3.5;
  ctx.fillStyle = icon.color;
  icon.rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch !== "X") return;
      const l = grid.x(ix + c * cell);
      const tp = grid.y(iy + r * cell);
      ctx.fillRect(l, tp, grid.x(ix + (c + 1) * cell) - l, grid.y(iy + (r + 1) * cell) - tp);
    }),
  );
  ctx.restore();
}

/** Ritsu's sticks over her head, clacking on each hit, and the count, big, mid-stage. */
function drawCount(
  ctx: CanvasRenderingContext2D,
  cx: number,
  headTop: number,
  fw: number,
  beat: { index: number; age: number },
  count: { x: number; y: number },
  color: string,
  ink: string,
) {
  const hit = beat.age < 0.1;
  const len = fw * 0.55;
  const thick = Math.max(3, fw * 0.07);
  const pivotY = headTop + fw * 0.35;
  ctx.save();
  for (const side of [-1, 1]) {
    // apart while waiting, crossed on the hit
    const angle = side * (hit ? -0.42 : 0.38);
    ctx.save();
    ctx.translate(cx + side * fw * 0.22, pivotY);
    ctx.rotate(angle);
    ctx.fillStyle = ink;
    ctx.fillRect(-thick / 2 - 1, -len - 1, thick + 2, len + 2);
    ctx.fillStyle = "#e8c27a";
    ctx.fillRect(-thick / 2, -len, thick, len);
    ctx.fillStyle = "#fff3d0";
    ctx.fillRect(-thick / 2, -len, thick, thick);
    ctx.restore();
  }
  if (hit) {
    // a little burst where the sticks meet
    ctx.strokeStyle = "#fff3d0";
    ctx.lineWidth = 2;
    const bx = cx;
    const by = pivotY - len * 0.86;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const r0 = fw * 0.08;
      const r1 = fw * (0.14 + 0.25 * (beat.age / 0.1));
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(a) * r0, by + Math.sin(a) * r0);
      ctx.lineTo(bx + Math.cos(a) * r1, by + Math.sin(a) * r1);
      ctx.stroke();
    }
  }
  // the number: big on the hit, settling
  const size = fw * (1.0 + 0.35 * Math.max(0, 1 - beat.age / 0.15));
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = Math.max(3, size / 9);
  ctx.strokeStyle = ink;
  ctx.fillStyle = color;
  const label = String(beat.index + 1);
  ctx.strokeText(label, count.x, count.y);
  ctx.fillText(label, count.x, count.y);
  ctx.restore();
}
