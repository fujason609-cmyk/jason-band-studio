import { drumVoiceFor, type DrumVoice } from "@/lib/drums";
import { drawPixelInstrument, poseAt, type Gear } from "@/features/band/pixelInstruments";
import type { InstrumentId } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";
import { LANE_HEIGHT, RULER_HEIGHT, TIMELINE_GUTTER } from "./layout";

export interface LaneInput {
  label: string;
  color: string;
  notes: readonly NoteEvent[];
  audible: boolean;
  isDrums: boolean;
  selected: boolean;
  /** what the member sings (Yui, Mio), drawn as outlined notes over their part; `on` = vocal switch */
  vocal?: { notes: readonly NoteEvent[]; on: boolean };
  /** this member's turns in the solo round (song seconds): the lane is lit and tagged SOLO */
  solos?: readonly { start: number; end: number }[];
  /** what the member plays, for the recording frame's pixel instrument beside the name */
  instrument?: InstrumentId;
  /** draw that instrument the other way round (Mio) */
  leftHanded?: boolean;
  /** her real instrument's finish, when she plays it (pixelInstruments MEMBER_GEAR) */
  gear?: Gear;
}

export interface Palette {
  paper: string;
  surface: string;
  rule: string;
  ruleStrong: string;
  ink: string;
  inkSoft: string;
  selected: string;
  accent: string;
}

export interface DrawInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scrollLeft: number;
  zoom: number;
  lanes: LaneInput[];
  baseBpm: number;
  beatsPerBar: number;
  durationSeconds: number;
  palette: Palette;
  showLabels: boolean;
  /** lane height in px; defaults to LANE_HEIGHT */
  laneHeight?: number;
  /** playhead in song seconds: notes under it glow, notes behind it dim */
  position?: number;
  /** draw the note-start ripples (only while playing, and not with reduced motion) */
  ripples?: boolean;
  /**
   * The recording frame's extras: a dot grid that brightens and twinkles with the music's
   * `energy` (0–1, energy.ts); while `ripples` are on, also a lane flash and sparkles as
   * notes are hit, and the playhead pulsing on the drums' accents. Off on the main page.
   */
  showcase?: Showcase;
}

export interface Showcase {
  /** how busy the music is now, 0–1 */
  energy: number;
}

export const DRUM_ROWS: DrumVoice[] = ["crash", "ride", "open-hat", "closed-hat", "tom", "snare", "clap", "kick"];
/** How long a drum hit counts as "sounding" for the glow. */
const DRUM_GLOW_SECONDS = 0.14;
/** How long a note-start ripple takes to fade out. */
const RIPPLE_SECONDS = 0.4;
/** Showcase: how long a hit's sparkles fly, and how long the playhead pulses on a drum accent. */
export const SPARKLE_SECONDS = 0.45;
const PULSE_SECONDS = 0.18;
/** Showcase: how long a lane flashes when its member hits a note. */
export const FLASH_SECONDS = 0.22;
/** Drum sounds that make the playhead pulse and throw sparkles (not the hi-hats: they never stop). */
export const ACCENTS = new Set<DrumVoice>(["kick", "snare", "crash"]);
const DOT_STEP = 16;
export const FONT = "'M PLUS Rounded 1c', system-ui, sans-serif";

export type NoteState = "past" | "active" | "upcoming";

interface VocalFrame {
  top: number;
  inner: number;
  noteH: number;
  width: number;
  tStart: number;
  zoom: number;
  xOf: (seconds: number) => number;
  position: number | undefined;
  surface: string;
}

/**
 * A sung line: hollow notes outlined in the member's colour (their own pitch range, so
 * the tune reads as a shape), filled while sung, faint when the vocal is switched off.
 * Drawn a note-height above where the pitch would put it: a singer often doubles their
 * own instrument's tune, and this keeps both lines visible.
 */
