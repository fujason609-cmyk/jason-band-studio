import type { LaneInput } from "@/features/timeline/drawTimeline";
import { drawTeaCorner } from "./drawTeaCorner";

/** A canvas stand-in that records where green (the turtle's shell) was painted. */
function fakeCanvas() {
  const shell: number[] = [];
  let fill = "";
  const ctx = {
    set fillStyle(v: string) {
      fill = v;
    },
    get fillStyle() {
      return fill;
    },
    globalAlpha: 1,
    fillRect: (x: number) => {
      if (fill === "#5f9f4e") shell.push(x);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, shell };
}

const lanes = ["#e0507a", "#3d6bd6", "#d08309", "#9161cc", "#1b927e"].map(
  (color): LaneInput => ({ label: "", color, notes: [], audible: true, isDrums: false, selected: false, instrument: "lead-guitar" }),
);

describe("tea corner", () => {
  it("draws the table, cups and turtle inside the band, and the turtle paddles across over time", () => {
    const at = (position: number) => {
      const { ctx, shell } = fakeCanvas();
      drawTeaCorner({ ctx, x: 0, y: 0, width: 390, height: 97, lanes, position, live: true, ink: "#f4efe6" });
      expect(shell.length).toBeGreaterThan(0);
      for (const x of shell) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(390);
      }
      return Math.min(...shell);
    };
    const start = at(0);
    expect(at(13)).toBeGreaterThan(start + 50); // halfway across
    expect(Math.abs(at(52) - start)).toBeLessThan(2); // and back again
  });

  it("in a looping take goes there and back once per loop, so the last frame meets the first", () => {
    const at = (position: number) => {
      const { ctx, shell } = fakeCanvas();
      drawTeaCorner({ ctx, x: 0, y: 0, width: 390, height: 97, lanes, position, live: false, ink: "#f4efe6", loop: { start: 20, length: 12.8 } });
      return Math.min(...shell);
    };
    expect(Math.abs(at(20.5 + 12.8) - at(20.5))).toBeLessThan(1); // a loop later: the same place
    expect(at(26.4)).toBeGreaterThan(at(20) + 50); // the far side halfway through
  });
});
