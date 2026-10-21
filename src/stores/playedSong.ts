import { soloRound, type SoloRound, type SoloSpot } from "@/lib/soloRound";
import type { StudioProject, StudioTrack } from "@/types/project";
import { useProjectStore } from "./useProjectStore";
import { useStudioStore } from "./useStudioStore";

export interface PlayedSong {
  /** what the engine plays and the timeline draws: the song, plus the solo round when on */
  project: StudioProject;
  /** where each member's solo is (empty when the round is off) */
  spots: readonly SoloSpot[];
  /** song seconds where the written song ends and the round starts (Infinity when off) */
  songEnd: number;
}

const NO_SPOTS: readonly SoloSpot[] = [];

/** The last round written, and what it was written from (only what changes the music). */
let lastRound: { key: unknown[]; round: SoloRound } | null = null;
/** Each member's song + solo notes, reused while neither part changes. */
const merged = new Map<StudioTrack["memberId"], { song: readonly unknown[]; solo: readonly unknown[]; notes: StudioTrack["notes"] }>();
let lastPlayed: { project: StudioProject; on: boolean; played: PlayedSong } | null = null;

function roundFor(project: StudioProject): SoloRound {
  const key = [project.baseBpm, project.beatsPerBar, project.durationSeconds, project.name, ...project.tracks.flatMap((t) => [t.notes, t.vocal, t.instrument])];
  if (lastRound && lastRound.key.length === key.length && lastRound.key.every((k, i) => k === key[i])) return lastRound.round;
  const round = soloRound(project.tracks, project.baseBpm, project.beatsPerBar, project.durationSeconds, project.name);
  lastRound = { key, round };
  return round;
}

/**
 * The song as played. With the solo round on, every track gets its solo-round notes after
 * the song and the song is that much longer; nothing is saved, the stored project stays
 * the song as written. Note arrays keep their identity while the music doesn't change, so
 * a volume drag doesn't re-schedule every part (the engine diffs by array reference).
 */
export function playedSong(project: StudioProject, soloRoundOn: boolean): PlayedSong {
  if (lastPlayed && lastPlayed.project === project && lastPlayed.on === soloRoundOn) return lastPlayed.played;
  let played: PlayedSong;
  if (!soloRoundOn) {
    played = { project, spots: NO_SPOTS, songEnd: Infinity };
  } else {
    const round = roundFor(project);
    const tracks = project.tracks.map((t) => {
      const solo = round.notes[t.memberId] ?? [];
      let entry = merged.get(t.memberId);
      if (!entry || entry.song !== t.notes || entry.solo !== solo) {
        entry = { song: t.notes, solo, notes: [...t.notes, ...solo] };
        merged.set(t.memberId, entry);
      }
      return entry.notes === t.notes ? t : { ...t, notes: entry.notes };
    });
    played = { project: { ...project, tracks, durationSeconds: round.end }, spots: round.spots, songEnd: project.durationSeconds };
  }
  lastPlayed = { project, on: soloRoundOn, played };
  return played;
}

/** The song as played, for components. */
export function usePlayedSong(): PlayedSong {
  const project = useProjectStore((s) => s.project);
  const on = useStudioStore((s) => s.settings.soloRound);
  return playedSong(project, on);
}

/** The song as played, outside React (engine bridge, recording). */
export function getPlayedSong(): PlayedSong {
  return playedSong(useProjectStore.getState().project, useStudioStore.getState().settings.soloRound);
}
