import { Midi } from "@tonejs/midi";
import { buildTracksFromMapping, familyOf, suggestMapping } from "./midiMapper";
import { MidiParseError, parseMidi } from "./midiParser";

function makeMidi() {
  const midi = new Midi();
  midi.header.setTempo(100);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
  const add = (name: string, program: number, channel: number, pitches: number[]) => {
    const t = midi.addTrack();
    t.name = name;
    t.channel = channel;
    t.instrument.number = program;
    pitches.forEach((p, i) => t.addNote({ midi: p, time: i * 0.6, duration: 0.5, velocity: 0.8 }));
  };
  add("Strings", 48, 4, [60]);
  add("Piano", 0, 0, [60, 64, 67, 72]);
  add("Drums", 0, 9, [36, 38, 42]);
  add("Overdrive", 29, 1, [64, 67, 69, 71, 72]);
  add("Finger bass", 33, 2, [36, 43]);
  add("Clean gtr", 27, 3, [52, 55, 59]);
  midi.addTrack(); // an empty track that should be dropped
  return midi.toArray();
}

describe("parseMidi", () => {
  it("turns tracks into note events in seconds and keeps timing metadata", () => {
    const parsed = parseMidi(makeMidi(), "song.mid");
    expect(parsed.tracks).toHaveLength(6);
    expect(parsed.meta.tempos[0]?.bpm).toBeCloseTo(100);
    expect(parsed.meta.timeSignatures[0]).toMatchObject({ numerator: 3, denominator: 4 });
    expect(parsed.meta.ppq).toBeGreaterThan(0);

    const piano = parsed.tracks.find((t) => t.name === "Piano")!;
    expect(piano.notes[1]).toMatchObject({ pitch: 64 });
    expect(piano.notes[1]!.start).toBeCloseTo(0.6, 2);
    expect(piano.notes[1]!.duration).toBeCloseTo(0.5, 2);

    const drums = parsed.tracks.find((t) => t.name === "Drums")!;
    expect(drums.isPercussion).toBe(true);
  });

  it("rejects files that are not MIDI", () => {
    expect(() => parseMidi(new TextEncoder().encode("hello"), "notes.mid")).toThrow(MidiParseError);
  });

  it("rejects MIDI files without notes", () => {
    const midi = new Midi();
    midi.addTrack();
    expect(() => parseMidi(midi.toArray(), "empty.mid")).toThrow(/no notes/);
  });
});

describe("track mapping", () => {
  const parsed = parseMidi(makeMidi(), "song.mid");
  const idx = (name: string) => parsed.tracks.find((t) => t.name === name)!.index;

  it("classifies GM families", () => {
    expect(familyOf({ isPercussion: false, program: 33 })).toBe("bass");
    expect(familyOf({ isPercussion: false, program: 27 })).toBe("guitar");
    expect(familyOf({ isPercussion: false, program: 2 })).toBe("keys");
    expect(familyOf({ isPercussion: false, program: 81 })).toBe("lead");
    expect(familyOf({ isPercussion: true, program: 0 })).toBe("drums");
  });

  it("trusts a clear track name over the program (scores often have program 0)", () => {
    expect(familyOf({ isPercussion: false, program: 0, name: "Bass" })).toBe("bass");
    expect(familyOf({ isPercussion: false, program: 0, name: "Synth Bass" })).toBe("bass");
    expect(familyOf({ isPercussion: false, program: 0, name: "Lead Guitar" })).toBe("guitar");
    expect(familyOf({ isPercussion: false, program: 0, name: "Drum Kit" })).toBe("drums");
    expect(familyOf({ isPercussion: false, program: 30, name: "ストリングス Pad" })).toBe("keys");
    expect(familyOf({ isPercussion: false, program: 0, name: "ベース" })).toBe("bass");
    expect(familyOf({ isPercussion: false, program: 0, name: "节奏吉他" })).toBe("guitar");
    expect(familyOf({ isPercussion: false, program: 0, name: "Bassoon" })).toBe("keys"); // not a bass guitar: falls back to program 0
    expect(familyOf({ isPercussion: false, program: 33, name: "Track 3" })).toBe("bass"); // no hint: program decides
  });

  it("suggests a member for each part and leaves extras out", () => {
    const { assignments } = suggestMapping(parsed);
    const who = (name: string) => assignments.find((a) => a.midiTrackIndex === idx(name))?.memberId;
    expect(who("Drums")).toBe("ritsu");
    expect(who("Finger bass")).toBe("mio");
    expect(who("Overdrive")).toBe("yui"); // busiest guitar gets the lead
    expect(who("Clean gtr")).toBe("azusa");
    expect(who("Piano")).toBe("tsumugi");
    expect(who("Strings")).toBeNull(); // every melodic seat is taken
  });

  it("builds five tracks, merges shared parts and keeps mixer settings", () => {
    const assignments = [
      { midiTrackIndex: idx("Piano"), memberId: "tsumugi" as const },
      { midiTrackIndex: idx("Strings"), memberId: "tsumugi" as const },
      { midiTrackIndex: idx("Drums"), memberId: "yui" as const },
    ];
    const previous = buildTracksFromMapping(parsed, [], []).tracks.map((t) =>
      t.memberId === "tsumugi" ? { ...t, volume: 0.3, muted: true } : t,
    );
    const song = buildTracksFromMapping(parsed, assignments, previous);

    expect(song.tracks).toHaveLength(5);
    expect(song.baseBpm).toBeCloseTo(100);
    expect(song.beatsPerBar).toBe(3);

    const mugi = song.tracks.find((t) => t.memberId === "tsumugi")!;
    expect(mugi.notes).toHaveLength(5);
    expect(mugi.notes.map((n) => n.start)).toEqual([...mugi.notes.map((n) => n.start)].sort((a, b) => a - b));
    expect(mugi).toMatchObject({ volume: 0.3, muted: true, instrument: "keys" });

    // a drum part handed to a guitarist switches her to the drum kit
    expect(song.tracks.find((t) => t.memberId === "yui")!.instrument).toBe("drums");
    expect(song.tracks.find((t) => t.memberId === "mio")!.notes).toHaveLength(0);
  });
});
