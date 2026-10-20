import type { InstrumentId } from "./audio";
import type { MemberId } from "@/features/band/types";

export interface NoteEvent {
  /** MIDI note number 0..127 */
  pitch: number;
  /** seconds, relative to song start, at the song's own tempo map */
  start: number;
  /** seconds */
  duration: number;
  /** 0..1 */
  velocity: number;
}

export interface TempoPoint {
  ticks: number;
  bpm: number;
  /** seconds from song start */
  time: number;
}

export interface TimeSignaturePoint {
  ticks: number;
  numerator: number;
  denominator: number;
}

/** Metadata kept from the original file so timing can be rebuilt precisely later. */
export interface MidiMeta {
  fileName: string;
  ppq: number;
  tempos: TempoPoint[];
  timeSignatures: TimeSignaturePoint[];
  durationSeconds: number;
}

/** One track as it came out of the MIDI file, before it is assigned to a member. */
export interface ParsedMidiTrack {
  index: number;
  name: string;
  channel: number;
  /** General MIDI program number 0..127 */
  program: number;
  /** Human-readable GM instrument name */
  instrumentName: string;
  isPercussion: boolean;
  notes: NoteEvent[];
}

export interface ParsedMidi {
  meta: MidiMeta;
  tracks: ParsedMidiTrack[];
}

/** Where a MIDI track goes. `null` member means "ignore this track". */
export interface TrackAssignment {
  midiTrackIndex: number;
  memberId: MemberId | null;
  /** sung by that member (Yui or Mio) instead of played on their instrument */
  vocal?: boolean;
}

export interface MappingSuggestion {
  assignments: TrackAssignment[];
  /** Instrument each member should use for this song */
  instruments: Partial<Record<MemberId, InstrumentId>>;
}