function drawVocal(ctx: CanvasRenderingContext2D, notes: readonly NoteEvent[], color: string, on: boolean, f: VocalFrame) {
  const { lo, hi } = summarise(notes);
  const span = Math.max(12, hi - lo);
  const bottom = (lo + hi) / 2 - span / 2;
  const h = f.noteH + 1;
  ctx.lineWidth = 1.5;
  for (let k = firstVisible(notes, f.tStart); k < notes.length; k++) {
    const n = notes[k]!;
    const x = f.xOf(n.start);
    if (x > f.width) break;
    const w = Math.max(4, n.duration * f.zoom - 2);
    if (x + w < 0) continue;
    const y = Math.max(f.top - h / 2, f.top + (1 - (n.pitch - bottom) / span) * f.inner - (f.noteH + 3));
    const state = f.position === undefined ? "upcoming" : noteState(n, f.position, false);
    const singing = state === "active" && on;
    ctx.globalAlpha = on ? (state === "past" ? 0.5 : 1) : 0.25;
    roundRect(ctx, x, y, w, h);
    if (singing) {
      ctx.fillStyle = color;
      ctx.fill();
    }
    ctx.strokeStyle = singing ? "#fff" : color;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Where a note sits relative to the playhead. */
export function noteState(note: NoteEvent, position: number, isDrums: boolean): NoteState {
  const end = note.start + (isDrums ? DRUM_GLOW_SECONDS : note.duration);
  if (position < note.start) return "upcoming";
  return position < end ? "active" : "past";
}

/**
 * What drawing needs to know about a whole part, worked out once per notes array (they
 * are replaced, never changed in place) instead of on every playback frame.
 */
interface PartSummary {
  lo: number;
  hi: number;
  longest: number;
}
const summaries = new WeakMap<readonly NoteEvent[], PartSummary>();

export function summarise(notes: readonly NoteEvent[]): PartSummary {
  let summary = summaries.get(notes);
  if (!summary) {
    summary = { lo: 127, hi: 0, longest: 0 };
    for (const n of notes) {
      if (n.pitch < summary.lo) summary.lo = n.pitch;
      if (n.pitch > summary.hi) summary.hi = n.pitch;
      if (n.duration > summary.longest) summary.longest = n.duration;
    }
    summaries.set(notes, summary);
  }
  return summary;
}

/** Index of the first note that could be visible, assuming notes are sorted by start. */
export function firstVisible(notes: readonly NoteEvent[], fromSeconds: number): number {
  let lo = 0;
  let hi = notes.length;
  // back by the part's longest note, so one held from before the view is still drawn
  const target = fromSeconds - summarise(notes).longest;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.start < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** How hard the playhead pulses (0 to 1): the latest kick, snare or crash, fading out. */
export function drumAccent(notes: readonly NoteEvent[], position: number): number {
  let strength = 0;
  for (let k = firstVisible(notes, position - PULSE_SECONDS); k < notes.length; k++) {
    const n = notes[k]!;
    if (n.start > position) break;
    const age = position - n.start;
    if (age < PULSE_SECONDS && ACCENTS.has(drumVoiceFor(n.pitch))) strength = Math.max(strength, n.velocity * (1 - age / PULSE_SECONDS));
  }
  return strength;
}

/**
 * A hit's sparkles: little stars in the member's colour flying out and fading, with a
 * bright core for the first instant. Same every frame for the same note. `size` scales the
 * burst (the falling-notes view throws bigger ones).
 */
export function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, age: number, seed: number, color: string, size = 1) {
  const p = age / SPARKLE_SECONDS;
  ctx.fillStyle = color;
  if (p < 0.35) {
    ctx.save();
    ctx.globalAlpha = (1 - p / 0.35) * 0.8;
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * size;
    ctx.beginPath();
    ctx.arc(x, y, (4 + p * 10) * size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 6; i++) {
    const turn = (((seed * 0.618) % 1) + i / 6) * Math.PI * 2;
    const reach = (7 + p * (22 + ((seed >> i) % 9))) * size;
    ctx.globalAlpha = (1 - p) * 0.9;
    star(ctx, x + Math.cos(turn) * reach, y + Math.sin(turn) * reach, (1.4 + (1 - p) * 2.8) * size);
  }
  ctx.globalAlpha = 1;
}

/** How bright a lane flashes now (0–1): its latest hit, fading over FLASH_SECONDS (drums: accents only). */
export function laneFlash(notes: readonly NoteEvent[], position: number, isDrums: boolean): number {
  let flash = 0;
  for (let k = firstVisible(notes, position - FLASH_SECONDS); k < notes.length; k++) {
    const n = notes[k]!;
    if (n.start > position) break;
    const age = position - n.start;
    if (age < FLASH_SECONDS && (!isDrums || ACCENTS.has(drumVoiceFor(n.pitch)))) {
      flash = Math.max(flash, (0.5 + 0.5 * n.velocity) * (1 - age / FLASH_SECONDS));
    }
  }
  return flash;
}

/**
 * The notebook's dot grid over `x, y, w, h`. Dots sit on a grid fixed to the score
 * (`worldX`, `worldY`: where the box's corner is in it), so they move with it. With more
 * `energy` they get brighter and some twinkle in the accent colour, changing a few times
 * a second (`time`).
 */
export function dotGrid(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; w: number; h: number },
  worldX: number,
  worldY: number,
  energy: number,
  time: number,
  palette: Palette,
) {
  const i0 = Math.floor(worldX / DOT_STEP);
  const j0 = Math.floor(worldY / DOT_STEP);
  const tick = Math.floor(time * 5);
  for (let j = j0; (j - j0) * DOT_STEP < box.h + DOT_STEP; j++) {
    const y = box.y + j * DOT_STEP - worldY + DOT_STEP / 2;
    if (y < box.y || y > box.y + box.h) continue;
    for (let i = i0; (i - i0) * DOT_STEP < box.w + DOT_STEP; i++) {
      const x = box.x + i * DOT_STEP - worldX + DOT_STEP / 2;
      if (x < box.x || x > box.x + box.w) continue;
      // a cheap hash per dot and tick: which dots twinkle right now
      const h = ((i * 73856093) ^ (j * 19349663) ^ (tick * 83492791)) >>> 0;
      if (energy > 0.15 && h % 1000 < energy * 70) {
        ctx.fillStyle = palette.accent;
        ctx.globalAlpha = 0.35 + 0.5 * energy;
        ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      } else {
        ctx.fillStyle = palette.ruleStrong;
        ctx.globalAlpha = 0.3 + 0.4 * energy;
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
  }
  ctx.globalAlpha = 1;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = Math.min(h / 2, w / 2)) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  roundRect(ctx, x, y, w, h);
  ctx.fill();
}

/** A melodic note as a slim candy sticker: faint drop shadow, colour body, glossy top line. */
export function candy(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  pill(ctx, x, y + 1, w, h);
  ctx.fillStyle = color;
  pill(ctx, x, y, w, h);
  if (w > 8 && h >= 5) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    pill(ctx, x + 2, y + 1, w - 4, 1.2);
  }
}

export function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/** Each drum sound gets its own mark so a beat reads at a glance. */
export function drumGlyph(ctx: CanvasRenderingContext2D, voice: DrumVoice, cx: number, cy: number, s: number, color: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, s * 0.4);
  ctx.lineCap = "round";
  switch (voice) {
    case "kick":
      ctx.beginPath();
      ctx.arc(cx, cy, s * 1.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "snare":
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case "clap":
      ctx.beginPath();
      ctx.arc(cx - s * 0.5, cy, s * 0.45, 0, Math.PI * 2);
      ctx.arc(cx + s * 0.5, cy, s * 0.45, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "closed-hat":
    case "open-hat": {
      const d = s * 0.8;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - d);
      ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx + d, cy - d);
      ctx.lineTo(cx - d, cy + d);
      ctx.stroke();
      if (voice === "open-hat") {
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, s * 1.25, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "crash":
      star(ctx, cx, cy, s * 1.4);
      break;
    case "ride":
      ctx.beginPath();
      ctx.moveTo(cx, cy - s * 1.1);
      ctx.lineTo(cx + s * 1.1, cy);
      ctx.lineTo(cx, cy + s * 1.1);
      ctx.lineTo(cx - s * 1.1, cy);
      ctx.closePath();
      ctx.fill();
      break;
    case "tom":
      ctx.beginPath();
      ctx.arc(cx, cy, s * 0.75, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

/**
 * Draws the visible window of the timeline like a page of a club notebook: a ruler
 * with bar tags, then one member-tinted staff lane per member, with melodic notes as
 * candy stickers and drum hits as one mark per drum sound. With a `position`, notes
 * under the playhead glow and the ones already played fade back. Only what's on
 * screen is drawn, so it is cheap enough to redraw every frame while playing.
 */
export function drawTimeline(input: DrawInput) {
  const { ctx, width, height, scrollLeft, zoom, lanes, baseBpm, beatsPerBar, durationSeconds, palette } = input;
  const laneH = input.laneHeight ?? LANE_HEIGHT;
  const position = input.position;
  // short lanes get tighter padding; notes stay slim (about 5px) so fast runs and
  // chords read as separate notes instead of one block
  const pad = laneH < 60 ? 6 : 12;
  // the recording frame (showcase) lets notes grow with taller lanes, for phone screens;
  // the main page keeps them slim
  const noteH = Math.max(3.5, Math.min(input.showcase ? 10 : 6, laneH / 16));
  const glyph = input.showcase ? Math.min(7, Math.max(laneH < 60 ? 3.2 : 4.2, laneH / 24)) : laneH < 60 ? 3.2 : 4.2;
  const staffGap = Math.min(8, (laneH - 12) / 4);
  const xOf = (t: number) => TIMELINE_GUTTER + t * zoom - scrollLeft;
  const tStart = Math.max(0, (scrollLeft - TIMELINE_GUTTER) / zoom);
  const tEnd = (scrollLeft + width) / zoom;

  ctx.clearRect(0, 0, width, height);

  // Lanes: a wash of the member's colour, their colour edge, and five faint staff lines
  lanes.forEach((lane, i) => {
    const top = RULER_HEIGHT + i * laneH;
    ctx.fillStyle = palette.surface;
    ctx.fillRect(0, top, width, laneH);
    ctx.fillStyle = lane.color;
    ctx.globalAlpha = lane.selected ? 0.13 : 0.05;
    ctx.fillRect(0, top, width, laneH);
    ctx.globalAlpha = lane.selected ? 1 : 0.55;
    ctx.fillRect(0, top + 4, 3, laneH - 8);

    ctx.strokeStyle = lane.color;
    ctx.globalAlpha = 0.2;
    ctx.lineWidth = 1;
    const staffTop = top + laneH / 2 - staffGap * 2;
    for (let s = 0; s < 5; s++) {
      const y = Math.round(staffTop + s * staffGap) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.rule;
    ctx.beginPath();
    ctx.moveTo(0, top + laneH - 0.5);
    ctx.lineTo(width, top + laneH - 0.5);
    ctx.stroke();
  });

  // showcase: the notebook's dot grid, moving with the score, lit by the music's energy
  if (input.showcase) {
    const bottom = Math.min(height, RULER_HEIGHT + lanes.length * laneH);
    const energy = input.ripples ? input.showcase.energy : 0;
    dotGrid(ctx, { x: 0, y: RULER_HEIGHT, w: width, h: bottom - RULER_HEIGHT }, scrollLeft, 0, energy, position ?? 0, palette);
  }

  // Bar lines (solid) and beat lines (dotted), plus the ruler with bar tags
  const beatSec = 60 / baseBpm;
  const barSec = beatSec * beatsPerBar;
  const showBeats = beatSec * zoom >= 14;
  const labelEvery = Math.max(1, Math.ceil(40 / (barSec * zoom)));
  const currentBar = position === undefined ? -1 : Math.floor(position / barSec);
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, width, RULER_HEIGHT);
  ctx.fillStyle = palette.ruleStrong;
  ctx.fillRect(0, RULER_HEIGHT - 1, width, 1);
  ctx.font = `700 11px ${FONT}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  const firstBeat = Math.floor(tStart / beatSec);
  const lastBeat = Math.ceil(Math.min(tEnd, durationSeconds) / beatSec);
  for (let b = firstBeat; b <= lastBeat; b++) {
    const isBar = b % beatsPerBar === 0;
    if (!isBar && !showBeats) continue;
    const x = Math.round(xOf(b * beatSec)) + 0.5;
    ctx.strokeStyle = isBar ? palette.ruleStrong : palette.rule;
    ctx.lineWidth = 1;
    ctx.setLineDash(isBar ? [] : [2, 4]);
    ctx.beginPath();
    ctx.moveTo(x, RULER_HEIGHT);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.setLineDash([]);

    if (!isBar) {
      // beat dot on the ruler
      ctx.fillStyle = palette.ruleStrong;
      ctx.beginPath();
      ctx.arc(x, RULER_HEIGHT - 7, 1.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const barNo = b / beatsPerBar;
    if (barNo % labelEvery !== 0 && barNo !== currentBar) continue;
    // bar number on a little tag; the bar being played gets the accent colour
    const label = String(barNo + 1);
    const tagW = Math.max(20, ctx.measureText(label).width + 12);
    const isCurrent = barNo === currentBar;
    ctx.fillStyle = isCurrent ? palette.accent : palette.surface;
    roundRect(ctx, x + 3, RULER_HEIGHT / 2 - 11, tagW, 18, 9);
    ctx.fill();
    if (!isCurrent) {
      ctx.strokeStyle = palette.ruleStrong;
      ctx.stroke();
    }
    ctx.fillStyle = isCurrent ? "#fff" : palette.inkSoft;
    ctx.fillText(label, x + 3 + tagW / 2, RULER_HEIGHT / 2 - 1.5);
  }
  ctx.textAlign = "start";

  // After the end of the song: soft diagonal hatching
  const endX = xOf(durationSeconds);
  if (endX < width) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(endX, RULER_HEIGHT, width - endX, height - RULER_HEIGHT);
    ctx.clip();
    ctx.fillStyle = palette.paper;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(endX, RULER_HEIGHT, width - endX, height - RULER_HEIGHT);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 1;
    for (let hx = endX - height; hx < width; hx += 10) {
      ctx.beginPath();
      ctx.moveTo(hx, height);
      ctx.lineTo(hx + height, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  // showcase: the playhead glows wider on each kick, snare and crash
  const live = input.showcase && input.ripples && position !== undefined ? position : undefined;
  if (live !== undefined) {
    const drums = lanes.find((l) => l.isDrums && l.audible);
    const pulse = drums ? drumAccent(drums.notes, live) : 0;
    if (pulse > 0) {
      const x = xOf(live);
      ctx.fillStyle = palette.accent;
      ctx.globalAlpha = pulse * 0.12;
      ctx.fillRect(x - 16, RULER_HEIGHT, 32, height - RULER_HEIGHT);
      ctx.globalAlpha = pulse * 0.2;
      ctx.fillRect(x - 6, RULER_HEIGHT, 12, height - RULER_HEIGHT);
      ctx.globalAlpha = 1;
    }
  }

  // Notes
  lanes.forEach((lane, i) => {
    const top = RULER_HEIGHT + i * laneH;
    const inner = laneH - pad * 2 - noteH;

    // showcase: the lane flashes its member's colour on each hit
    if (live !== undefined && lane.audible) {
      const flash = laneFlash(lane.notes, live, lane.isDrums);
      if (flash > 0) {
        ctx.fillStyle = lane.color;
        ctx.globalAlpha = 0.18 * flash;
        ctx.fillRect(0, top, width, laneH);
        ctx.globalAlpha = 1;
      }
    }

    // the member's solo-round turn: their lane lit up, tagged SOLO at its start
    for (const solo of lane.solos ?? []) {
      const x0 = Math.max(0, xOf(solo.start));
      const x1 = Math.min(width, xOf(solo.end));
      if (x1 <= x0) continue;
      ctx.fillStyle = lane.color;
      ctx.globalAlpha = 0.14;
      ctx.fillRect(x0, top, x1 - x0, laneH);
      ctx.globalAlpha = 1;
      ctx.font = `800 11px ${FONT}`;
      const text = "SOLO ★";
      const tagW = ctx.measureText(text).width + 12;
      const tagH = laneH < 40 ? 14 : 18;
      const tagX = Math.min(Math.max(xOf(solo.start) + 6, 8), x1 - tagW - 4);
      if (tagX < x0) continue;
      pill(ctx, tagX, top + laneH - tagH - 4, tagW, tagH);
      ctx.fillStyle = "#fff";
      ctx.fillText(text, tagX + 6, top + laneH - tagH / 2 - 4 + 0.5);
    }

    let yOf: (n: NoteEvent) => number;
    if (lane.isDrums) {
      yOf = (n) => top + pad + (DRUM_ROWS.indexOf(drumVoiceFor(n.pitch)) / (DRUM_ROWS.length - 1)) * inner;
    } else {
      const { lo, hi } = summarise(lane.notes);
      const span = Math.max(12, hi - lo);
      const mid = (lo + hi) / 2;
      const bottom = mid - span / 2;
      yOf = (n) => top + pad + (1 - (n.pitch - bottom) / span) * inner;
    }

    const glowing: { x: number; y: number; w: number; pitch: number }[] = [];
    const sparks: { x: number; y: number; age: number; seed: number }[] = [];
    let lastSpark = -1;
    for (let k = firstVisible(lane.notes, tStart); k < lane.notes.length; k++) {
      const n = lane.notes[k]!;
      const x = xOf(n.start);
      if (x > width) break;
      // a 2px gap after each note keeps back-to-back notes apart
      const w = lane.isDrums ? glyph * 2 : Math.max(3, n.duration * zoom - 2);
      if (x + w < 0) continue;
      const state = position === undefined ? "upcoming" : noteState(n, position, lane.isDrums);
      const y = yOf(n);
      // a ring spreading from each note as the playhead reaches it (while it sounds, so
      // before the sounding notes are set aside to be drawn on top)
      if (input.ripples && position !== undefined && lane.audible) {
        const age = position - n.start;
        if (age >= 0 && age < RIPPLE_SECONDS) {
          const p = age / RIPPLE_SECONDS;
          ctx.globalAlpha = (1 - p) * 0.6;
          ctx.strokeStyle = lane.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y + noteH / 2, 5 + p * 18, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      // showcase: one burst per chord (notes starting together), drums on their accents only
      if (live !== undefined && lane.audible && n.start !== lastSpark) {
        const age = live - n.start;
        if (age >= 0 && age < SPARKLE_SECONDS && (!lane.isDrums || ACCENTS.has(drumVoiceFor(n.pitch)))) {
          lastSpark = n.start;
          sparks.push({ x, y: y + noteH / 2, age, seed: Math.round(n.start * 997) + n.pitch * 31 });
        }
      }
      if (state === "active" && lane.audible) {
        glowing.push({ x, y, w, pitch: n.pitch });
        continue; // drawn last, on top
      }
      ctx.globalAlpha = (lane.audible ? 1 : 0.22) * (0.6 + 0.4 * n.velocity) * (state === "past" ? 0.5 : 1);
      if (lane.isDrums) drumGlyph(ctx, drumVoiceFor(n.pitch), x, y + noteH / 2, glyph, lane.color);
      else candy(ctx, x, y, w, noteH, lane.color);
    }

    // sounding notes: a little thicker, glowing, with a white rim
    for (const g of glowing) {
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.shadowColor = lane.color;
      ctx.shadowBlur = 10;
      if (lane.isDrums) {
        drumGlyph(ctx, drumVoiceFor(g.pitch), g.x, g.y + noteH / 2, glyph * 1.45, lane.color);
      } else {
        const h = noteH + 2;
        ctx.fillStyle = lane.color;
        pill(ctx, g.x, g.y - 1, g.w, h);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        roundRect(ctx, g.x, g.y - 1, g.w, h);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    for (const sp of sparks) sparkle(ctx, sp.x, sp.y, sp.age, sp.seed, lane.color);

    if (lane.vocal && lane.vocal.notes.length > 0) {
      drawVocal(ctx, lane.vocal.notes, lane.color, lane.audible && lane.vocal.on, {
        top: top + pad,
        inner,
        noteH,
        width,
        tStart,
        zoom,
        xOf,
        position,
        surface: palette.surface,
      });
    }

    if (input.showLabels) {
      // member name on a sticker in their colour
      ctx.font = `800 12px ${FONT}`;
      const textW = ctx.measureText(lane.label).width;
      const tagH = laneH < 40 ? 16 : 20;
      // showcase: the member's pixel instrument, playing along, before the name
      const sprite = input.showcase && lane.instrument && laneH >= 44 ? 28 : 0;
      if (sprite > 0) {
        // on a light tile of her colour, as the page's badges, so the ink outline shows on dark
        ctx.fillStyle = lane.color;
      ctx.globalAlpha = (lane.audible ? 1 : 0.4) * 0.28;
      roundRect(ctx, 6 - 3, top + 3 - 3, sprite + 6, sprite + 6, 8);
      ctx.fill();
      ctx.globalAlpha = lane.audible ? 1 : 0.4;
        const pose = position === undefined ? poseAt([], 0, lane.instrument!) : poseAt(lane.notes, position, lane.instrument!);
        drawPixelInstrument(ctx, lane.instrument!, pose, 6, top + 3, sprite, lane.color, lane.leftHanded, lane.gear);
      }
      const tagX = sprite > 0 ? 6 + sprite + 8 : 8;
      ctx.fillStyle = lane.color;
      ctx.globalAlpha = lane.audible ? 0.95 : 0.4;
      pill(ctx, tagX, top + 5, textW + 16, tagH);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.fillText(lane.label, tagX + 8, top + 5 + tagH / 2 + 0.5);
    }
  });
}
