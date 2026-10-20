import type { BandMember, MemberId } from "./types";
import type { InstrumentId } from "@/types/audio";

export const MEMBERS: readonly BandMember[] = [
  { id: "yui", name: "Yui", nameJa: "平沢唯", role: "Lead guitar, vocals", defaultInstrument: "lead-guitar", colorVar: "--member-yui" },
  { id: "mio", name: "Mio", nameJa: "秋山澪", role: "Bass", defaultInstrument: "bass", colorVar: "--member-mio", leftHanded: true },
  { id: "ritsu", name: "Ritsu", nameJa: "田井中律", role: "Drums", defaultInstrument: "drums", colorVar: "--member-ritsu" },
  { id: "tsumugi", name: "Mugi", nameJa: "琴吹紬", role: "Keyboard", defaultInstrument: "keys", colorVar: "--member-tsumugi" },
  { id: "azusa", name: "Azusa", nameJa: "中野梓", role: "Rhythm guitar", defaultInstrument: "rhythm-guitar", colorVar: "--member-azusa" },
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
