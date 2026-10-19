import { create } from "zustand";
import { MEMBERS } from "@/features/band/members";
import type { MemberId } from "@/features/band/types";
import { DEMO_BEATS_PER_BAR, DEMO_BPM, DEMO_DURATION, DEMO_PARTS, DEMO_TITLE } from "@/features/band/demoSong";
import { clampBpm } from "@/lib/time";
import type { InstrumentId } from "@/types/audio";
import type { MidiMeta } from "@/types/midi";
import { PROJECT_VERSION, type StudioProject, type StudioTrack } from "@/types/project";

export function createDemoProject(): StudioProject {
  return {
    version: PROJECT_VERSION,
    name: DEMO_TITLE,
    bpm: DEMO_BPM,
    baseBpm: DEMO_BPM,
    beatsPerBar: DEMO_BEATS_PER_BAR,
    masterVolume: 0.8,
    durationSeconds: DEMO_DURATION,
    tracks: MEMBERS.map(
      (m): StudioTrack => ({
        id: `track-${m.id}`,
        memberId: m.id,
        name: m.role,
        instrument: m.defaultInstrument,
        notes: DEMO_PARTS[m.id],
        volume: m.id === "ritsu" ? 0.85 : 0.8,
        muted: false,
        solo: false,
      }),
    ),
    updatedAt: new Date().toISOString(),
  };
}

/** Song length rounded up to a whole bar so loops land on the downbeat. */
export function songLength(tracks: readonly StudioTrack[], baseBpm: number, beatsPerBar: number): number {
  const end = Math.max(0.1, ...tracks.flatMap((t) => t.notes.map((n) => n.start + n.duration)));
  const bar = (60 / baseBpm) * beatsPerBar;
  return Math.ceil((end - 1e-6) / bar) * bar;
}

export interface LoadedSong {
  name: string;
  tracks: StudioTrack[];
  baseBpm: number;
  beatsPerBar: number;
  midiMeta?: MidiMeta;
  midiBlobKey?: string;
}

interface ProjectState {
  project: StudioProject;
  setBpm: (bpm: number) => void;
  setMasterVolume: (volume: number) => void;
  setTrackVolume: (member: MemberId, volume: number) => void;
  toggleMute: (member: MemberId) => void;
  toggleSolo: (member: MemberId) => void;
  clearSolo: () => void;
  setInstrument: (member: MemberId, instrument: InstrumentId) => void;
  loadSong: (song: LoadedSong) => void;
  replaceProject: (project: StudioProject) => void;
  resetToDemo: () => void;
}

const touch = (p: StudioProject): StudioProject => ({ ...p, updatedAt: new Date().toISOString() });

const updateTrack = (p: StudioProject, member: MemberId, fn: (t: StudioTrack) => StudioTrack): StudioProject =>
  touch({ ...p, tracks: p.tracks.map((t) => (t.memberId === member ? fn(t) : t)) });

export const useProjectStore = create<ProjectState>((set) => ({
  project: createDemoProject(),
  setBpm: (bpm) => set((s) => ({ project: touch({ ...s.project, bpm: clampBpm(bpm) }) })),
  setMasterVolume: (volume) =>
    set((s) => ({ project: touch({ ...s.project, masterVolume: Math.min(1, Math.max(0, volume)) }) })),
  setTrackVolume: (member, volume) =>
    set((s) => ({ project: updateTrack(s.project, member, (t) => ({ ...t, volume: Math.min(1, Math.max(0, volume)) })) })),
  toggleMute: (member) => set((s) => ({ project: updateTrack(s.project, member, (t) => ({ ...t, muted: !t.muted })) })),
  toggleSolo: (member) => set((s) => ({ project: updateTrack(s.project, member, (t) => ({ ...t, solo: !t.solo })) })),
  clearSolo: () => set((s) => ({ project: touch({ ...s.project, tracks: s.project.tracks.map((t) => ({ ...t, solo: false })) }) })),
  setInstrument: (member, instrument) =>
    set((s) => ({ project: updateTrack(s.project, member, (t) => ({ ...t, instrument })) })),
  loadSong: (song) =>
    set((s) => ({
      project: touch({
        ...s.project,
        name: song.name,
        tracks: song.tracks,
        baseBpm: song.baseBpm,
        bpm: clampBpm(song.baseBpm),
        beatsPerBar: song.beatsPerBar,
        durationSeconds: songLength(song.tracks, song.baseBpm, song.beatsPerBar),
        midiMeta: song.midiMeta,
        midiBlobKey: song.midiBlobKey,
      }),
    })),
  replaceProject: (project) => set({ project }),
  resetToDemo: () => set((s) => ({ project: { ...createDemoProject(), masterVolume: s.project.masterVolume } })),
}));
