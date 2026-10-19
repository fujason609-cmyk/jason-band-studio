import { DEMO_DURATION, DEMO_PARTS } from "@/features/band/demoSong";
import { createDemoProject, songLength, useProjectStore } from "./useProjectStore";

describe("project store", () => {
  beforeEach(() => useProjectStore.setState({ project: createDemoProject() }));

  it("starts with the five-member demo", () => {
    const { project } = useProjectStore.getState();
    expect(project.tracks.map((t) => t.memberId)).toEqual(["yui", "mio", "ritsu", "tsumugi", "azusa"]);
    expect(project.durationSeconds).toBeCloseTo(DEMO_DURATION);
  });

  it("toggles mute and solo for one member only", () => {
    const s = useProjectStore.getState();
    s.toggleMute("mio");
    s.toggleSolo("yui");
    const tracks = useProjectStore.getState().project.tracks;
    expect(tracks.find((t) => t.memberId === "mio")).toMatchObject({ muted: true, solo: false });
    expect(tracks.find((t) => t.memberId === "yui")).toMatchObject({ muted: false, solo: true });
    useProjectStore.getState().clearSolo();
    expect(useProjectStore.getState().project.tracks.every((t) => !t.solo)).toBe(true);
  });

  it("clamps tempo and volumes", () => {
    const s = useProjectStore.getState();
    s.setBpm(1000);
    s.setTrackVolume("ritsu", -1);
    s.setMasterVolume(3);
    const { project } = useProjectStore.getState();
    expect(project.bpm).toBe(240);
    expect(project.tracks.find((t) => t.memberId === "ritsu")!.volume).toBe(0);
    expect(project.masterVolume).toBe(1);
  });

  it("rounds song length up to a whole bar", () => {
    const tracks = createDemoProject().tracks.map((t) => ({ ...t, notes: [{ pitch: 60, start: 0, duration: 2.1, velocity: 1 }] }));
    // 120 BPM in 4/4 → 2 s bars
    expect(songLength(tracks, 120, 4)).toBeCloseTo(4);
    expect(songLength(tracks, 120, 3)).toBeCloseTo(3);
  });
});

describe("demo song", () => {
  it("keeps every part sorted and inside the song", () => {
    for (const notes of Object.values(DEMO_PARTS)) {
      expect(notes.length).toBeGreaterThan(0);
      notes.forEach((n, i) => {
        expect(n.start + n.duration).toBeLessThanOrEqual(DEMO_DURATION + 1e-6);
        if (i > 0) expect(n.start).toBeGreaterThanOrEqual(notes[i - 1]!.start);
      });
    }
  });
});
