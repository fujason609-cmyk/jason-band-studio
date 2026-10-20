/** Rough General MIDI percussion families, enough to pick a synthesized drum voice. */
export type DrumVoice = "kick" | "snare" | "closed-hat" | "open-hat" | "tom" | "crash" | "ride" | "clap";

export function drumVoiceFor(pitch: number): DrumVoice {
  if (pitch === 35 || pitch === 36) return "kick";
  if (pitch === 37 || pitch === 38 || pitch === 40) return "snare";
  if (pitch === 39) return "clap";
  if (pitch === 42 || pitch === 44) return "closed-hat";
  if (pitch === 46) return "open-hat";
  if ([41, 43, 45, 47, 48, 50].includes(pitch)) return "tom";
  if ([49, 52, 55, 57].includes(pitch)) return "crash";
  if ([51, 53, 59].includes(pitch)) return "ride";
  return pitch < 40 ? "kick" : pitch < 60 ? "closed-hat" : "ride";
}

/** Tom pitch in Hz, low floor tom → high rack tom. */
export function tomFrequency(pitch: number): number {
  const order = [41, 43, 45, 47, 48, 50];
  const idx = Math.max(0, order.indexOf(pitch));
  return 80 + idx * 22;
}

export interface DrumPad {
  key: string;
  label: string;
  pitch: number;
  /** what the pad looks like in the on-screen kit */
  kind: "cymbal" | "drum" | "kick";
  /** grid area in the kit layout */
  area: string;
}

export const DRUM_PADS: DrumPad[] = [
  { key: "a", label: "Kick", pitch: 36, kind: "kick", area: "kick" },
  { key: "s", label: "Snare", pitch: 38, kind: "drum", area: "snare" },
  { key: "d", label: "Closed hat", pitch: 42, kind: "cymbal", area: "chat" },
  { key: "f", label: "Open hat", pitch: 46, kind: "cymbal", area: "ohat" },
  { key: "g", label: "Low tom", pitch: 43, kind: "drum", area: "ltom" },
  { key: "h", label: "Mid tom", pitch: 47, kind: "drum", area: "mtom" },
  { key: "j", label: "High tom", pitch: 50, kind: "drum", area: "htom" },
  { key: "k", label: "Crash", pitch: 49, kind: "cymbal", area: "crash" },
  { key: "l", label: "Ride", pitch: 51, kind: "cymbal", area: "ride" },
];

/**
 * The General MIDI note of the recorded kit piece that should play `pitch`. The sample
 * pack has one recording per piece (kick 36, snare 38, closed hat 42, open hat 46,
 * crash 49, ride 51, toms 43 / 47 / 50); every other drum note goes to the closest piece
 * instead of letting the Sampler repitch a neighbouring drum.
 */
export function drumSampleNote(pitch: number): number {
  switch (drumVoiceFor(pitch)) {
    case "kick":
      return 36;
    case "snare":
    case "clap":
      return 38;
    case "closed-hat":
      return 42;
    case "open-hat":
      return 46;
    case "crash":
      return 49;
    case "ride":
      return 51;
    case "tom":
      return pitch <= 43 ? 43 : pitch <= 47 ? 47 : 50;
  }
}
