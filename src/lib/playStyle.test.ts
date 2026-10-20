import { strumOffsets } from "./feel";
import {
  arpeggiate,
  arrange,
  arrangeVocal,
  chug,
  drumGroove,
  isPlayStyle,
  legato,
  phraseCrashes,
  playedBars,
  powerChords,
  swing,
  swingTicks,
  type StyledNote,
} from "./playStyle";

const PPQ = 192;
const note = (ticks: number, durationTicks: number, pitch = 60, velocity = 0.6): StyledNote => ({ ticks, durationTicks, pitch, velocity });

describe("playing styles", () => {
  it("plays the score untouched as written", () => {
    const notes = [note(0, 192)];
    expect(arrange("original", "rhythm-guitar", notes, PPQ, 4)).toBe(notes);
    expect(isPlayStyle("rock")).toBe(true);
    expect(isPlayStyle("metal")).toBe(false);
  });

  it("turns chords into power chords on the low strings", () => {
    // C major up the neck → C root, fifth and octave from the 8th fret of the low E
    const out = powerChords([note(0, 384, 60), note(0, 384, 64), note(0, 384, 67)]);
    expect(out.map((n) => n.pitch)).toEqual([48, 55, 60]);
    expect(out.every((n) => n.ticks === 0 && n.durationTicks === 384)).toBe(true);
    // below the low E it moves up an octave
    expect(powerChords([note(0, 96, 38)]).map((n) => n.pitch)).toEqual([50, 57, 62]);
  });

  it("re-picks long notes as eighths, digging in on the beat", () => {
    const out = chug([note(0, 384), note(384, 48)], PPQ, PPQ);
    expect(out.map((n) => n.ticks)).toEqual([0, 96, 192, 288, 384]);
    expect(out[0]!.velocity).toBeGreaterThan(out[1]!.velocity);
    expect(out[4]).toEqual(note(384, 48)); // short notes stay as written
  });

  it("rock chugs Azusa's chords and drives the bass; punk chugs shorter notes too", () => {
    const quarterChord = [note(0, 192, 60), note(0, 192, 64)];
    expect(arrange("rock", "rhythm-guitar", quarterChord, PPQ, 4)).toHaveLength(6); // 2 eighths × 3 strings
    expect(arrange("rock", "bass", [note(0, 144, 40)], PPQ, 4)).toHaveLength(1); // dotted eighth: as written
    expect(arrange("punk", "bass", [note(0, 144, 40)], PPQ, 4)).toHaveLength(2);
    // Yui's melody keeps its notes, a bit harder
    const lead = arrange("rock", "lead-guitar", [note(0, 96, 72, 0.5)], PPQ, 4);
    expect(lead.map((n) => n.pitch)).toEqual([72]);
    expect(lead[0]!.velocity).toBeCloseTo(0.55);
  });

  it("adds a crash at the top of each phrase the drums play", () => {
    const bar = PPQ * 4;
    const groove = [note(0, 48, 36), note(bar * 4, 48, 36), note(bar * 8 + 10, 48, 36), note(bar * 2, 48, 36)];
    const crashes = phraseCrashes(groove, PPQ, 4, 4).filter((n) => n.pitch === 49);
    expect(crashes.map((n) => n.ticks).sort((a, b) => a - b)).toEqual([0, bar * 4, bar * 8]);
    // one already written there is enough
    expect(phraseCrashes([note(0, 48, 36), note(0, 96, 57)], PPQ, 4, 4).filter((n) => n.pitch === 49)).toHaveLength(0);
  });

  it("ballad lets notes ring into the next and picks held chords one string at a time", () => {
    const line = legato([note(0, 96), note(192, 96), note(1000, 96)], PPQ);
    expect(line.map((n) => n.durationTicks)).toEqual([192, 288, 96]); // up to the next note, at most a beat longer
    const arp = arpeggiate([note(0, 768, 67), note(0, 768, 60), note(0, 768, 64)], PPQ);
    expect(arp.map((n) => [n.pitch, n.ticks])).toEqual([
      [60, 0],
      [64, 96],
      [67, 192],
    ]);
    expect(arp.every((n) => n.ticks + n.durationTicks === 768)).toBe(true);
    // a quick chord is still strummed together
    expect(arpeggiate([note(0, 96, 60), note(0, 96, 64), note(0, 96, 67)], PPQ).every((n) => n.ticks === 0)).toBe(true);
  });

  it("finds the bars the band plays in, held notes included", () => {
    const bar = PPQ * 4;
    expect(playedBars([note(0, 96), note(bar * 2 + 10, bar * 2)], bar)).toEqual([0, 2, 3, 4]);
    expect(playedBars([note(bar, bar)], bar)).toEqual([1]); // ends exactly on the next downbeat
  });

  it("generates a rock beat for a score without drums, only in rock and punk", () => {
    const bar = PPQ * 4;
    const band = { autoDrums: true, playedBars: [0, 1, 2, 3, 4] };
    const rock = arrange("rock", "drums", [], PPQ, 4, band);
    const inBar = (b: number, pitch: number) => rock.filter((n) => n.pitch === pitch && n.ticks >= b * bar && n.ticks < (b + 1) * bar);
    expect(inBar(1, 38).map((n) => n.ticks - bar)).toEqual([192, 576]); // snare on 2 and 4
    expect(inBar(1, 36).map((n) => n.ticks - bar)).toEqual([0, 384, 480]); // kick on 1, 3 and the "and" of 3
    expect(inBar(1, 42)).toHaveLength(8); // hi-hat eighths
    expect(inBar(0, 49)).toHaveLength(1); // crash on the first bar
    expect(inBar(4, 49)).toHaveLength(1); // and at the top of the next phrase
    expect(inBar(3, 38).length).toBeGreaterThan(2); // a fill leading into it
    // punk kicks every beat and crashes every 2 bars
    const punk = drumGroove([0, 1, 2], PPQ, 4, true);
    expect(punk.filter((n) => n.pitch === 36 && n.ticks < bar)).toHaveLength(4);
    expect(punk.filter((n) => n.pitch === 49).map((n) => n.ticks)).toEqual([0, bar * 2]);
    // switched off, another style, or a score that has drums: nothing generated
    expect(arrange("rock", "drums", [], PPQ, 4, { ...band, autoDrums: false })).toHaveLength(0);
    expect(arrange("ballad", "drums", [], PPQ, 4, band)).toHaveLength(0);
    expect(arrange("rock", "drums", [note(0, 48, 36)], PPQ, 4, band).filter((n) => n.pitch === 42)).toHaveLength(0);
  });

  it("keeps a sung tune as written, only its delivery changes", () => {
    const tune = [note(0, 192, 64), note(192, 96, 67), note(288, 96, 69)];
    expect(arrangeVocal("original", tune, PPQ)).toBe(tune);
    expect(arrangeVocal("rock", tune, PPQ).map((n) => [n.ticks, n.pitch])).toEqual(tune.map((n) => [n.ticks, n.pitch])); // no chugs
    expect(arrangeVocal("swing", tune, PPQ).map((n) => n.ticks)).toEqual([0, 192, 320]);
    expect(arrangeVocal("ballad", [note(0, 96, 64), note(192, 96, 67)], PPQ)[0]!.durationTicks).toBe(192);
  });

  it("swings the off-beat eighth onto the last triplet", () => {
    expect(swingTicks(0, PPQ)).toBe(0);
    expect(swingTicks(96, PPQ)).toBe(128);
    expect(swingTicks(192, PPQ)).toBe(192);
    const out = swing([note(0, 96), note(96, 96)], PPQ);
    expect(out.map((n) => [n.ticks, n.durationTicks])).toEqual([
      [0, 128],
      [128, 64],
    ]);
    // a swung off-beat chord is still an up-strum (high string first)
    const chord = swing([note(96, 96, 60), note(96, 96, 64)], PPQ);
    expect(strumOffsets(chord, PPQ)).toEqual([1, 0]);
  });
});
