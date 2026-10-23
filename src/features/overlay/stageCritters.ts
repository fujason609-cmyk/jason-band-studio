import { pixelGrid } from "@/features/band/pixelInstruments";

/**
 * The club room's pets on the stage floor, in front of the band: a turtle paddling slowly
 * and a rabbit hopping about, each wandering on its own path. Pixel art drawn for this
 * project. The paths look random but are sums of sines of the song position, so a take is
 * the same every time, and in a looping take (the highlight) they repeat once per loop, so
 * the last frame meets the first.
 *
 * Cells: "d" outline (the theme's ink), "g" / "G" shell, "l" turtle skin, "k" eye,
 * "w" / "W" fur, "p" inner ear and nose.
 */
type Sprite = readonly string[];

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

/** sitting, and stretched out mid-hop */
const RABBIT: readonly Sprite[] = [
  [
    "........dd.dd.",
    ".......dpd.dpd",
    ".......dpd.dpd",
    "..ddddddwddwd.",
    ".dwwwwwwwwwkwd",
    "dWwwwwwwwwwwpd",
    "dWwwwwwwwwwwd.",
    ".dwwWwwwwWwd..",
    "..dd.dd.dd.dd.",
  ],
  [
    ".........dd.dd",
    "........dpd.dp",
    "........dpd.dp",
    "...dddddddwddw",
    ".ddwwwwwwwwwkw",
    "dWwwwwwwwwwwwp",
    ".dwwwwwwwwwwd.",
    "..dd......ddd.",
    "..............",
  ],
];

const COLORS: Record<string, string> = {
  g: "#5f9f4e",
  G: "#3e7a35",
  l: "#a9d28e",
  k: "#15132a",
  w: "#fffdf8",
  W: "#e3dccf",
  p: "#f4a3b4",
};

function paint(ctx: CanvasRenderingContext2D, sprite: Sprite, x: number, y: number, u: number, ink: string, flip: boolean) {
  const w = sprite[0]!.length;
  const grid = pixelGrid(ctx);
  sprite.forEach((row, r) =>
    [...row].forEach((c, i) => {
      if (c === ".") return;
      ctx.fillStyle = c === "d" ? ink : COLORS[c]!;
      const col = flip ? w - 1 - i : i;
      const left = grid.x(x + col * u);
      const top = grid.y(y + r * u);
      ctx.fillRect(left, top, grid.x(x + (col + 1) * u) - left, grid.y(y + (r + 1) * u) - top);
    }),
  );
}

/** A wandering path, 0–1 across, and which way it's heading, at `t` (0–1 of a period). */
function wander(t: number, waves: readonly (readonly [number, number, number])[]) {
  let x = 0;
  let dx = 0;
  let sum = 0;
  for (const [k, amp, phase] of waves) {
    x += amp * Math.sin(2 * Math.PI * k * t + phase);
    dx += amp * k * Math.cos(2 * Math.PI * k * t + phase);
    sum += amp;
  }
  return { x: 0.5 + (0.5 * x) / sum, right: dx >= 0 };
}

/** Seconds for one turtle / rabbit period when the take doesn't loop. */
const PERIOD = 40;
const TURTLE_WAVES = [[1, 1, 0.3], [2, 0.35, 2.1]] as const;
const RABBIT_WAVES = [[2, 1, 4.0], [3, 0.6, 1.2], [5, 0.25, 0.4]] as const;

export interface CritterInput {
  ctx: CanvasRenderingContext2D;
  /** the floor strip they walk on */
  x: number;
  width: number;
  /** where their feet go */
  floorY: number;
  /** a pixel art cell, px */
  unit: number;
  position: number;
  /** things move (paddling, hopping): only while playing, not with reduced motion */
  live: boolean;
  ink: string;
  /** a looping take: the paths repeat once per loop */
  loop?: { start: number; length: number; at?: number };
}

export function drawCritters({ ctx, x, width, floorY, unit, position, live, ink, loop }: CritterInput) {
  const period = loop ? loop.length : PERIOD;
  const at = loop ? (loop.at ?? position) - loop.start : position;
  // (a hair under 1 is the same instant as 0: the loop has come round)
  const raw = (((at / period) % 1) + 1) % 1;
  const t = raw > 1 - 1e-9 ? 0 : raw;

  // the turtle, slow
  const turtleW = TURTLE[0]![0]!.length * unit;
  const turtle = wander(t, TURTLE_WAVES);
  // whole numbers of paddles and hops per period, so a loop's last frame meets its first
  const paddles = 2 * Math.max(1, Math.round(period * 1.5));
  const paddle = live ? Math.floor(t * paddles) % 2 : 0;
  paint(ctx, TURTLE[paddle]!, x + turtle.x * (width - turtleW), floorY - TURTLE[0]!.length * unit, unit, ink, !turtle.right);

  // the rabbit, quicker, hopping as it goes
  const rabbitW = RABBIT[0]![0]!.length * unit;
  const rabbit = wander((t + 0.37) % 1, RABBIT_WAVES);
  const hops = Math.max(1, Math.round(period * 2.2));
  const hopPhase = live ? (t * hops) % 1 : 0;
  const hopping = live && hopPhase < 0.45;
  const lift = hopping ? Math.sin((hopPhase / 0.45) * Math.PI) * unit * 3 : 0;
  const frame = RABBIT[hopping ? 1 : 0]!;
  paint(ctx, frame, x + rabbit.x * (width - rabbitW), floorY - frame.length * unit - lift, unit, ink, !rabbit.right);
}
