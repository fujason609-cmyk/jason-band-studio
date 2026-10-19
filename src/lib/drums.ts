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
}

export const DRUM_PADS: DrumPad[] = [
  { key: "a", label: "Kick", pitch: 36 },
  { key: "s", label: "Snare", pitch: 38 },
  { key: "d", label: "Closed hat", pitch: 42 },
  { key: "f", label: "Open hat", pitch: 46 },
  { key: "g", label: "Low tom", pitch: 43 },
  { key: "h", label: "Mid tom", pitch: 47 },
  { key: "j", label: "High tom", pitch: 50 },
  { key: "k", label: "Crash", pitch: 49 },
  { key: "l", label: "Ride", pitch: 51 },
];
