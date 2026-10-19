import { HIDE_AFTER_Y, scrollVisibility } from "@/hooks/useHideOnScroll";
import { BASS_TUNING, CHORDS, GUITAR_TUNING, MAX_FRET, clampFretStart, fretPitch, liveLayoutFor } from "./fretboard";
import { pitchName } from "./keyboardMap";

describe("fretboard", () => {
  it("uses standard tuning", () => {
    expect(GUITAR_TUNING.map(pitchName)).toEqual(["E2", "A2", "D3", "G3", "B3", "E4"]);
    expect(BASS_TUNING.map(pitchName)).toEqual(["E1", "A1", "D2", "G2"]);
  });

  it("finds the pitch of a fret", () => {
    expect(pitchName(fretPitch(GUITAR_TUNING, 0, 3))).toBe("G2");
    expect(pitchName(fretPitch(GUITAR_TUNING, 5, 12))).toBe("E5");
    expect(fretPitch(GUITAR_TUNING, 4, 5)).toBe(fretPitch(GUITAR_TUNING, 5, 0)); // B string, 5th fret = high E
  });

  it("keeps the fret window on the neck", () => {
    expect(clampFretStart(-3, 6)).toBe(0);
    expect(clampFretStart(4, 6)).toBe(4);
    expect(clampFretStart(40, 6)).toBe(MAX_FRET + 1 - 6);
  });

  it("gives each instrument its own live layout", () => {
    expect(liveLayoutFor("lead-guitar")).toBe("fretboard");
    expect(liveLayoutFor("bass")).toBe("fretboard");
    expect(liveLayoutFor("rhythm-guitar")).toBe("chords");
    expect(liveLayoutFor("keys")).toBe("piano");
    expect(liveLayoutFor("drums")).toBe("drums");
  });

  it("has playable chord voicings, one key each, low to high", () => {
    expect(new Set(CHORDS.map((c) => c.key)).size).toBe(CHORDS.length);
    for (const chord of CHORDS) {
      expect(chord.pitches.length).toBeGreaterThanOrEqual(4);
      expect([...chord.pitches].sort((a, b) => a - b)).toEqual(chord.pitches);
      expect(chord.pitches[0]).toBeGreaterThanOrEqual(GUITAR_TUNING[0]!);
    }
    const c = CHORDS.find((x) => x.name === "C")!;
    expect(new Set(c.pitches.map((p) => p % 12))).toEqual(new Set([0, 4, 7]));
  });
});

describe("hide the transport on scroll", () => {
  it("stays visible near the top", () => {
    expect(scrollVisibility(0, HIDE_AFTER_Y)).toBe(false);
  });

  it("hides going down and shows going up", () => {
    expect(scrollVisibility(400, 460)).toBe(true);
    expect(scrollVisibility(460, 420)).toBe(false);
  });

  it("ignores tiny movements", () => {
    expect(scrollVisibility(400, 403)).toBeNull();
  });
});
