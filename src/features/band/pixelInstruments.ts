import { drumVoiceFor } from "@/lib/drums";
import type { InstrumentId } from "@/types/audio";
import type { MemberId } from "./types";
import type { NoteEvent } from "@/types/midi";

/**
 * Little pixel-art instruments for the member badges and the recording frame, drawn for
 * this project (no character artwork): a guitar that strums, a bass whose strings shake,
 * a snare whose stick comes down (and a cymbal that rocks on a crash), and a keyboard
 * whose keys go down where the part plays. They move with the member's notes.
 *
 * 16 × 16 cells: "." clear, "m" the body (the member's colour, or her real instrument's
 * finish: `MEMBER_GEAR`), "d" ink outline, "w" white, "n" wood, "s" metal, "k" dark,
 * "p" a key held down (the member's colour).
 */
type Sprite = readonly string[];

const GUITAR: Sprite = [
  "..............dd",
  ".............dsd",
  "............dnd.",
  "...........dnd..",
  "..........dnd...",
  ".........dnd....",
  "...dd...dnd.....",
  "..dmmd.dnd......",
  ".dmmmmdnd.......",
  ".dmwmmnmdd......",
  "dmmmmkkmmd......",
  "dmmmmkkmmd......",
  "dmmmmmmmmd......",
  ".dmmwmmmd.......",
  "..dmmmmd........",
  "...dddd.........",
];
/** the strum: motion lines off the strings */
const GUITAR_STRUM: readonly [number, number][] = [[11, 9], [12, 10], [11, 11], [12, 12], [10, 13]];

const BASS: Sprite = [
  "..............sd",
  ".............sdn",
  ".............dnd",
  "............dnd.",
  "...........dnd..",
  "..........dnd...",
  ".........dnd....",
  "..ddd...dnd.....",
  ".dmmmd.dnd......",
  ".dwmmmdnd.......",
  "..dwmmnmd.......",
  ".dmwkkmmd.......",
  "dmmmkkmmmd......",
  "dmmmmmmmmd......",
  ".dmmmmmmd.......",
  "..dddddd........",
];
const BASS_PLUCK: readonly [number, number][] = [[11, 9], [12, 10], [10, 11], [11, 12], [10, 13]];

const DRUM_BASE: Sprite = [
  "................",
  "..sssss.........",
  ".sssssss........",
  "....d...........",
  "....d...........",
  "....d...........",
  "....d...........",
  "..dddddddddd....",
  "..dwwwwwwwwd....",
  "..dmmmmmmmmd....",
  "..dmsmmmsmmd....",
  "..dmmmmmmmmd....",
  "..dddddddddd....",
  "...d......d.....",
  "..d........d....",
  "................",
];
/** the stick, raised (idle) or down on the head (hit) */
const STICK_UP: readonly [number, number][] = [[11, 3], [10, 4], [9, 5], [8, 6]];
const STICK_DOWN: readonly [number, number][] = [[10, 5], [11, 5], [12, 5], [8, 6], [9, 6], [8, 7]];
/** a crash: the cymbal tilts, with a glint */
const CYMBAL_TILT: Sprite = [".w....w.........", "...sssss........", ".sssss.........."];

const KEYS: Sprite = [
  "................",
  "................",
  "................",
  "................",
  "dddddddddddddddd",
  "dmmmmmmmmmmmmmmd",
  "dmkmkmmmwwwmmmmd",
  "dmmmmmmmmmmmmmmd",
  "dddddddddddddddd",
  "dwkwkwwkwkwkwwwd",
  "dwkwkwwkwkwkwwwd",
  "dwwwwwwwwwwwwwwd",
  "dwwwwwwwwwwwwwwd",
  "dddddddddddddddd",
  "................",
  "................",
];

const INK = "#2b2547";
const COLORS: Record<string, string> = { d: INK, w: "#fffdf8", n: "#b07a44", s: "#d6d8e4", k: "#15132a" };

export interface InstrumentPose {
  /** "hit" while a note has just started (a crash for the drums: "crash") */
  frame: "idle" | "hit" | "crash";
  /** how fresh the hit is, 1 → 0 */
  amount: number;
  /** keyboard columns held down (1–14), for the keys */
  keys: readonly number[];
}

