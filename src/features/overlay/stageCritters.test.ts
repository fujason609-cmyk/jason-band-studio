import { drawCritters } from "./stageCritters";

/** A canvas stand-in that records where the turtle's shell (green) and the rabbit's fur (white) were painted. */
function fakeCanvas() {
  const shell: number[] = [];
  const fur: number[] = [];
  let fill = "";
  const ctx = {
    set fillStyle(v: string) {
      fill = v;
    },
    get fillStyle() {
      return fill;
    },
    fillRect: (x: number) => {
      if (fill === "#5f9f4e") shell.push(x);
      if (fill === "#fffdf8") fur.push(x);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, shell, fur };
}

const at = (position: number, loop?: { start: number; length: number }) => {
  const { ctx, shell, fur } = fakeCanvas();
  drawCritters({ ctx, x: 0, width: 390, floorY: 600, unit: 2, position, live: true, ink: "#2b2547", loop });
  return { turtle: Math.min(...shell), rabbit: Math.min(...fur), shell, fur };
};

describe("stage pets", () => {
  it("stay on the stage and wander about over time", () => {
    const seen = [0, 5, 10, 15, 20, 25, 30].map((t) => at(t));
    for (const s of seen) {
      for (const x of [...s.shell, ...s.fur]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(390);
      }
    }
    const turtles = seen.map((s) => s.turtle);
    expect(Math.max(...turtles) - Math.min(...turtles)).toBeGreaterThan(80);
  });

  it("are back where they started when a looping take comes round", () => {
    const loop = { start: 20, length: 12.8 };
    const first = at(20, loop);
    const last = at(32.8, loop);
    expect(Math.abs(last.turtle - first.turtle)).toBeLessThan(1);
    expect(Math.abs(last.rabbit - first.rabbit)).toBeLessThan(1);
  });
});
