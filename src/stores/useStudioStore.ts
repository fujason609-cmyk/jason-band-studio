import { create } from "zustand";
import type { MemberId } from "@/features/band/types";
import { DEFAULT_SETTINGS, type StudioSettings } from "@/services/storage/settingsStorage";
import type { InstrumentId, InstrumentLoadState, TransportStatus } from "@/types/audio";
import type { ParsedMidi, TrackAssignment } from "@/types/midi";

export interface Notice {
  kind: "info" | "error";
  text: string;
}

export interface PendingImport {
  parsed: ParsedMidi;
  assignments: TrackAssignment[];
  /** the song as MIDI (a Guitar Pro / MusicXML file is converted first) */
  data: ArrayBuffer;
  /** the score's own title, when the file was a score that has one */
  title?: string;
}

interface StudioState {
  hydrated: boolean;
  audioStarted: boolean;
  transport: TransportStatus;
  instrumentStates: Partial<Record<InstrumentId, InstrumentLoadState>>;
  settings: StudioSettings;
  pendingImport: PendingImport | null;
  notice: Notice | null;
  /** full-screen Instagram recording frame (not persisted) */
  recordMode: boolean;

  setHydrated: () => void;
  setAudioStarted: (started: boolean) => void;
  setTransport: (status: TransportStatus) => void;
  setInstrumentState: (instrument: InstrumentId, state: InstrumentLoadState) => void;
  updateSettings: (patch: Partial<StudioSettings>) => void;
  selectMember: (member: MemberId) => void;
  setPendingImport: (pending: PendingImport | null) => void;
  /** `vocal`: the member sings this track (Yui or Mio) instead of playing it */
  setAssignment: (midiTrackIndex: number, member: MemberId | null, vocal?: boolean) => void;
  notify: (notice: Notice | null) => void;
  setRecordMode: (on: boolean) => void;
}

export const useStudioStore = create<StudioState>((set) => ({
  hydrated: false,
  audioStarted: false,
  transport: "stopped",
  instrumentStates: {},
  settings: { ...DEFAULT_SETTINGS },
  pendingImport: null,
  notice: null,
  recordMode: false,

  setHydrated: () => set({ hydrated: true }),
  setAudioStarted: (audioStarted) => set({ audioStarted }),
  setTransport: (transport) => set({ transport }),
  setInstrumentState: (instrument, state) =>
    set((s) => ({ instrumentStates: { ...s.instrumentStates, [instrument]: state } })),
  updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  selectMember: (selectedMember) => set((s) => ({ settings: { ...s.settings, selectedMember } })),
  setPendingImport: (pendingImport) => set({ pendingImport }),
  setAssignment: (midiTrackIndex, member, vocal = false) =>
    set((s) =>
      s.pendingImport
        ? {
            pendingImport: {
              ...s.pendingImport,
              assignments: s.pendingImport.assignments.map((a) =>
                a.midiTrackIndex === midiTrackIndex ? { midiTrackIndex, memberId: member, ...(vocal ? { vocal } : {}) } : a,
              ),
            },
          }
        : {},
    ),
  notify: (notice) => set({ notice }),
  setRecordMode: (recordMode) => set({ recordMode }),
}));
