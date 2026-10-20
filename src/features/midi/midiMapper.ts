import { MEMBERS, getMember } from "@/features/band/members";
import type { MemberId } from "@/features/band/types";
import { VOCALISTS, vocalRoleOf } from "@/features/band/vocals";
import type { InstrumentId } from "@/types/audio";
import type { MappingSuggestion, ParsedMidi, ParsedMidiTrack, TrackAssignment } from "@/types/midi";
import type { StudioTrack } from "@/types/project";

type Family = "drums" | "bass" | "guitar" | "keys" | "lead";

/**
 * What a track's name says it is, in English, Japanese or Chinese. Scores name their
 * parts reliably but often carry no MIDI program (MusicXML from MuseScore imports as
 * program 0, a piano), so a clear name wins over the program. Bass before keys, so
 * "Synth Bass" is a bass.
 */
export function familyFromName(name: string): Exclude<Family, "lead"> | null {
  const n = name.toLowerCase();
  if (/drum|perc|kit\b|ドラム|鼓/.test(n)) return "drums";
  if (/bass(?!oon)|ベース|贝斯|貝斯/.test(n)) return "bass";
  if (/guit|gtr|ギター|吉他/.test(n)) return "guitar";
  if (/piano|key|synth|organ|pad|string|ピアノ|キーボード|シンセ|钢琴|鋼琴|键盘|鍵盤|合成器/.test(n)) return "keys";
  return null;
}

/** A part that is sung: vocals, voice, choir, in English, Japanese or Chinese. */
const VOCAL = /vocal|voice|vox|singer|sing\b|choir|chorus|soprano|alto\b|\bwomen\b|\bmen\b|ボーカル|ヴォーカル|コーラス|歌|唄|合唱|主唱|人声|人聲|和声|和聲|女声|男声|女聲|男聲/i;
/** Sung parts that sound like backing vocals rather than the lead. */
const BACKING_VOCAL = /back|harmon|chorus|choir|コーラス|和声|和聲|合唱|\bmen\b/i;

export function isVocalName(name: string): boolean {
  return VOCAL.test(name);
}

/** "Rhythm Guitar" / "リズムギター" / "节奏吉他": Azusa's part rather than Yui's. */
const RHYTHM = /rhythm|backing|リズム|节奏|節奏/i;

export function familyOf(track: Pick<ParsedMidiTrack, "isPercussion" | "program"> & { name?: string }): Family {
  if (track.isPercussion) return "drums";
  const named = track.name ? familyFromName(track.name) : null;
  if (named) return named;
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

  // sung parts first: the lead-sounding one to Yui, the next to Mio's harmony
  const sung = parsed.tracks
    .filter((t) => !t.isPercussion && isVocalName(t.name))
    .sort((a, b) => Number(BACKING_VOCAL.test(a.name)) - Number(BACKING_VOCAL.test(b.name)) || b.notes.length - a.notes.length);
  const vocalOf = new Map<number, MemberId>();
  sung.slice(0, VOCALISTS.length).forEach((t, i) => vocalOf.set(t.index, VOCALISTS[i]!));

  for (const track of parsed.tracks) {
    if (vocalOf.has(track.index)) continue;
    const family = familyOf(track);
    if (family === "drums") byIndex.set(track.index, "ritsu");
    if (family === "bass") byIndex.set(track.index, "mio");
  }

  const melodic = parsed.tracks
    .filter((t) => !byIndex.has(t.index) && !vocalOf.has(t.index))
    .sort((a, b) => b.notes.length - a.notes.length);

  for (const track of melodic) {
    const family = familyOf(track) as keyof typeof PREFERENCES;
    const prefs = family === "guitar" && RHYTHM.test(track.name) ? ["azusa", "yui"] as MemberId[] : PREFERENCES[family];
    const choice = prefs.find((m) => !taken.has(m)) ?? MELODIC_MEMBERS.find((m) => !taken.has(m)) ?? null;
    if (choice) taken.add(choice);
    byIndex.set(track.index, choice);
  }

  const assignments: TrackAssignment[] = parsed.tracks.map((t) => {
    const singer = vocalOf.get(t.index);
    return singer
      ? { midiTrackIndex: t.index, memberId: singer, vocal: true }
      : { midiTrackIndex: t.index, memberId: byIndex.get(t.index) ?? null };
  });

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
      .filter((a) => a.memberId === member.id && !a.vocal)
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
    const notesOf = (vocal: boolean) =>
      assignments
        .filter((a) => a.memberId === member.id && Boolean(a.vocal) === vocal)
        .flatMap((a) => parsed.tracks.find((t) => t.index === a.midiTrackIndex)?.notes ?? [])
        .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
    const vocal = vocalRoleOf(member.id) ? notesOf(true) : [];
    return {
      id: `track-${member.id}`,
      memberId: member.id,
      name: getMember(member.id).role,
      instrument: instruments[member.id] ?? member.defaultInstrument,
      notes: notesOf(false),
      ...(vocal.length ? { vocal } : {}),
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
