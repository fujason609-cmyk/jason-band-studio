import { drumVoiceFor } from "@/lib/drums";
import type { InstrumentId } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";
import { drawPixelInstrument, pixelGrid, type Gear, type InstrumentPose } from "./pixelInstruments";
import type { MemberId } from "./types";

/**
 * The five members as small full-length pixel figures playing their instruments, drawn for
 * this project from scratch (24 × 38 cells, built in code from simple shapes, then outlined).
 * Cute proportions: a big head with plenty of hair (volume over the head, a shine ring,
 * shading under the bangs), eyebrows, eyes with a highlight and a coloured iris, a blush, a
 * small mouth. They wear a plain Japanese school uniform (navy blazer with lapels, white shirt, a
 * ribbon in the member's colour, a grey check skirt, navy socks), and the hair says who is
 * who, bangs included: Yui's brown bob with choppy bangs and hair clips, Mio's blunt bangs
 * and long black hair, Ritsu's hairband over light-brown hair (forehead out), Mugi's
 * middle-parted bangs, thick eyebrows and long wavy blonde hair, Azusa's choppy bangs and
 * black twin tails tied high with bows, down to her waist. Never traced from or modelled on
 * anyone's artwork (official or fan); no logos. A guitarist holds her guitar across her
 * (Mio left-handed, the whole figure mirrored), Ritsu sits behind her kit, Mugi stands at
 * her keyboard. They move with the music: a hop on each of their notes, the strumming /
 * drumming / playing hands going down on a hit, a blink now and then, and the singers'
 * mouths open while they sing.
 *
 * Cells: "d" outline (the theme's ink), "h" hair, "k" hair shade, "l" hair shine, "a" clip /
 * band / bow, "s" skin, "e" eye and lashes, "q" the eye's highlight, "i" iris, "b" blush,
 * "x" closed mouth, "o" open mouth (singing), "n" blazer and socks, "N" lapel, "w" shirt,
 * "m" ribbon (member colour), "g" / "G" skirt check, "f" shoes, "." none.
 */
export const FIGURE_COLS = 24;
/** the figure is built in BODY_ROWS rows, under TOP_PAD empty ones (room for the outline over the crown) */
const BODY_ROWS = 36;
const TOP_PAD = 2;
export const FIGURE_ROWS = BODY_ROWS + TOP_PAD;

type Grid = string[][];
type Cell = readonly [row: number, col: number];

function blank(): Grid {
  return Array.from({ length: BODY_ROWS }, () => Array<string>(FIGURE_COLS).fill("."));
}
function fill(
  g: Grid,
  r0: number,
  r1: number,
  c0: number,
  c1: number,
  ch: string | ((r: number, c: number) => string),
) {
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      if (g[r]?.[c] !== undefined) g[r]![c] = typeof ch === "string" ? ch : ch(r, c);
    }
  }
}
function put(g: Grid, cells: readonly Cell[], ch: string) {
  for (const [r, c] of cells) if (g[r]?.[c] !== undefined) g[r]![c] = ch;
}

/** Hair drawn behind the body (long hair, tails) and over the head (cap, bangs, sides). */
interface HairStyle {
  back?: (g: Grid) => void;
  front: (g: Grid) => void;
}

/** a full head of hair: a round crown wider than the face, a shine ring, sides down to `to` */
function cap(g: Grid, to = 12) {
  // a round crown: narrow on top, widening row by row
  fill(g, 0, 0, 9, 14, "h");
  fill(g, 1, 1, 7, 16, "h");
  fill(g, 2, 2, 5, 18, "h");
  fill(g, 3, 5, 4, 19, "h");
  put(
    g,
    [
      [2, 9],
      [2, 10],
      [2, 13],
      [2, 14],
      [3, 8],
      [3, 15],
    ],
    "l",
  );
  fill(g, 6, to, 4, 6, "h");
  fill(g, 6, to, 17, 19, "h");
  fill(g, 6, Math.min(to, 11), 6, 6, "k");
  fill(g, 6, Math.min(to, 11), 17, 17, "k");
}
/** bangs over the forehead: a full row, then rows of strands ("h" = strand) */
function bangs(g: Grid, rows: readonly string[]) {
  fill(g, 6, 6, 7, 16, "h");
  rows.forEach((row, i) =>
    [...row].forEach((ch, k) => ch === "h" && put(g, [[7 + i, 7 + k]], "h")),
  );
  // a little shade under the bangs, on the forehead
  for (let c = 7; c <= 16; c++) {
    let r = 7;
    while (g[r]![c] === "h") r++;
    if (g[r]![c] === "s" && r < 9) g[r]![c] = "k";
  }
}

