import { poseAt, pixelGrid } from "@/features/band/pixelInstruments";
import type { LaneInput } from "@/features/timeline/drawTimeline";

/**
 * The club room's tea time, in the Reels frame's top band: a little table with a
 * strawberry shortcake and one teacup per member in her colour (a cup hops when its
 * member plays, and steams while the song plays), and a pet turtle paddling slowly from
 * one side to the other underneath it, between the legs. Pixel art drawn for this project, no
 * character artwork. Driven by the song position, so the video is the same every take.
 *
 * Cells: "d" outline (the theme's ink: dark on paper, cream on the evening theme), "w" white, "m" the member's colour, "n" wood, "r" strawberry,
 * "y" sponge, "g" / "G" shell, "l" skin, "k" eye.
 */
type Sprite = readonly string[];

const CUP: Sprite = [
  "dddddd..",
  "dwwwwddd",
  "dmmmmd.d",
  "dmmmmddd",
  ".dddd...",
  "dwwwwwwd",
];

const CAKE: Sprite = [
  "...rr...",
  "..rrrr..",
  "dddddddd",
  "dwwwwwwd",
  "dyyyyyyd",
  "dwrwwrwd",
  "dyyyyyyd",
  "dddddddd",
];

const TURTLE: readonly Sprite[] = [
  [
    "....dddddd......",
    "...dgggGggd.....",
    "..dgGggggGgd.dd.",
    ".dggggGgggggdlkd",
    ".ddddddddddddlld",
    "..ll......ll.dd.",
  ],
  [
    "....dddddd......",
    "...dgggGggd.....",
    "..dgGggggGgd.dd.",
    ".dggggGgggggdlkd",
    ".ddddddddddddlld",
    ".ll........ll...",
  ],
];

const COLORS: Record<string, string> = {
  d: "#2b2547",
  w: "#fffdf8",
  n: "#b07a44",
  r: "#e8384f",
  y: "#f3cf7a",
  g: "#5f9f4e",
  G: "#3e7a35",
  l: "#a9d28e",
  k: "#15132a",
};

/** Grid of the whole corner, in cells: cups, cake and the table under them. */
const CUP_W = 8;
const CUP_GAP = 3;
const CAKE_W = 8;
const TABLE_W = 2 * (CUP_W + CUP_GAP) + CAKE_W + 3 * (CUP_W + CUP_GAP) + CUP_GAP;
const STEAM_H = 4;
const TURTLE_H = 6;
const SCENE_H = STEAM_H + CAKE.length + 3 + TURTLE_H; // steam, cups/cake, table top, the turtle's row
/** One crossing of the band, seconds (song time). */
const TURTLE_CROSSING = 26;

function paint(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, u: number, member: string, ink: string, flip = false) {
  const w = sprite[0]!.length;
  const grid = pixelGrid(ctx);
  sprite.forEach((row, r) =>
    [...row].forEach((c, i) => {
      if (c === ".") return;
      ctx.fillStyle = c === "m" ? member : c === "d" ? ink : COLORS[c]!;
      const col = flip ? w - 1 - i : i;
      const left = grid.x(x + col * u);
      const top = grid.y(y + r * u);
      ctx.fillRect(left, top, grid.x(x + (col + 1) * u) - left, grid.y(y + (r + 1) * u) - top);
    }),
  );
}

export interface TeaCornerInput {
  ctx: CanvasRenderingContext2D;
  /** the band to draw in */
  x: number;
  y: number;
  width: number;
  height: number;
  lanes: LaneInput[];
  /** song seconds of the sound being heard */
  position: number;
  /** things move (steam, hops, paddling): only while playing, not with reduced motion */
  live: boolean;
  /** the outline colour: the theme's ink, so it shows on either background */
  ink: string;
}

export function drawTeaCorner({ ctx, x, y, width, height, lanes, position, live, ink }: TeaCornerInput) {
  // Instagram's back and camera buttons sit at the band's top corners: keep to the middle
  // 64% and the lower part of the band
  const usable = width * 0.64;
  const u = Math.max(1, Math.min(usable / TABLE_W, (height * 0.86) / SCENE_H));
  const sceneW = TABLE_W * u;
  const sx = x + (width - sceneW) / 2;
  const bottom = y + height - 4;
  const sy = bottom - SCENE_H * u;

  const topY = sy + (STEAM_H + CAKE.length) * u;

  // the turtle, under the table: paddling back and forth along the bottom of the band
  const span = Math.max(1, usable - 16 * u);
  const phase = (position / TURTLE_CROSSING) % 2;
  const goingRight = phase < 1;
  const tx = x + (width - usable) / 2 + (goingRight ? phase : 2 - phase) * span;
  const paddle = live ? Math.floor(position * 3) % 2 : 0;
  const bob = live ? Math.round(Math.sin(position * 2.4) * u * 0.5) : 0;
  paint(ctx, TURTLE[paddle]!, tx, bottom - TURTLE_H * u + bob, u, "#000", ink, !goingRight);

  // the table: a wooden top on two legs, in front of the turtle
  ctx.fillStyle = ink;
  ctx.fillRect(Math.round(sx), Math.round(topY), Math.round(sceneW), Math.round(3 * u));
  ctx.fillStyle = COLORS.n!;
  ctx.fillRect(Math.round(sx + u), Math.round(topY + u), Math.round(sceneW - 2 * u), Math.round(u));
  for (const lx of [sx + 3 * u, sx + sceneW - 5 * u]) {
    ctx.fillStyle = ink;
    ctx.fillRect(Math.round(lx), Math.round(topY + 3 * u), Math.round(2 * u), Math.round(TURTLE_H * u - 2));
    ctx.fillStyle = COLORS.n!;
    ctx.fillRect(Math.round(lx + u * 0.5), Math.round(topY + 3 * u), Math.max(1, Math.round(u)), Math.round(TURTLE_H * u - 2 - u));
  }

  // cups and the cake on it, cake in the middle
  const cupsY = topY - CUP.length * u;
  let cx = sx + CUP_GAP * u;
  lanes.forEach((lane, i) => {
    if (i === 2) {
      paint(ctx, CAKE, cx, topY - CAKE.length * u, u, lane.color, ink);
      cx += (CAKE_W + CUP_GAP) * u;
    }
    // a hop when her note starts; steam rising while the song plays
    const hop = live && lane.audible ? poseAt(lane.notes, position, lane.instrument ?? "keys").amount : 0;
    const lift = Math.round(hop * 2) * u;
    paint(ctx, CUP, cx, cupsY - lift, u, lane.color, ink);
    if (live) {
      ctx.fillStyle = "#ffffff";
      for (let k = 0; k < 3; k++) {
        const rise = (position * 1.6 + k / 3 + i * 0.37) % 1;
        const wave = Math.sin((position * 3 + k * 2 + i) * 1.7) * u;
        ctx.globalAlpha = 0.55 * (1 - rise);
        ctx.fillRect(Math.round(cx + 2.5 * u + wave), Math.round(cupsY - lift - u - rise * STEAM_H * u), Math.round(u), Math.round(u));
      }
      ctx.globalAlpha = 1;
    }
    cx += (CUP_W + CUP_GAP) * u;
  });
}
