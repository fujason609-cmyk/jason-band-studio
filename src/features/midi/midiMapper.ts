import { MEMBERS, getMember } from "@/features/band/members";
import type { MemberId } from "@/features/band/types";
import { VOCALISTS, vocalRoleOf } from "@/features/band/vocals";
import { foldBpm } from "@/lib/time";
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
const VOCAL = /vocal|voice|\bvox\b|\bsing(er|ers|ing)?\b|choir|chorus|soprano|\balto\b|\bwomen\b|\bmen\b|ボーカル|ヴォーカル|コーラス|歌|唄|合唱|主唱|人声|人聲|和声|和聲|女声|男声|女聲|男聲/i;
/**
 * Words that make a "sung" name an instrument after all: Alto Sax, Soprano Sax, Chorus
 * Guitar, Vox Continental Organ, Vox AC30, Bass & Vocal (Mio plays it), Voice Oohs pad…
 */
const INSTRUMENT_WORD = /sax|organ|horn|trumpet|trombone|tuba|flute|clarinet|oboe|recorder|violin|viola|cello|harp|bell|ac30|amp\b|サックス|オルガン|萨克斯|风琴|風琴/i;
/** Sung parts that sound like backing vocals rather than the lead. */
const BACKING_VOCAL = /back|harmon|chorus|choir|コーラス|和声|和聲|合唱|\bmen\b/i;

