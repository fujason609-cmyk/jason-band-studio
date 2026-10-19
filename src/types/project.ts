import type { InstrumentId } from "./audio";
import type { MidiMeta, NoteEvent } from "./midi";
import type { MemberId } from "@/features/band/types";

export interface StudioTrack {
  id: string;
  memberId: MemberId;
  name: string;
  instrument: InstrumentId;
  notes: NoteEvent[];
  /** 0..1 */
  volume: number;
  muted: boolean;
  solo: boolean;
}

export const PROJECT_VERSION = 1 as const;

export interface StudioProject {
  version: typeof PROJECT_VERSION;
  name: string;
  /** Tempo the user is playing at */
  bpm: number;
  /** Tempo the note seconds were written at (first tempo of the song) */
  baseBpm: number;
  beatsPerBar: number;
  masterVolume: number;
  tracks: StudioTrack[];
  /** Song length in seconds at baseBpm */
  durationSeconds: number;
  midiMeta?: MidiMeta;
  /** Key of the original MIDI blob in IndexedDB, if one was imported */
  midiBlobKey?: string;
  updatedAt: string;
}