export const IDLE_POSE: InstrumentPose = { frame: "idle", amount: 0, keys: [] };
/** How long a strum / stroke shows after a note starts. */
const HIT_SECONDS = 0.14;

/** What the instrument is doing at `position` (song seconds), from the member's notes (sorted by start). */
export function poseAt(notes: readonly NoteEvent[], position: number, instrument: InstrumentId): InstrumentPose {
  // first note that could still matter: binary search on start, then a look back for long keys notes
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.start <= position) lo = mid + 1;
    else hi = mid;
  }
  let amount = 0;
  let crash = false;
  const keys = new Set<number>();
  for (let k = lo - 1; k >= 0 && k >= lo - 64; k--) {
    const n = notes[k]!;
    const age = position - n.start;
    if (age < HIT_SECONDS) {
      amount = Math.max(amount, 1 - age / HIT_SECONDS);
      if (instrument === "drums" && drumVoiceFor(n.pitch) === "crash") crash = true;
    }
    if (instrument === "keys" && position < n.start + n.duration) keys.add(1 + Math.round(((n.pitch % 12) / 11) * 13));
    if (age > 8) break;
  }
  if (amount === 0 && keys.size === 0) return IDLE_POSE;
  return { frame: amount > 0 ? (crash ? "crash" : "hit") : "idle", amount, keys: [...keys] };
}

/** A short key for a pose, to redraw only when it changes. */
export function poseKey(pose: InstrumentPose): string {
  return `${pose.frame}${Math.ceil(pose.amount * 3)}${pose.keys.join(",")}`;
}

/** The cells to paint for `instrument` in `pose`: [column, row, colour key]. */
export function spriteCells(instrument: InstrumentId, pose: InstrumentPose): [number, number, string][] {
  const cells: [number, number, string][] = [];
  const add = (rows: Sprite, from = 0) =>
    rows.forEach((row, r) => [...row].forEach((c, x) => c !== "." && cells.push([x, r + from, c])));
  const hit = pose.frame !== "idle";
  switch (instrument) {
    case "lead-guitar":
    case "rhythm-guitar":
      add(GUITAR);
      if (hit) GUITAR_STRUM.forEach(([x, y]) => cells.push([x, y, "w"]));
      break;
    case "bass":
      add(BASS);
      if (hit) BASS_PLUCK.forEach(([x, y]) => cells.push([x, y, "w"]));
      break;
    case "drums":
      if (pose.frame === "crash") {
        add(CYMBAL_TILT);
        add(DRUM_BASE.slice(3), 3);
      } else add(DRUM_BASE);
      (hit ? STICK_DOWN : STICK_UP).forEach(([x, y]) => cells.push([x, y, "n"]));
      if (hit) cells.push([7, 5, "w"], [6, 6, "w"]);
      break;
    case "keys":
      add(KEYS);
      for (const col of pose.keys) cells.push([col, 11, "p"], [col, 12, "p"]);
      break;
  }
  return cells;
}

/**
 * The finish of each member's own instrument, as the real model they play comes:
 * a sunburst is edge → middle → centre colours, which `bodyShades` spreads over the
 * body from its outline inwards. Only used while she plays that instrument.
 *
 *   yui      Gibson Les Paul Standard, cherry sunburst (amber centre, cherry red edge)
 *   mio      Fender Jazz Bass (left-handed), 3-tone sunburst (amber, red, dark brown)
 *   ritsu    Yamaha Hip Gig kit, champagne gold shells, bronze cymbals
 *   tsumugi  Korg Triton Extreme, silver panel
 *   azusa    Fender Mustang, candy apple red
 */
export interface Gear {
  edge: string;
  mid: string;
  centre: string;
  /** cymbals and hardware ("s" cells) */
  metal?: string;
}

export const MEMBER_GEAR: Record<MemberId, { instrument: InstrumentId; gear: Gear }> = {
  yui: { instrument: "lead-guitar", gear: { edge: "#6e0f1f", mid: "#c02338", centre: "#f2a93b" } },
  mio: { instrument: "bass", gear: { edge: "#24140d", mid: "#a8261b", centre: "#e9aa3c" } },
  ritsu: { instrument: "drums", gear: { edge: "#b8902f", mid: "#dcb954", centre: "#e9cc72", metal: "#d8a64a" } },
  tsumugi: { instrument: "keys", gear: { edge: "#9fa3ad", mid: "#c4c7cf", centre: "#d3d6dd" } },
  azusa: { instrument: "rhythm-guitar", gear: { edge: "#7c0b1d", mid: "#b5122d", centre: "#c9203a" } },
};