export function isVocalName(name: string): boolean {
  return VOCAL.test(name) && !INSTRUMENT_WORD.test(name) && familyFromName(name) === null;
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

/**
 * Tracks named after a band member ("Guitar: Yui Hirasawa", "Bass: Mio Akiyama", "梓",
 * "あずにゃん"), in English, Japanese and Chinese. Fan transcriptions of the band's songs
 * often say who plays what, and that beats any guess. `nick` names (Azu-nyan, Mugi)
 * count for less than real names when two tracks name the same member.
 *
 * A given name written as one kanji only counts on its own, not inside a longer word:
 * 律 is in 主旋律 (main melody) and 旋律吉他, 唯 in 唯美; kana after it are fine (唯ちゃん).
 */
const MEMBER_NAMES: Record<MemberId, { name: RegExp; nick?: RegExp }> = {
  yui: { name: /\byui\b|hirasawa|平沢|平泽|(?<![一-鿿])唯(?![一-鿿])|ゆい/i },
  mio: { name: /\bmio\b|akiyama|秋山|(?<![一-鿿])澪(?![一-鿿])|みお/i },
  ritsu: { name: /\britsu\b|tainaka|田井中|(?<![一-鿿])律(?![一-鿿])|りっちゃん|りつ/i },
  tsumugi: { name: /tsumugi|tsugumi|kotobuki|琴吹|(?<![一-鿿])紬(?![一-鿿])|つむぎ/i, nick: /\bmugi\b|むぎ/i },
  azusa: { name: /azusa|nakano|中野梓|(?<![一-鿿])梓(?![一-鿿])|あずさ/i, nick: /azu-?nyan|あずにゃん/i },
};

/** The member a track's name points at, and how sure: 2 a real name, 1 a nickname. */
export function memberFromName(name: string): { member: MemberId; strength: 1 | 2 } | null {
  for (const [member, n] of Object.entries(MEMBER_NAMES) as [MemberId, (typeof MEMBER_NAMES)[MemberId]][]) {
    if (n.name.test(name)) return { member, strength: 2 };
  }
  for (const [member, n] of Object.entries(MEMBER_NAMES) as [MemberId, (typeof MEMBER_NAMES)[MemberId]][]) {
    if (n.nick?.test(name)) return { member, strength: 1 };
  }
  return null;
}

/** What each member plays, to break ties between tracks that name the same member. */
const MEMBER_FAMILY: Record<MemberId, Family> = { yui: "guitar", mio: "bass", ritsu: "drums", tsumugi: "keys", azusa: "guitar" };

/**
 * Best-guess assignment of MIDI tracks to band members. The user can change all of it.
 * In order: sung parts to the singers; tracks named after a member to that member (one
 * each: a real name over a nickname, their own instrument first, then the busiest);
 * drums to Ritsu and bass to Mio; then the rest by instrument, busiest first, each to a
 * member who plays that instrument, and only then to whoever is still free.
 */
export function suggestMapping(parsed: ParsedMidi): MappingSuggestion {
  const taken = new Set<MemberId>();
  const byIndex = new Map<number, MemberId | null>();

  // sung parts first: one naming a singer ("Vocal (Mio)") to her, then the lead-sounding
  // one to Yui and the next to Mio's harmony
  const sung = parsed.tracks
    .filter((t) => !t.isPercussion && isVocalName(t.name))
    .sort((a, b) => Number(BACKING_VOCAL.test(a.name)) - Number(BACKING_VOCAL.test(b.name)) || b.notes.length - a.notes.length);
  const vocalOf = new Map<number, MemberId>();
  const singerNamed = (t: ParsedMidiTrack) => {
    const member = memberFromName(t.name)?.member;
    return member && VOCALISTS.includes(member) ? member : null;
  };
  for (const t of sung) {
    const member = singerNamed(t);
    if (member && ![...vocalOf.values()].includes(member)) vocalOf.set(t.index, member);
  }
  for (const t of sung) {
    if (vocalOf.has(t.index) || singerNamed(t)) continue;
    const free = VOCALISTS.find((m) => ![...vocalOf.values()].includes(m));
    if (free) vocalOf.set(t.index, free);
  }
  // sung parts beyond the two singers are played by the band, but only after every
  // instrument part has its player: read as keys, they would otherwise take Mugi from the
  // real piano part
  const extraSung = sung.filter((t) => !vocalOf.has(t.index));
  const playable = parsed.tracks.filter((t) => !vocalOf.has(t.index) && !extraSung.includes(t));

  // named after a member: the strongest claim for each member wins, other claims are left out
  const named = playable
    .map((t) => ({ track: t, claim: memberFromName(t.name) }))
    .filter((x): x is { track: ParsedMidiTrack; claim: NonNullable<ReturnType<typeof memberFromName>> } => x.claim !== null)
    .sort(
      (a, b) =>
        b.claim.strength - a.claim.strength ||
        Number(familyOf(b.track) === MEMBER_FAMILY[b.claim.member]) - Number(familyOf(a.track) === MEMBER_FAMILY[a.claim.member]) ||
        b.track.notes.length - a.track.notes.length,
    );
  for (const { track, claim } of named) {
    if (taken.has(claim.member)) {
      byIndex.set(track.index, null);
      continue;
    }
    taken.add(claim.member);
    byIndex.set(track.index, claim.member);
  }

  // unnamed drum and bass tracks: Ritsu and Mio take all of them (a kit is often split over
  // several tracks), unless a track named after them already gave them their drums / bass
  const namedFor = new Set(
    named
      .filter((n) => byIndex.get(n.track.index) === n.claim.member && familyOf(n.track) === MEMBER_FAMILY[n.claim.member])
      .map((n) => n.claim.member),
  );
  for (const track of playable) {
    if (byIndex.has(track.index)) continue;
    const family = familyOf(track);
    const member = family === "drums" ? "ritsu" : family === "bass" ? "mio" : null;
    if (member) byIndex.set(track.index, namedFor.has(member) ? null : member);
  }
  for (const id of byIndex.values()) if (id) taken.add(id);

  const melodic = playable.filter((t) => !byIndex.has(t.index)).sort((a, b) => b.notes.length - a.notes.length);
  const prefsOf = (track: ParsedMidiTrack) => {
    const family = familyOf(track) as keyof typeof PREFERENCES;
    return family === "guitar" && RHYTHM.test(track.name) ? (["azusa", "yui"] as MemberId[]) : PREFERENCES[family];
  };
  // a member who plays the part's instrument first, for every part; only then anyone free
  for (const track of melodic) {
    const choice = prefsOf(track).find((m) => !taken.has(m));
    if (!choice) continue;
    taken.add(choice);
    byIndex.set(track.index, choice);
  }
  for (const track of [...melodic, ...extraSung]) {
    if (byIndex.has(track.index)) continue;
    const choice = (extraSung.includes(track) ? prefsOf(track).find((m) => !taken.has(m)) : undefined) ?? MELODIC_MEMBERS.find((m) => !taken.has(m)) ?? null;
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

/**
 * The studio counts a bar in quarter notes (grid, metronome, bar/beat readout, song
 * length), so a time signature becomes quarters per bar: 6/8 → 3, 2/2 → 4, 12/8 → 6.
 * A bar that isn't a whole number of quarters (7/8) keeps its numerator; 1 to 16.
 */
export function quarterBeatsPerBar(numerator: number, denominator: number): number {
  const quarters = (numerator * 4) / denominator;
  const beats = Number.isInteger(quarters) ? quarters : numerator;
  return Math.max(1, Math.min(16, Math.round(beats)));
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
    // in range by doubling or halving, so the song still plays at its own speed
    baseBpm: foldBpm(firstTempo ?? 120),
    beatsPerBar: quarterBeatsPerBar(firstSig?.numerator ?? 4, firstSig?.denominator ?? 4),
  };
}
