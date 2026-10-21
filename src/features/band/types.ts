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
  /** plays a left-handed instrument (Mio's Jazz Bass): the live fretboard is mirrored */
  leftHanded?: boolean;
  /** where they stand in the stereo picture, -1 (left) … 1 (right); vocals stay centred */
  pan: number;
}