/** Her real instrument's finish, if `instrument` is the one she plays in the band. */
export function gearFor(member: MemberId, instrument: InstrumentId): Gear | undefined {
  const own = MEMBER_GEAR[member];
  return own.instrument === instrument ? own.gear : undefined;
}

/**
 * How deep each body ("m") cell is from the body's outline: 1 on the edge, 2 one cell in,
 * 3 or more inside. A sunburst shades by it.
 */
export function bodyShades(cells: readonly [number, number, string][]): Map<string, number> {
  // the body for depth: its colour, and what sits on it (pickups, highlights)
  const body = new Set(cells.filter(([, , c]) => c === "m" || c === "k" || c === "w").map(([x, y]) => `${x},${y}`));
  const paint = new Set(cells.filter(([, , c]) => c === "m").map(([x, y]) => `${x},${y}`));
  const depth = new Map<string, number>();
  let frontier: string[] = [];
  for (const key of paint) {
    const [x, y] = key.split(",").map(Number) as [number, number];
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !body.has(`${x + dx!},${y + dy!}`));
    if (edge) {
      depth.set(key, 1);
      frontier.push(key);
    }
  }
  for (let d = 2; frontier.length > 0; d++) {
    const next: string[] = [];
    for (const key of frontier) {
      const [x, y] = key.split(",").map(Number) as [number, number];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const n = `${x + dx},${y + dy}`;
        if (body.has(n) && !depth.has(n)) {
          // through a pickup or highlight too, so cells beyond it get their real depth
          depth.set(n, d);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return depth;
}

/**
 * Paint the instrument at `x, y`, `size` px square, in the member's `color` (or her
 * real instrument's `gear` finish). A guitar or bass bounces a pixel up on each strum;
 * `mirror` flips it for a left-handed player.
 */
export function drawPixelInstrument(
  ctx: CanvasRenderingContext2D,
  instrument: InstrumentId,
  pose: InstrumentPose,
  x: number,
  y: number,
  size: number,
  color: string,
  mirror = false,
  gear?: Gear,
) {
  const px = size / 16;
  const flip = mirror && instrument !== "drums" && instrument !== "keys";
  const lift = pose.frame !== "idle" && instrument !== "keys" && instrument !== "drums" ? px * Math.min(1, pose.amount * 2) : 0;
  const cells = spriteCells(instrument, pose);
  const shades = gear ? bodyShades(cells) : null;
  const grid = pixelGrid(ctx);
  for (const [cx, cy, c] of cells) {
    if (c === "m") {
      const depth = shades?.get(`${cx},${cy}`) ?? 0;
      ctx.fillStyle = !gear ? color : depth <= 1 ? gear.edge : depth === 2 ? gear.mid : gear.centre;
    } else if (c === "p") ctx.fillStyle = color;
    else if (c === "s" && gear?.metal) ctx.fillStyle = gear.metal;
    else ctx.fillStyle = COLORS[c]!;
    const col = flip ? 15 - cx : cx;
    const left = grid.x(x + col * px);
    const top = grid.y(y + cy * px - lift);
    ctx.fillRect(left, top, grid.x(x + (col + 1) * px) - left, grid.y(y + (cy + 1) * px - lift) - top);
  }
}

/**
 * Rounds canvas coordinates to whole *device* pixels under the current transform, so
 * pixel art stays sharp: the video canvas is drawn at about 2.77 × the CSS size, where
 * cells rounded to whole CSS pixels got blurred edges.
 */
export function pixelGrid(ctx: CanvasRenderingContext2D) {
  const m = typeof ctx.getTransform === "function" ? ctx.getTransform() : null;
  // turned (a cheering member's sway), there's no pixel grid to snap to
  if (m && (m.b || m.c)) return { x: (v: number) => v, y: (v: number) => v };
  const a = m?.a || 1;
  const d = m?.d || 1;
  const e = m?.e ?? 0;
  const f = m?.f ?? 0;
  return { x: (v: number) => (Math.round(v * a + e) - e) / a, y: (v: number) => (Math.round(v * d + f) - f) / d };
}
