import * as alphaTab from "@coderline/alphatab";
import { Midi } from "@tonejs/midi";
import { TWO_PART_MUSICXML as MUSICXML } from "@/test/scores";
import { scoreToMidi } from "./scoreToMidi";

const bytes = (s: string) => new TextEncoder().encode(s);
const pitchesOf = (midi: Midi) =>
  midi.tracks
    .filter((t) => t.notes.length)
    .map((t) => t.notes.map((n) => n.midi))
    .sort((a, b) => b[0]! - a[0]!);

describe("score files → MIDI", () => {
  it("turns MusicXML into a MIDI file with every part's notes, in time", () => {
    const { midi, title, trackNames } = scoreToMidi(bytes(MUSICXML));
    const parsed = new Midi(midi);
    expect(title).toBe("Test Song");
    expect(pitchesOf(parsed)).toEqual([
      [60, 62, 64, 65],
      [36, 43],
    ]);
    const piano = parsed.tracks.find((t) => t.notes[0]?.midi === 60)!;
    expect(piano.notes[1]!.time).toBeCloseTo(0.5, 2); // quarter notes at 120 BPM
    expect(Object.values(trackNames)).toEqual(expect.arrayContaining(["Piano", "Bass"]));
  });

  it("reads Guitar Pro files too", () => {
    // build a real .gp (Guitar Pro 7) file from the same score with alphaTab's own exporter
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes(MUSICXML), new alphaTab.Settings());
    const gp = new alphaTab.exporter.Gp7Exporter().export(score, new alphaTab.Settings());
    const parsed = new Midi(scoreToMidi(gp).midi);
    expect(pitchesOf(parsed)).toEqual([
      [60, 62, 64, 65],
      [36, 43],
    ]);
  });

  it("rejects files that aren't scores", () => {
    expect(() => scoreToMidi(bytes("hello"))).toThrow();
  });
});
