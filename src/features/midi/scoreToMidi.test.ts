import * as alphaTab from "@coderline/alphatab";
import { Midi } from "@tonejs/midi";
import { REPEAT_TEMPO_MUSICXML, TWO_PART_MUSICXML as MUSICXML } from "@/test/scores";
import { parseMidi } from "./midiParser";
import { assignChannels, padVoices, scoreToMidi } from "./scoreToMidi";

const bytes = (s: string) => new TextEncoder().encode(s);
const pitchesOf = (midi: Midi) =>
  midi.tracks
    .filter((t) => t.notes.length)
    .map((t) => t.notes.map((n) => n.midi))
    .sort((a, b) => b[0]! - a[0]!);

describe("score files → MIDI", () => {
  it("turns MusicXML into a MIDI file with every part's notes, in time", () => {
    const { midi, title } = scoreToMidi(bytes(MUSICXML));
    const parsed = new Midi(midi);
    expect(title).toBe("Test Song");
    expect(pitchesOf(parsed)).toEqual([
      [60, 62, 64, 65],
      [36, 43],
    ]);
    const piano = parsed.tracks.find((t) => t.notes[0]?.midi === 60)!;
    expect(piano.notes[1]!.time).toBeCloseTo(0.5, 2); // quarter notes at 120 BPM
    expect(parsed.tracks.map((t) => t.name)).toEqual(expect.arrayContaining(["Piano", "Bass"]));
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

  it("plays a Guitar Pro file's repeats twice and follows its tempo changes, in seconds", () => {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes(REPEAT_TEMPO_MUSICXML), new alphaTab.Settings());
    const gp = new alphaTab.exporter.Gp7Exporter().export(score, new alphaTab.Settings());
    const { tracks, meta } = parseMidi(scoreToMidi(gp).midi, "repeat.gp");
    const notes = tracks.flatMap((t) => t.notes);
    const twice = [60, 62, 64, 65, 67, 69, 71, 72];
    expect(notes.map((n) => n.pitch)).toEqual([...twice, ...twice, 72, 74, 76, 77]);
    // four bars at 120 (half a second a beat), then a second a beat
    expect(notes[8]!.start).toBeCloseTo(4, 2); // the repeat starts again at bar 3's time
    expect(notes[16]!.start).toBeCloseTo(8, 2);
    expect(notes[17]!.start).toBeCloseTo(9, 2);
    expect(meta.tempos.map((t) => Math.round(t.bpm))).toEqual(expect.arrayContaining([120, 60]));
  });

  it("keeps every part apart with its own name, even when the file gives them all one channel", () => {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes(MUSICXML), new alphaTab.Settings());
    // like Songsterr's GP5 converter: every part on the same (out of range) channel and program
    score.tracks.forEach((t, i) => {
      t.name = ["小提琴", "コントラバス"][i]!;
      t.playbackInfo.program = i === 0 ? 40 : 43;
      t.playbackInfo.primaryChannel = 39;
      t.playbackInfo.secondaryChannel = 40;
    });
    const gp = new alphaTab.exporter.Gp7Exporter().export(score, new alphaTab.Settings());
    const parsed = parseMidi(scoreToMidi(gp).midi, "song.mid");
    expect(parsed.tracks.map((t) => t.name).sort()).toEqual(["コントラバス", "小提琴"]);
    expect(new Set(parsed.tracks.map((t) => t.channel)).size).toBe(2);
    expect(parsed.tracks.find((t) => t.name === "小提琴")!.notes.map((n) => n.pitch)).toEqual([60, 62, 64, 65]);
  });

  it("gives each part one channel from 0 to 15, drums on 9", () => {
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes(MUSICXML), new alphaTab.Settings());
    // the GP5 reader can hand several parts one shared playback object
    score.tracks[0]!.playbackInfo.program = 60;
    score.tracks[1]!.playbackInfo = score.tracks[0]!.playbackInfo;
    const firstBeat = score.tracks[1]!.staves[0]!.bars[0]!.voices[0]!.beats[0]!;
    const change = new alphaTab.model.Automation();
    change.type = alphaTab.model.AutomationType.Instrument;
    change.value = 60;
    firstBeat.automations.push(change);
    assignChannels(score);
    expect(score.tracks.map((t) => [t.playbackInfo.primaryChannel, t.playbackInfo.secondaryChannel])).toEqual([
      [0, 0],
      [1, 1],
    ]);
    // one instrument for every part is a guess: left to the part names
    expect(score.tracks.map((t) => t.playbackInfo.program)).toEqual([0, 0]);
    expect(firstBeat.automations).toHaveLength(0);
  });

  it("gives every bar of a staff the same number of voices", () => {
    // a GP5 bar whose second voice was stored as zero beats has one voice less than its neighbours
    const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(bytes(MUSICXML), new alphaTab.Settings());
    const staff = score.tracks[0]!.staves[0]!;
    const extra = new alphaTab.model.Voice();
    staff.bars[0]!.addVoice(extra);
    extra.addBeat(new alphaTab.model.Beat());
    padVoices(score);
    expect(staff.bars.map((b) => b.voices.length).every((n) => n === staff.bars[0]!.voices.length)).toBe(true);
    expect(staff.bars.at(-1)!.voices.at(-1)!.beats).toHaveLength(1);
  });

  it("rejects files that aren't scores", () => {
    expect(() => scoreToMidi(bytes("hello"))).toThrow();
  });
});