const STYLES: Record<MemberId, HairStyle> = {
  // brown bob flaring at the chin, choppy bangs down to the eyebrows, two clips on her right (the left as you look at her)
  yui: {
    front: (g) => {
      cap(g, 14);
      fill(g, 11, 15, 3, 3, "h");
      fill(g, 11, 15, 20, 20, "h");
      bangs(g, ["h.hh.hh.hh", ".h..h...h."]);
      put(
        g,
        [
          [5, 8],
          [5, 7],
          [6, 6],
          [7, 6],
          [7, 5],
          [8, 5],
        ],
        "a",
      );
    },
  },
  // blunt bangs over the eyebrows, long straight black hair down past the waist
  mio: {
    back: (g) => fill(g, 6, 28, 3, 20, (_, c) => (c === 4 || c === 19 ? "l" : "h")),
    front: (g) => {
      cap(g, 17);
      bangs(g, ["hhhhhhhhhh", "hhhhhhhhhh"]);
    },
  },
  // a hairband over the top of her head, a line of swept-back hair under it, her forehead
  // out, and the hair at her sides falling straight over the band's ends
  ritsu: {
    front: (g) => {
      cap(g, 12);
      fill(g, 4, 4, 7, 16, "a");
      fill(g, 5, 5, 7, 16, "h");
      put(g, [[6, 7], [6, 8], [6, 15], [6, 16], [6, 11], [6, 12]], "h");
    },
  },
  // bangs parted in the middle, thick eyebrows, long wavy blonde hair
  tsumugi: {
    back: (g) =>
      fill(g, 6, 29, 3, 20, (r, c) =>
        (r + (c < 12 ? 0 : 2)) % 4 === 0 ? "k" : (r + c) % 7 === 0 ? "l" : "h",
      ),
    front: (g) => {
      cap(g, 17);
      bangs(g, ["hhh....hhh", "h........h"]);
      put(
        g,
        [
          [8, 9],
          [8, 10],
          [8, 13],
          [8, 14],
        ],
        "k",
      );
    },
  },
  // choppy bangs, a big bow high on each side, two black tails down to her waist
  azusa: {
    back: (g) => {
      for (const side of [0, 1]) {
        const c0 = side ? 20 : 0;
        fill(g, 5, 22, c0, c0 + 3, "h");
        fill(g, 23, 25, side ? 20 : 1, side ? 22 : 3, "h");
        fill(g, 26, 26, side ? 21 : 2, side ? 21 : 2, "h");
        fill(g, 5, 24, side ? 23 : 0, side ? 23 : 0, "l"); // shine down the outer edge
      }
      fill(g, 2, 4, 1, 4, "a");
      fill(g, 2, 4, 19, 22, "a");
      put(
        g,
        [
          [3, 2],
          [3, 21],
        ],
        "k",
      );
    },
    front: (g) => {
      cap(g, 13);
      bangs(g, ["hh.hhh.hhh", ".h..h..h.."]);
    },
  },
};

/** each member's eye colour */
const IRIS: Record<MemberId, string> = {
  yui: "#7a4a2a",
  mio: "#4a4a6a",
  ritsu: "#a8682a",
  tsumugi: "#3f7fc0",
  azusa: "#7a3a3a",
};

/** a brow (in the hair's shade) over each eye, a row of skin, then the eye: 2 × 3, lashes on top, a highlight, the iris below */
const EYE_CELLS: readonly (readonly [number, number, string])[] = [9, 13].flatMap(
  (c): (readonly [number, number, string])[] => [
    [9, c, "k"],
    [9, c + 1, "k"],
    [11, c, "e"],
    [11, c + 1, "e"],
    [12, c, "q"],
    [12, c + 1, "i"],
    [13, c, "i"],
    [13, c + 1, "i"],
  ],
);

