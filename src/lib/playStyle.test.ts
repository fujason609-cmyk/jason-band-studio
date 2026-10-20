import { strumOffsets } from "./feel";
import {
  arpeggiate,
  arrange,
  chug,
  isPlayStyle,
  legato,
  phraseCrashes,
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
