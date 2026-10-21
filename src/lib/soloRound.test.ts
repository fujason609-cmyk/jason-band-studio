import { createDemoProject, useProjectStore } from "@/stores/useProjectStore";
import { playedSong } from "@/stores/playedSong";
import type { NoteEvent } from "@/types/midi";
import { SOLO_BARS, SOLO_ORDER, detectKey, soloRound, type SoloTrack } from "./soloRound";

const n = (pitch: number, start = 0, duration = 1): NoteEvent => ({ pitch, start, duration, velocity: 0.8 });
const band = (notes: NoteEvent[]): SoloTrack[] => [
  { memberId: "yui", instrument: "lead-guitar", notes },
  { memberId: "mio", instrument: "bass", notes: [] },
  { memberId: "ritsu", instrument: "drums", notes: [n(36)] },
  { memberId: "tsumugi", instrument: "keys", notes: [] },
  { memberId: "azusa", instrument: "rhythm-guitar", notes: [] },
];

describe("solo round", () => {
  it("finds the song's key", () => {
    const cMajor = [60, 62, 64, 65, 67, 69, 71, 72, 64, 67, 60].map((p) => n(p));
    expect(detectKey(cMajor)).toEqual({ tonic: 0, minor: false });
    const aMinor = [57, 59, 60, 62, 64, 65, 67, 57, 60, 64, 57].map((p) => n(p));
    expect(detectKey(aMinor)).toEqual({ tonic: 9, minor: true });
    expect(detectKey([])).toEqual({ tonic: 0, minor: false });
  });

  it("gives each member 4 bars in turn after the song, Yui last, then ends together", () => {
    const round = soloRound(band([60, 64, 67].map((p) => n(p))), 120, 4, 10, "song");
    expect(round.spots.map((s) => s.member)).toEqual(SOLO_ORDER);
    const bar = 2; // 120 BPM, 4/4
    round.spots.forEach((s, i) => {
      expect(s.start).toBeCloseTo(10 + i * SOLO_BARS * bar);
      expect(s.end - s.start).toBeCloseTo(SOLO_BARS * bar);
    });
    expect(round.end).toBeCloseTo(10 + 5 * SOLO_BARS * bar + bar); // plus the final bar
    // the final chord: everyone plays at the last bar line
    const finale = round.spots.at(-1)!.end;
    for (const member of SOLO_ORDER) expect(round.notes[member].some((x) => Math.abs(x.start - finale) < 1e-3)).toBe(true);
    // nothing before the song ends or after the round
    for (const notes of Object.values(round.notes)) {
      expect(notes.every((x) => x.start >= 10 - 1e-6 && x.start < round.end)).toBe(true);
    }
  });

  it("solos in the song's key, on each member's own instrument", () => {
    const round = soloRound(band([62, 66, 69, 71, 74].map((p) => n(p))), 140, 4, 0, "d major");
    const dMajor = [2, 4, 6, 7, 9, 11, 1];
    for (const member of ["yui", "tsumugi", "azusa"] as const) {
      const spot = round.spots.find((s) => s.member === member)!;
      const own = round.notes[member].filter((x) => x.start >= spot.start - 1e-6 && x.start < spot.end);
      expect(own.length).toBeGreaterThan(8);
      expect(own.every((x) => dMajor.includes(x.pitch % 12))).toBe(true);
    }
    const drumSpot = round.spots[0]!;
    const drumSolo = round.notes.ritsu.filter((x) => x.start < drumSpot.end);
    expect(drumSolo.every((x) => x.pitch >= 35 && x.pitch <= 57)).toBe(true);
    // during Ritsu's solo nobody else plays
    for (const member of ["yui", "mio", "tsumugi", "azusa"] as const) {
      expect(round.notes[member].some((x) => x.start < drumSpot.end - 1e-6)).toBe(false);
    }
    // during Yui's solo, Ritsu keeps a beat and Mio plays the roots
    const yui = round.spots.at(-1)!;
    expect(round.notes.ritsu.some((x) => x.start >= yui.start && x.start < yui.end)).toBe(true);
    expect(round.notes.mio.some((x) => x.start >= yui.start && x.start < yui.end)).toBe(true);
  });

  it("is the same every time for the same song", () => {
    const a = soloRound(band([60, 64, 67].map((p) => n(p))), 120, 4, 0, "x");
    const b = soloRound(band([60, 64, 67].map((p) => n(p))), 120, 4, 0, "x");
    expect(b).toEqual(a);
  });
});

describe("the song as played", () => {
  beforeEach(() => useProjectStore.setState({ project: createDemoProject() }));

  it("is the stored song when the solo round is off", () => {
    const project = useProjectStore.getState().project;
    expect(playedSong(project, false).project).toBe(project);
    expect(playedSong(project, false).spots).toHaveLength(0);
  });

  it("adds the round after the song, and keeps note arrays when only the mix changes", () => {
    const project = useProjectStore.getState().project;
    const on = playedSong(project, true);
    expect(on.project.durationSeconds).toBeGreaterThan(project.durationSeconds);
    expect(on.spots).toHaveLength(5);
    useProjectStore.getState().setTrackVolume("yui", 0.4);
    const after = playedSong(useProjectStore.getState().project, true);
    after.project.tracks.forEach((t, i) => expect(t.notes).toBe(on.project.tracks[i]!.notes));
    expect(after.project.tracks.find((t) => t.memberId === "yui")!.volume).toBe(0.4);
  });
});
