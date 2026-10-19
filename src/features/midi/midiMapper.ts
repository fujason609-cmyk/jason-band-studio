import { MEMBERS, getMember } from "@/features/band/members";
import type { MemberId } from "@/features/band/types";
import type { InstrumentId } from "@/types/audio";
import type { MappingSuggestion, ParsedMidi, ParsedMidiTrack, TrackAssignment } from "@/types/midi";
import type { StudioTrack } from "@/types/project";

type Family = "drums" | "bass" | "guitar" | "keys" | "lead";

export function familyOf(track: Pick<ParsedMidiTrack, "isPercussion" | "program">): Family {
  if (track.isPercussion) return "drums";
  const p = track.program;
  if (p >= 32 && p <= 39) return "bass";
  if (p >= 24 && p <= 31) return "guitar";
  if (p <= 23 || (p >= 88 && p <= 95) || (p >= 40 && p <= 55)) return "keys";
  return "lead";
}

const PREFERENCES: Record<Exclude<Family, "drums" | "bass">, MemberId[]> = {
  guitar: ["yui", "azusa"],
  keys: ["tsumugi"],
  lead: ["yui", "tsumugi", "azusa"],
};
const MELODIC_MEMBERS: MemberId[] = ["yui", "azusa", "tsumugi"];

/** Best-guess assignment of MIDI tracks to band members. The user can change all of it. */
export function suggestMapping(parsed: ParsedMidi): MappingSuggestion {
  const taken = new Set<MemberId>();
  const byIndex = new Map<number, MemberId | null>();

  for (const track of parsed.tracks) {
    const family = familyOf(track);
    if (family === "drums") byIndex.set(track.index, "ritsu");
    if (family === "bass") byIndex.set(track.index, "mio");
  }

  const melodic = parsed.tracks
    .filter((t) => !byIndex.has(t.index))
    .sort((a, b) => b.notes.length - a.notes.length);

  for (const track of melodic) {
    const family = familyOf(track) as keyof typeof PREFERENCES;
    const choice =
      PREFERENCES[family].find((m) => !taken.has(m)) ?? MELODIC_MEMBERS.find((m) => !taken.has(m)) ?? null;
    if (choice) taken.add(choice);
    byIndex.set(track.index, choice);
  }

  const assignments: TrackAssignment[] = parsed.tracks.map((t) => ({
    midiTrackIndex: t.index,
    memberId: byIndex.get(t.index) ?? null,
  }));

  return { assignments, instruments: instrumentsFor(parsed, assignments) };
}

/** Pick an instrument for each member based on what was assigned to them. */
export function instrumentsFor(
  parsed: ParsedMidi,
  assignments: TrackAssignment[],
): Partial<Record<MemberId, InstrumentId>> {
  const result: Partial<Record<MemberId, InstrumentId>> = {};
  for (const member of MEMBERS) {
    const tracks = assignments
      .filter((a) => a.memberId === member.id)
      .map((a) => parsed.tracks.find((t) => t.index === a.midiTrackIndex))
      .filter((t): t is ParsedMidiTrack => Boolean(t));
    if (tracks.length === 0) continue;
    const drumNotes = tracks.filter((t) => t.isPercussion).reduce((n, t) => n + t.notes.length, 0);
    const allNotes = tracks.reduce((n, t) => n + t.notes.length, 0);
    if (drumNotes > allNotes / 2) result[member.id] = "drums";
    else if (member.defaultInstrument === "drums") result[member.id] = "keys";
    else if (tracks.every((t) => familyOf(t) === "bass")) result[member.id] = "bass";
    else result[member.id] = member.defaultInstrument;
  }
  return result;
}

export interface MappedSong {
  tracks: StudioTrack[];
  baseBpm: number;
  beatsPerBar: number;
}

/**
 * Turn a parsed file plus the user's assignments into the five studio tracks.
 * Mixer settings (volume / mute / solo) carry over from the current tracks.
 */
export function buildTracksFromMapping(
  parsed: ParsedMidi,
  assignments: TrackAssignment[],
  previous: readonly StudioTrack[] = [],
): MappedSong {
  const instruments = instrumentsFor(parsed, assignments);
  const tracks = MEMBERS.map((member): StudioTrack => {
    const old = previous.find((t) => t.memberId === member.id);
    const notes = assignments
      .filter((a) => a.memberId === member.id)
      .flatMap((a) => parsed.tracks.find((t) => t.index === a.midiTrackIndex)?.notes ?? [])
      .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    return {
      id: `track-${member.id}`,
      memberId: member.id,
      name: getMember(member.id).role,
      instrument: instruments[member.id] ?? member.defaultInstrument,
      notes,
      volume: old?.volume ?? 0.8,
      muted: old?.muted ?? false,
      solo: old?.solo ?? false,
    };
  });

  const firstTempo = parsed.meta.tempos[0]?.bpm;
  const firstSig = parsed.meta.timeSignatures[0];
  return {
    tracks,
    baseBpm: firstTempo && Number.isFinite(firstTempo) ? Math.round(firstTempo * 100) / 100 : 120,
    beatsPerBar: firstSig?.numerator ?? 4,
  };
}
