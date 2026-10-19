import type { InstrumentId } from "@/types/audio";

export type MemberId = "yui" | "mio" | "ritsu" | "tsumugi" | "azusa";

export interface BandMember {
  id: MemberId;
  name: string;
  nameJa: string;
  role: string;
  defaultInstrument: InstrumentId;
  /** CSS custom property holding the member's colour */
  colorVar: string;
}
