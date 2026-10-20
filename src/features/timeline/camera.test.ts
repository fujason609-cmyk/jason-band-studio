import { cameraLeft, followStep } from "./camera";
import { TIMELINE_GUTTER } from "./layout";

describe("following the playhead", () => {
  const width = 390;
  const zoom = 60;

  it("keeps the playhead 30% in from the left, clamped to the song", () => {
    expect(cameraLeft(0, zoom, width, 100)).toBe(0); // start of the song: no negative scroll
    const mid = cameraLeft(50, zoom, width, 100);
    expect(TIMELINE_GUTTER + 50 * zoom - mid).toBeCloseTo(width * 0.3);
    const content = TIMELINE_GUTTER * 2 + 100 * zoom;
    expect(cameraLeft(100, zoom, width, 100)).toBe(content - width); // end of the song: no scrolling past it
  });

  it("moves the score a little every frame instead of a page at a time", () => {
    // one 60 fps frame of playback is a fraction of a pixel to a few pixels of scroll
    const a = cameraLeft(30, zoom, width, 100);
    const b = cameraLeft(30 + 1 / 60, zoom, width, 100);
    expect(b - a).toBeCloseTo(zoom / 60);
    expect(followStep(a, b)).toBe(b);
  });

  it("glides to a far-away camera over a few frames instead of jumping", () => {
    let scroll = 0;
    const target = 2000;
    const path: number[] = [];
    while (scroll !== target && path.length < 60) path.push((scroll = followStep(scroll, target)));
    expect(path[0]).toBe(500); // a quarter of the way, not all of it
    expect(path.length).toBeGreaterThan(5);
    expect(path.length).toBeLessThan(25); // there in well under half a second
    expect(path.at(-1)).toBe(target);
  });
});
