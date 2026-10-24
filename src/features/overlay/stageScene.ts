import { pixelGrid } from "@/features/band/pixelInstruments";
import { FIGURE_COLS, FIGURE_ROWS } from "@/features/band/pixelMembers";
import type { MemberId } from "@/features/band/types";
import { STAGE } from "./drawHighway";

/**
 * The big stage the intro skit and the stage views share: two rows, Mio, Yui and Azusa at
 * the front, Mugi and Ritsu on a riser behind (`PLACES`, shares of the stage's width), a dark
 * back wall, the riser and a plank floor, a light per member and red drapes at the sides.
 */
export const PLACES: Record<MemberId, { x: number; back: boolean }> = {
  tsumugi: { x: 0.27, back: true },
  ritsu: { x: 0.73, back: true },
  mio: { x: 0.17, back: false },
  yui: { x: 0.5, back: false },
  azusa: { x: 0.83, back: false },
};
export const BACK_SCALE = 0.88;
export const CURTAIN = { cloth: "#8c1c2c", fold: "#6a1222", hem: "#d9a441" };
const WALL = ["#2a1830", "#120a18"] as const;

/**
 * From the front row's feet up to the back row's heads, in figure widths (the riser is a
 * girl tall; the back row stands on it, BACK_SCALE smaller).
 */
export const STAGE_HEIGHT_IN_FIGURES = (1.02 + BACK_SCALE) * (FIGURE_ROWS / FIGURE_COLS) + 0.05;

export interface StageBox {
  /** the stage's left edge and width (the members stand across it) */
  left: number;
  width: number;
  /** where the front row's feet are */
  feet: number;
  /** the widest a figure may be (it is also kept to a third of the stage's width) */
  maxFigure: number;
}

/** Where everything stands on a stage of this size. */
export function stageLayout(box: StageBox) {
  const fw = Math.min(box.width / 3.3, box.maxFigure);
  const tall = (fw * FIGURE_ROWS) / FIGURE_COLS;
  const frontFeet = box.feet;
  const frontFloor = frontFeet - fw * 0.28;
  const riserTop = frontFeet - tall * 1.02 - fw * 0.15;
  const place = (m: MemberId) => {
    const p = PLACES[m];
    const scale = p.back ? BACK_SCALE : 1;
    return {
      x: box.left + box.width * p.x,
      feet: p.back ? riserTop + fw * 0.1 : frontFeet,
      w: fw * scale,
      h: tall * scale,
      back: p.back,
    };
  };
  return { fw, tall, frontFeet, frontFloor, riserTop, place };
}

export type StageLayout = ReturnType<typeof stageLayout>;

/** The set: the back wall from `top`, the riser, and the floor down to `bottom`, across `width`. */
export function paintStageSet(ctx: CanvasRenderingContext2D, width: number, stage: StageLayout, top: number, bottom: number) {
  const grid = pixelGrid(ctx);
  const wall = ctx.createLinearGradient(0, top, 0, stage.riserTop);
  wall.addColorStop(0, WALL[0]);
  wall.addColorStop(1, WALL[1]);
  ctx.fillStyle = wall;
  ctx.fillRect(0, top, width, stage.riserTop - top);
  ctx.fillStyle = STAGE.riser;
  ctx.fillRect(0, stage.riserTop, width, stage.frontFloor - stage.riserTop);
  ctx.fillStyle = STAGE.edge;
  ctx.fillRect(0, grid.y(stage.riserTop), width, 3);
  ctx.fillStyle = STAGE.floor;
  ctx.fillRect(0, stage.frontFloor, width, bottom - stage.frontFloor);
  ctx.fillStyle = STAGE.plank;
  for (let y = stage.frontFloor + 9; y < bottom; y += 9) ctx.fillRect(0, grid.y(y), width, 2);
  ctx.fillStyle = STAGE.edge;
  ctx.fillRect(0, grid.y(stage.frontFloor), width, 3);
}

/** A spotlight from `top` down to a pool at someone's feet, in `color`. */
export function cone(ctx: CanvasRenderingContext2D, x: number, top: number, feet: number, fw: number, color: string, alpha: number) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const g = ctx.createLinearGradient(0, top, 0, feet);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x - fw * 0.12, top);
  ctx.lineTo(x + fw * 0.12, top);
  ctx.lineTo(x + fw * 0.62, feet);
  ctx.lineTo(x - fw * 0.62, feet);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, feet, fw * 0.62, fw * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * The curtains: a drape at each side, `open` 1 when drawn back (0 closed, meeting in the
 * middle), down to `bottom`, with a hem just above `hem`; a scalloped valance along the
 * top, its bottom at `valance`.
 */
export function paintCurtains(
  ctx: CanvasRenderingContext2D,
  width: number,
  bottom: number,
  valance: number,
  open: number,
  hem = bottom,
) {
  const grid = pixelGrid(ctx);
  const drape = width * 0.07;
  const closed = (width / 2) * (1 - open);
  for (const side of [0, 1]) {
    const w = drape + closed;
    const x = side === 0 ? 0 : width - w;
    ctx.fillStyle = CURTAIN.cloth;
    ctx.fillRect(x, 0, w, bottom);
    ctx.fillStyle = CURTAIN.fold;
    const step = Math.max(8, drape / 2.5);
    for (let fx = x + step / 2; fx < x + w; fx += step) ctx.fillRect(grid.x(fx), 0, Math.max(2, step * 0.28), bottom);
    ctx.fillStyle = CURTAIN.hem;
    ctx.fillRect(x, hem - 6, w, 4);
  }
  ctx.fillStyle = CURTAIN.cloth;
  ctx.fillRect(0, 0, width, valance);
  ctx.fillStyle = CURTAIN.fold;
  const scallop = width / 12;
  for (let x = 0; x < width; x += scallop) {
    ctx.beginPath();
    ctx.ellipse(x + scallop / 2, valance, scallop / 2, 8, 0, 0, Math.PI);
    ctx.fill();
  }
  ctx.fillStyle = CURTAIN.hem;
  ctx.fillRect(0, valance - 3, width, 3);
}