/** The figure without arms (they go over the instrument), outlined. Built once per member. */
const figures = new Map<MemberId, Grid>();
export function figureCells(member: MemberId): readonly (readonly string[])[] {
  const cached = figures.get(member);
  if (cached) return cached;
  const g = blank();
  const style = STYLES[member];
  style.back?.(g);
  // body: neck, blazer with lapels, the shirt and ribbon, skirt, legs, shoes
  fill(g, 15, 16, 11, 12, "s");
  fill(g, 17, 25, 8, 15, "n");
  fill(g, 17, 19, 11, 12, "w");
  put(
    g,
    [
      [17, 10],
      [18, 10],
      [19, 10],
      [20, 11],
      [17, 13],
      [18, 13],
      [19, 13],
      [20, 12],
    ],
    "N",
  );
  fill(g, 18, 18, 10, 13, "m");
  fill(g, 19, 19, 11, 12, "m");
  fill(g, 26, 26, 8, 15, (r, c) => ((r + c) % 2 ? "g" : "G"));
  fill(g, 27, 28, 7, 16, (_, c) => (c % 2 ? "g" : "G"));
  for (const c of [9, 13]) {
    fill(g, 29, 30, c, c + 1, "s");
    fill(g, 31, 33, c, c + 1, "n");
  }
  fill(g, 34, 34, 8, 10, "f");
  fill(g, 34, 34, 13, 15, "f");
  // a round face
  fill(g, 6, 13, 7, 16, "s");
  fill(g, 14, 14, 8, 15, "s");
  style.front(g);
  for (const [r, c, ch] of EYE_CELLS) put(g, [[r, c]], ch);
  put(
    g,
    [
      [13, 7],
      [13, 8],
      [13, 15],
      [13, 16],
    ],
    "b",
  );
  put(
    g,
    [
      [14, 11],
      [14, 12],
    ],
    "x",
  );
  // outline: every empty cell touching the figure (the empty rows on top let it close over the crown)
  const padded = [...Array.from({ length: TOP_PAD }, () => Array<string>(FIGURE_COLS).fill(".")), ...g];
  const out = padded.map((row) => [...row]);
  for (let r = 0; r < FIGURE_ROWS; r++) {
    for (let c = 0; c < FIGURE_COLS; c++) {
      if (padded[r]![c] !== ".") continue;
      const near = [padded[r - 1]?.[c], padded[r + 1]?.[c], padded[r]?.[c - 1], padded[r]?.[c + 1]];
      if (near.some((v) => v !== undefined && v !== ".")) out[r]![c] = "d";
    }
  }
  figures.set(member, out);
  return out;
}

/** Sleeves and hands over the instrument; `hands` move down a row on a hit. */
interface Arms {
  sleeves: readonly Cell[];
  hands: readonly Cell[];
  /** the instrument's place, in cells: left, top, size */
  at: readonly [col: number, row: number, size: number];
}

const GUITAR_ARMS: Arms = {
  // strumming over the pickups, fretting up the neck
  sleeves: [
    [18, 7],
    [19, 7],
    [20, 7],
    [21, 7],
    [22, 8],
    [23, 8],
    [18, 16],
    [17, 17],
    [16, 17],
  ],
  hands: [
    [24, 8],
    [24, 9],
    [15, 17],
    [15, 18],
  ],
  at: [2, 11, 20],
};
const ARMS: Record<InstrumentId, Arms> = {
  "lead-guitar": GUITAR_ARMS,
  "rhythm-guitar": GUITAR_ARMS,
  bass: GUITAR_ARMS,
  // seated behind the kit, sticks in both hands
  drums: {
    sleeves: [
      [18, 7],
      [19, 6],
      [20, 5],
      [18, 16],
      [19, 17],
      [20, 18],
    ],
    hands: [
      [21, 5],
      [21, 18],
    ],
    at: [2, 15, 24],
  },
  // both hands on the keys
  keys: {
    // the keyboard at her hips, so her arms reach down to it and her hands show on the keys
    sleeves: [
      [18, 7],
      [19, 7],
      [20, 7],
      [21, 7],
      [22, 8],
      [18, 16],
      [19, 16],
      [20, 16],
      [21, 16],
      [22, 15],
    ],
    hands: [
      [23, 8],
      [23, 9],
      [23, 14],
      [23, 15],
    ],
    at: [0, 19, 24],
  },
};

const HAIR: Record<MemberId, { hair: string; shade: string; shine: string; accessory: string }> = {
  yui: { hair: "#9a6440", shade: "#74472c", shine: "#c48a5c", accessory: "#f6d24a" },
  mio: { hair: "#34324f", shade: "#22213a", shine: "#6d6b9e", accessory: "#34324f" },
  ritsu: { hair: "#c98d52", shade: "#a26c38", shine: "#e8b67c", accessory: "#f6d24a" },
  tsumugi: { hair: "#f3d27c", shade: "#d3aa4e", shine: "#fff0b8", accessory: "#f3d27c" },
  azusa: { hair: "#34324f", shade: "#22213a", shine: "#6d6b9e", accessory: "#e0566c" },
};

const COLORS: Record<string, string> = {
  d: "#2b2547",
  s: "#ffe0cc",
  e: "#2b2547",
  q: "#ffffff",
  b: "#f8a5b0",
  x: "#d9727e",
  o: "#c8475e",
  n: "#2f3a66",
  N: "#232c52",
  w: "#ffffff",
  g: "#9a9fb8",
  G: "#767b96",
  f: "#6b4a3a",
};

export interface MemberPose {
  /** how fresh her latest note is, 1 → 0: she hops */
  hop: number;
  blink: boolean;
  singing: boolean;
}

export const IDLE_MEMBER: MemberPose = { hop: 0, blink: false, singing: false };

