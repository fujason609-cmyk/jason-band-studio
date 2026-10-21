import type { BandMember, MemberId } from "./types";
import type { InstrumentId } from "@/types/audio";

/**
 * The band in order. `pan` is a small stage: the two guitars apart (Yui left, Azusa
 * right), Tsumugi's keys a little right, Mio just left of centre with Ritsu's kit in the
 * middle; it lets each part be heard instead of everything piling up in one place.
 */
export const MEMBERS: readonly BandMember[] = [
  { id: "yui", name: "Yui", nameJa: "平沢唯", role: "Lead guitar, vocals", defaultInstrument: "lead-guitar", colorVar: "--member-yui", pan: -0.35 },
  { id: "mio", name: "Mio", nameJa: "秋山澪", role: "Bass", defaultInstrument: "bass", colorVar: "--member-mio", leftHanded: true, pan: -0.1 },
  { id: "ritsu", name: "Ritsu", nameJa: "田井中律", role: "Drums", defaultInstrument: "drums", colorVar: "--member-ritsu", pan: 0 },
  { id: "tsumugi", name: "Tsumugi", nameJa: "琴吹紬", role: "Keyboard", defaultInstrument: "keys", colorVar: "--member-tsumugi", pan: 0.2 },
  { id: "azusa", name: "Azusa", nameJa: "中野梓", role: "Rhythm guitar", defaultInstrument: "rhythm-guitar", colorVar: "--member-azusa", pan: 0.35 },
];

export const MEMBER_IDS: readonly MemberId[] = MEMBERS.map((m) => m.id);

export function getMember(id: MemberId): BandMember {
  const member = MEMBERS.find((m) => m.id === id);
  if (!member) throw new Error(`Unknown member: ${id}`);
  return member;
}

export function isMemberId(value: unknown): value is MemberId {
  return typeof value === "string" && (MEMBER_IDS as readonly string[]).includes(value);
}

export const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
  "lead-guitar": "Lead guitar",
  "rhythm-guitar": "Rhythm guitar",
  bass: "Bass",
  drums: "Drum kit",
  keys: "Keys",
};

export const INSTRUMENT_IDS = Object.keys(INSTRUMENT_LABELS) as InstrumentId[];

export function isInstrumentId(value: unknown): value is InstrumentId {
  return typeof value === "string" && value in INSTRUMENT_LABELS;
}
