import { Midi } from "@tonejs/midi";
import { buildTracksFromMapping, familyOf, isVocalName, memberFromName, quarterBeatsPerBar, suggestMapping } from "./midiMapper";
import { MidiParseError, attachBends, decodeMidiText, parseMidi } from "./midiParser";

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

/** A Standard MIDI File from raw track events (format 1, 96 ticks a beat). */
function smf(...tracks: number[][]) {
  const chunk = (events: number[]) => {
    const n = events.length;
    return [0x4d, 0x54, 0x72, 0x6b, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, ...events];
  };
  return new Uint8Array([
    ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length + 1, 0, 96],
    ...chunk([0, 0xff, 0x2f, 0]),
    ...tracks.flatMap((events) => chunk([...events, 0, 0xff, 0x2f, 0])),
  ]);
}
const trackName = (name: string) => {
  const bytes = [...new TextEncoder().encode(name)];
  return [0, 0xff, 0x03, bytes.length, ...bytes];
};

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

  it("reads UTF-8 track names and leaves other bytes alone", () => {
    const latin1 = (s: string) => String.fromCharCode(...new TextEncoder().encode(s));
    expect(decodeMidiText(latin1("ギター"))).toBe("ギター");
    expect(decodeMidiText("Bass")).toBe("Bass");
    expect(decodeMidiText("Café")).toBe("Café"); // a lone Latin-1 byte isn't UTF-8
  });

  it("rejects files that are not MIDI", () => {
    expect(() => parseMidi(new TextEncoder().encode("hello"), "notes.mid")).toThrow(MidiParseError);
  });

  it("gives each note its own pitch bend, in semitones after its start", () => {
    const midi = new Midi();
    const t = midi.addTrack();
    t.name = "Lead";
    t.channel = 0;
    t.instrument.number = 29;
    t.addNote({ midi: 64, time: 0, duration: 1, velocity: 0.8 });
    t.addNote({ midi: 67, time: 1, duration: 1, velocity: 0.8 });
    // the first note bends up a whole tone over half a second; the second starts unbent.
    // (@tonejs/midi writes a bend's value as given, the raw -8192..8191, but reads it back
    // divided by 8192)
    t.addPitchBend({ time: 0, value: 0 });
    t.addPitchBend({ time: 0.25, value: 4096 });
    t.addPitchBend({ time: 0.5, value: 8191 });
    t.addPitchBend({ time: 1, value: 0 });
    const notes = parseMidi(midi.toArray(), "bend.mid").tracks[0]!.notes;
    // no range set in the file: the General MIDI default, 2 semitones
    expect(notes[0]!.bend).toEqual([
      { at: 0, semitones: 0 },
      { at: 0.25, semitones: 1 },
      { at: 0.5, semitones: 2 },
    ]);
    expect(notes[1]!.bend).toBeUndefined();
  });

  it("reads the bend range a file sets (alphaTab sets 16 semitones), and leaves plain notes alone", () => {
    const notes = [
      { pitch: 60, start: 0, duration: 1, velocity: 0.8 },
      { pitch: 62, start: 2, duration: 1, velocity: 0.8 },
    ];
    const bent = attachBends(notes, [{ time: 0, value: 0.125 }, { time: 2, value: 0 }], 16);
    expect(bent[0]!.bend).toEqual([{ at: 0, semitones: 2 }]); // a pre-bend
    expect(bent[1]).toBe(notes[1]);
    expect(attachBends(notes, [], 16)).toEqual(notes);
    // the file's first bend comes mid-note: unbent before it
    expect(attachBends(notes.slice(0, 1), [{ time: 0.5, value: 0.5 }], 2)[0]!.bend).toEqual([
      { at: 0, semitones: 0 },
      { at: 0.5, semitones: 1 },
    ]);
  });

  it("keeps a long vibrato's peaks and troughs when it thins it out", () => {
    // 8 s of vibrato, 6 wobbles a second, a point every 5 ms: far over the limit
    const wobble = (hz: number) =>
      Array.from({ length: 1600 }, (_, i) => ({ time: i * 0.005, value: 0.125 * Math.sin(i * 0.005 * 2 * Math.PI * hz) }));
    const note = [{ pitch: 60, start: 0, duration: 8, velocity: 0.8 }];
    const bend = attachBends(note, wobble(6), 2)[0]!.bend!;
    expect(bend.length).toBeLessThanOrEqual(8 * 16);
    expect(bend.filter((p) => p.semitones > 0.2).length).toBe(48); // every peak
    // a vibrato too fast to keep whole still keeps its depth
    const fast = attachBends(note, wobble(12), 2)[0]!.bend!;
    expect(fast.length).toBeLessThanOrEqual(8 * 16);
    expect(Math.max(...fast.map((p) => p.semitones))).toBeGreaterThan(0.2);
    expect(Math.min(...fast.map((p) => p.semitones))).toBeLessThan(-0.2);
    expect(Math.max(...bend.map((p) => p.semitones))).toBeGreaterThan(0.2);
    expect(Math.min(...bend.map((p) => p.semitones))).toBeLessThan(-0.2);
  });

  it("keeps a piano and drums in one MIDI track apart", () => {
    const bytes = smf([
      ...trackName("Band"),
      ...[0, 0x90, 60, 100, 48, 0x80, 60, 0],
      ...[0, 0x99, 36, 100, 48, 0x89, 36, 0],
    ]);
    const tracks = parseMidi(bytes, "band.mid").tracks;
    expect(tracks.map((t) => t.isPercussion)).toEqual([false, true]);
  });

  it("follows running status over a marker, as the MIDI reader does, and still bends", () => {
    const bytes = smf([
      ...trackName("Lead"),
      ...[0, 0x90, 60, 100],
      ...[0, 0xe0, 0, 64], // unbent
      ...[24, 0xff, 0x06, 1, 0x78], // a marker
      ...[0, 0, 96], // running status: the pitch bend again, up half the range
      ...[72, 0x80, 60, 0],
    ]);
    const [lead] = parseMidi(bytes, "marker.mid").tracks;
    expect(lead!.notes[0]!.bend?.map((p) => p.semitones)).toEqual([0, 1]);
  });

  it("reads the bend range after an RPN reset", () => {
    const bytes = smf([
      ...trackName("Lead"),
      ...[0, 0xb0, 101, 127, 0, 0xb0, 100, 127], // RPN null
      ...[0, 0xb0, 101, 0, 0, 0xb0, 100, 0, 0, 0xb0, 6, 12], // bend range: 12 semitones
      ...[0, 0x90, 60, 100, 0, 0xe0, 0x7f, 0x7f, 96, 0x80, 60, 0], // fully up
    ]);
    const semitones = parseMidi(bytes, "range.mid").tracks[0]!.notes[0]!.bend![0]!.semitones;
    expect(semitones).toBeCloseTo(12, 1);
  });

  it("reads a part's instrument from its notes, not from a settings piece before them", () => {
    // format 1: an empty first track, then "Drums" setting a volume on channel 0 before its
    // notes on channel 9 (The Rumbling's drums came out as a piano, and Ritsu on keys)
    const chunk = (events: number[]) => [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, events.length, ...events];
    const name = [...new TextEncoder().encode("Drums")];
    const bytes = new Uint8Array([
      ...[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 2, 0, 96],
      ...chunk([0, 0xff, 0x2f, 0]),
      ...chunk([
        ...[0, 0xff, 0x03, name.length, ...name],
        ...[0, 0xb0, 7, 100],
        ...[0, 0x99, 36, 100, 48, 0x89, 36, 0],
        ...[0, 0x99, 38, 100, 48, 0x89, 38, 0],
        ...[0, 0xff, 0x2f, 0],
      ]),
    ]);
    const [drums, ...rest] = parseMidi(bytes, "drums.mid").tracks;
    expect(rest).toHaveLength(0);
    expect(drums).toMatchObject({ name: "Drums", channel: 9, isPercussion: true });
    expect(drums!.notes.map((n) => n.pitch)).toEqual([36, 38]);
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

  it("gives sung tracks to Yui's lead vocal and Mio's harmony, not to the band's instruments", () => {
    const midi = new Midi();
    const add = (name: string, program: number, pitches: number[]) => {
      const t = midi.addTrack();
      // the writer stores one byte per character: hand it the UTF-8 bytes, as real files hold them
      t.name = String.fromCharCode(...new TextEncoder().encode(name));
      t.instrument.number = program;
      pitches.forEach((p, i) => t.addNote({ midi: p, time: i * 0.5, duration: 0.4, velocity: 0.8 }));
    };
    add("Backing Vocals", 52, [60, 62]);
    add("ボーカル", 53, [64, 65, 67]);
    add("Guitar", 29, [52, 55]);
    add("Choir 2", 52, [55]);
    const sung = parseMidi(midi.toArray(), "vocal.mid");
    const index = (name: string) => sung.tracks.find((t) => t.name === name)!.index;
    const { assignments } = suggestMapping(sung);
    const of = (name: string) => assignments.find((a) => a.midiTrackIndex === index(name))!;
    expect(of("ボーカル")).toEqual({ midiTrackIndex: index("ボーカル"), memberId: "yui", vocal: true }); // the lead
    expect(of("Backing Vocals")).toMatchObject({ memberId: "mio", vocal: true }); // backing → harmony
    // only two singers: a third sung part is played by the band, like any other part
    expect(of("Choir 2")).toMatchObject({ memberId: "tsumugi" });
    expect(of("Choir 2").vocal).toBeUndefined();
    expect(of("Guitar")).toMatchObject({ memberId: "yui" });
    expect(of("Guitar").vocal).toBeUndefined();

    // …but never before the real instrument parts: a busy third vocal doesn't take Mugi from the piano
    const withPiano = new Midi();
    const addTo = (name: string, program: number, count: number) => {
      const t = withPiano.addTrack();
      t.name = name;
      t.instrument.number = program;
      for (let i = 0; i < count; i++) t.addNote({ midi: 60 + (i % 5), time: i * 0.25, duration: 0.2, velocity: 0.8 });
    };
    addTo("Lead Vocal", 52, 10);
    addTo("Backing Vocals", 52, 10);
    addTo("Backing Vocal 2", 52, 40);
    addTo("Piano", 0, 8);
    const parsedPiano = parseMidi(withPiano.toArray(), "piano.mid");
    const pianoMap = suggestMapping(parsedPiano).assignments;
    const named = (name: string) => pianoMap.find((a) => a.midiTrackIndex === parsedPiano.tracks.find((t) => t.name === name)!.index)!;
    expect(named("Piano").memberId).toBe("tsumugi");
    expect(named("Backing Vocal 2").memberId).not.toBe("tsumugi");

    const song = buildTracksFromMapping(sung, assignments);
    const yui = song.tracks.find((t) => t.memberId === "yui")!;
    expect(yui.notes.map((n) => n.pitch)).toEqual([52, 55]); // she plays the guitar part…
    expect(yui.vocal!.map((n) => n.pitch)).toEqual([64, 65, 67]); // …and sings the vocal
    expect(yui.instrument).toBe("lead-guitar");
    expect(song.tracks.find((t) => t.memberId === "mio")!.vocal).toHaveLength(2);
    expect(song.tracks.find((t) => t.memberId === "ritsu")!.vocal).toBeUndefined();
  });

  it("gives a track named after a member to that member, ahead of any guess", () => {
    // like a fan transcription that says who plays what (the busiest guitar is the wah double)
    const midi = new Midi();
    const add = (name: string, program: number, count: number, channel: number) => {
      const t = midi.addTrack();
      t.name = String.fromCharCode(...new TextEncoder().encode(name));
      t.channel = channel;
      t.instrument.number = program;
      for (let i = 0; i < count; i++) t.addNote({ midi: channel === 9 ? 36 : 52, time: i * 0.25, duration: 0.2, velocity: 0.8 });
    };
    add("Guitar: Yui Hirasawa", 29, 20, 0);
    add("Gitah!", 30, 15, 1);
    add("Guitar: Azusa Nakano", 30, 21, 2);
    add("Azu-nyan! w/ Wah", 29, 22, 3);
    add("Bass: Mio Akiyama", 33, 9, 4);
    add("Drums: Ritsu Tainaka", 0, 19, 9);
    add("Keyboard: Tsugumi Kotobuki", 80, 11, 5);
    const named = parseMidi(midi.toArray(), "fuwa.mid");
    const { assignments } = suggestMapping(named);
    const who = (name: string) => assignments.find((a) => a.midiTrackIndex === named.tracks.find((t) => t.name === name)!.index)!.memberId;
    expect(who("Guitar: Yui Hirasawa")).toBe("yui");
    expect(who("Guitar: Azusa Nakano")).toBe("azusa"); // her real name beats her nickname
    expect(who("Azu-nyan! w/ Wah")).toBeNull(); // she already has her part
    expect(who("Gitah!")).toBeNull();
    expect(who("Keyboard: Tsugumi Kotobuki")).toBe("tsumugi"); // a misspelt surname still counts
    expect(who("Bass: Mio Akiyama")).toBe("mio");
    expect(who("Drums: Ritsu Tainaka")).toBe("ritsu");
  });

  it("gives a keys part to Mugi before handing her a spare guitar", () => {
    const midi = new Midi();
    const add = (name: string, program: number, count: number) => {
      const t = midi.addTrack();
      t.name = name;
      t.instrument.number = program;
      for (let i = 0; i < count; i++) t.addNote({ midi: 60, time: i * 0.25, duration: 0.2, velocity: 0.8 });
    };
    add("Guitar 1", 29, 30);
    add("Guitar 2", 30, 25);
    add("Guitar 3", 27, 20);
    add("Synth", 80, 5);
    const parts = parseMidi(midi.toArray(), "parts.mid");
    const { assignments } = suggestMapping(parts);
    const who = (name: string) => assignments.find((a) => a.midiTrackIndex === parts.tracks.find((t) => t.name === name)!.index)!.memberId;
    expect(who("Synth")).toBe("tsumugi");
    expect(who("Guitar 3")).toBeNull();
  });

  describe("names that mislead", () => {
    const fileWith = (tracks: { name: string; program?: number; channel?: number; drums?: boolean }[]) => {
      const midi = new Midi();
      for (const t of tracks) {
        const track = midi.addTrack();
        track.name = String.fromCharCode(...new TextEncoder().encode(t.name));
        track.channel = t.drums ? 9 : (t.channel ?? 0);
        track.instrument.number = t.program ?? 0;
        for (let i = 0; i < 4; i++) track.addNote({ midi: t.drums ? 36 : 60, time: i * 0.5, duration: 0.4, velocity: 0.8 });
      }
      return parseMidi(midi.toArray(), "names.mid");
    };
    const whoIn = (parsed: ReturnType<typeof fileWith>) => (name: string) =>
      suggestMapping(parsed).assignments.find((a) => a.midiTrackIndex === parsed.tracks.find((t) => t.name === name)!.index)!;

    it("doesn't read a member's one-kanji name inside a word (主旋律 is not Ritsu)", () => {
      const parsed = fileWith([{ name: "主旋律", program: 80, channel: 0 }, { name: "Drums", drums: true }, { name: "唯美钢琴", channel: 1 }]);
      const who = whoIn(parsed);
      expect(who("Drums").memberId).toBe("ritsu"); // the real drums aren't dropped
      expect(who("主旋律").memberId).not.toBe("ritsu");
      expect(memberFromName("律ちゃん ドラム")?.member).toBe("ritsu");
      expect(memberFromName("田井中律")?.member).toBe("ritsu");
    });

    it("keeps Japanese names whose last byte reads as a no-break space (ドラム, リズム)", () => {
      const parsed = fileWith([{ name: "ドラム", drums: true }, { name: "リズムギター", program: 29, channel: 1 }]);
      expect(parsed.tracks.map((t) => t.name)).toEqual(["ドラム", "リズムギター"]);
    });

    it("doesn't sing instruments with voice-like names", () => {
      for (const name of ["Alto Sax", "Soprano Sax", "Chorus Guitar", "Vox Continental Organ", "Rising Lead", "Bass & Vocal"]) {
        expect(isVocalName(name)).toBe(false);
      }
      for (const name of ["Vocal", "Lead Vox", "Backing Vocals", "Singer", "ボーカル", "主唱"]) expect(isVocalName(name)).toBe(true);
    });

    it("gives a vocal that names its singer to her", () => {
      const parsed = fileWith([{ name: "Vocal (Mio)", channel: 0 }, { name: "Vocal (Yui)", channel: 1 }]);
      const who = whoIn(parsed);
      expect(who("Vocal (Mio)")).toMatchObject({ memberId: "mio", vocal: true });
      expect(who("Vocal (Yui)")).toMatchObject({ memberId: "yui", vocal: true });
    });
  });

  it("keeps a part whole when its instrument changes mid-song", () => {
    const midi = new Midi();
    const guitar = midi.addTrack();
    guitar.name = "Guitar";
    guitar.channel = 0;
    guitar.instrument.number = 29;
    for (let i = 0; i < 4; i++) guitar.addNote({ midi: 52, time: i * 0.5, duration: 0.4, velocity: 0.8 });
    const bytes = midi.toArray();
    // splice a program change (to 30) into the middle of the guitar track: rewrite with one note after it
    const withChange = new Midi(bytes);
    withChange.tracks[0]!.instrument.number = 29;
    const later = withChange.addTrack(); // what the reader makes of the second patch: same channel, no name
    later.channel = 0;
    later.instrument.number = 30;
    for (let i = 4; i < 8; i++) later.addNote({ midi: 55, time: i * 0.5, duration: 0.4, velocity: 0.8 });
    const parsed = parseMidi(withChange.toArray(), "patch.mid");
    expect(parsed.tracks).toHaveLength(1);
    expect(parsed.tracks[0]).toMatchObject({ name: "Guitar" });
    expect(parsed.tracks[0]!.notes).toHaveLength(8);
  });

  it("doesn't hand an empty lyrics track's name to the next part", () => {
    const midi = new Midi();
    midi.addTrack().name = "Vocal"; // no notes, no controllers
    const piano = midi.addTrack();
    piano.channel = 1;
    for (let i = 0; i < 4; i++) piano.addNote({ midi: 60, time: i * 0.5, duration: 0.4, velocity: 0.8 });
    const parsed = parseMidi(midi.toArray(), "karaoke.mid");
    expect(parsed.tracks.map((t) => t.name)).not.toContain("Vocal");
  });

  it("counts a bar in quarter notes, whatever the time signature", () => {
    expect(quarterBeatsPerBar(4, 4)).toBe(4);
    expect(quarterBeatsPerBar(6, 8)).toBe(3);
    expect(quarterBeatsPerBar(12, 8)).toBe(6);
    expect(quarterBeatsPerBar(2, 2)).toBe(4);
    expect(quarterBeatsPerBar(7, 8)).toBe(7);
    expect(quarterBeatsPerBar(17, 16)).toBe(16);
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