/** How long the hop after a note lasts. */
const HOP_SECONDS = 0.16;
/** A blink every BLINK_EVERY s or so (each member at her own time), BLINK_SECONDS long. */
const BLINK_EVERY = 3.3;
const BLINK_SECONDS = 0.13;
const BLINK_OFFSET: Record<MemberId, number> = {
  yui: 0,
  mio: 1.7,
  ritsu: 0.6,
  tsumugi: 2.4,
  azusa: 1.1,
};
/** a blink: the eye rows above this go to skin, this one to a closed line */
const EYES_SHUT_ROW = 13;

/** Index of the last note starting at or before `t` (notes sorted by start), or -1. */
function lastStarted(notes: readonly NoteEvent[], t: number): number {
  let lo = 0;
  let hi = notes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.start <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * What the member is doing at `position` (song seconds): hopping on her notes (drummers on
 * kick, snare and crash only: the hi-hat would keep her bouncing), blinking, singing.
 */
export function memberPoseAt(
  member: MemberId,
  notes: readonly NoteEvent[],
  vocal: readonly NoteEvent[] | undefined,
  position: number,
  isDrums: boolean,
): MemberPose {
  let hop = 0;
  for (let k = lastStarted(notes, position); k >= 0; k--) {
    const n = notes[k]!;
    const age = position - n.start;
    if (age >= HOP_SECONDS) break;
    if (isDrums && !["kick", "snare", "crash"].includes(drumVoiceFor(n.pitch))) continue;
    hop = Math.max(hop, 1 - age / HOP_SECONDS);
  }
  const blink =
    (((position + BLINK_OFFSET[member]) % BLINK_EVERY) + BLINK_EVERY) % BLINK_EVERY < BLINK_SECONDS;
  let singing = false;
  if (vocal?.length) {
    const v = vocal[lastStarted(vocal, position)];
    singing = v !== undefined && position < v.start + v.duration;
  }
  return { hop, blink, singing };
}

/**
 * The member playing, `width` px wide and FIGURE_ROWS / FIGURE_COLS × that tall, from y:
 * her figure, her instrument, then her arms and hands over it. Mirrored for a left-handed
 * player.
 */
export function drawMemberPlaying(
  ctx: CanvasRenderingContext2D,
  member: MemberId,
  instrument: InstrumentId,
  pose: MemberPose,
  instrumentPose: InstrumentPose,
  x: number,
  y: number,
  width: number,
  color: string,
  mirror = false,
  gear?: Gear,
  outline = COLORS.d!,
) {
  const px = width / FIGURE_COLS;
  const lift = pose.hop > 0.5 ? px : 0;
  const top = y - lift;
  const grid = pixelGrid(ctx);
  const hair = HAIR[member];
  const flip = mirror && instrument !== "drums" && instrument !== "keys";
  const colOf = (c: number) => (flip ? FIGURE_COLS - 1 - c : c);
  const paint = (r: number, c: number, cell: string) => {
    ctx.fillStyle =
      cell === "h"
        ? hair.hair
        : cell === "k"
          ? hair.shade
          : cell === "l"
            ? hair.shine
            : cell === "i"
              ? IRIS[member]
              : cell === "a"
                ? hair.accessory
                : cell === "m"
                  ? color
                  : cell === "d"
                    ? outline
                    : COLORS[cell]!;
    const cc = colOf(c);
    const left = grid.x(x + cc * px);
    const t = grid.y(top + r * px);
    ctx.fillRect(left, t, grid.x(x + (cc + 1) * px) - left, grid.y(top + (r + 1) * px) - t);
  };
  figureCells(member).forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell === ".") return;
      if (
        pose.blink &&
        r - TOP_PAD >= 9 &&
        r - TOP_PAD <= EYES_SHUT_ROW &&
        (cell === "e" || cell === "q" || cell === "i")
      )
        cell = r - TOP_PAD === EYES_SHUT_ROW ? "e" : "s";
      if (cell === "x" && pose.singing) cell = "o";
      paint(r, c, cell);
      // an open mouth is taller
      if (cell === "o") paint(r + 1, c, "o");
    }),
  );
  const arms = ARMS[instrument];
  const [ac, ar, size] = arms.at;
  const left = flip ? FIGURE_COLS - ac - size : ac;
  const ix = x + left * px;
  const iy = top + (ar + TOP_PAD) * px;
  ctx.save();
  if (instrument === "keys") {
    // she plays from behind it: the keys face her hands, the panel faces the audience
    ctx.translate(0, iy + (size * px) / 2);
    ctx.scale(1, -1);
    ctx.translate(0, -(iy + (size * px) / 2));
  }
  drawPixelInstrument(ctx, instrument, instrumentPose, ix, iy, size * px, color, flip, gear);
  ctx.restore();
  const down = instrumentPose.frame !== "idle" && instrumentPose.amount > 0.4 ? 1 : 0;
  for (const [r, c] of arms.sleeves) paint(r + TOP_PAD, c, "n");
  for (const [r, c] of arms.hands) paint(r + TOP_PAD + down, c, "s");
}
