import type { MemberId } from "@/features/band/types";
import { chorusChoices, highlightChoices } from "@/features/overlay/highlight";
import { beatNow } from "@/lib/time";
import type { NoteEvent } from "@/types/midi";
import type { StudioProject } from "@/types/project";
import { DEFAULT_BALANCE } from "../roster";
import type { BalanceConfig, BattleInput, SongNote, SongSection } from "../types";

/** The fight's length, real seconds (a Reel of about 15 s). */
export const CLIP_SECONDS = 15;
/** The clip starts this share of its bars before the chorus, so the KO lands in it. */
const BEFORE_CHORUS = 0.35;
/** A note this close to a beat (share of a beat) is on it. */
const ON_BEAT = 0.1;

/** A part with fewer notes than this in the clip can't fight: the tune stands in. */
const MIN_NOTES = 8;

/** What a member fights with: her own part, or, without one in the clip, the song's tune standing in. */
export interface FighterPart {
  notes: readonly NoteEvent[];
  /** null: her own part; "tune": the vocal or the busiest part stands in for it */
  substitute: null | "tune";
}

export function fighterPart(project: StudioProject, member: MemberId, clip?: { start: number; end: number }): FighterPart {
  const inClip = (notes: readonly NoteEvent[] | undefined) =>
    !notes ? 0 : clip ? notes.filter((n) => n.start >= clip.start - 1e-6 && n.start < clip.end - 1e-6).length : notes.length;
  const own = project.tracks.find((t) => t.memberId === member)?.notes ?? [];
  if (inClip(own) >= MIN_NOTES) return { notes: own, substitute: null };
  const sung = project.tracks
    .map((t) => t.vocal)
    .filter((v) => inClip(v) >= MIN_NOTES)
    .sort((a, b) => inClip(b) - inClip(a))[0];
  if (sung) return { notes: sung, substitute: "tune" };
  const busiest = project.tracks
    .filter((t) => t.instrument !== "drums")
    .map((t) => t.notes)
    .sort((a, b) => inClip(b) - inClip(a))[0];
  // nothing better: whatever she has
  if (!busiest || inClip(busiest) <= inClip(own)) return { notes: own, substitute: null };
  return { notes: busiest, substitute: "tune" };
}

/** The song stretch fought over, in song seconds, and where its choruses are. */
export interface BattleClip {
  /** song seconds */
  start: number;
  end: number;
  bars: number;
  choruses: { start: number; end: number }[];
}

/**
 * About CLIP_SECONDS of whole bars around the song's big chorus (the `choice`-th one): it
 * starts a third of the way before the chorus, so the fight builds and the KO lands in it.
 * A song without a chorus found takes its best highlight, else its start.
 */
export function battleClip(project: StudioProject, songEnd = project.durationSeconds, choice = 0): BattleClip {
  const end = Math.min(songEnd, project.durationSeconds);
  const bar = (60 / project.baseBpm) * project.beatsPerBar;
  const realBar = (bar * project.baseBpm) / Math.max(1, project.bpm);
  const total = Math.max(1, Math.floor(end / bar + 1e-6));
  const bars = Math.min(total, Math.max(4, Math.round(CLIP_SECONDS / realBar)));
  const choruses = chorusChoices(project, songEnd);
  const anchor = choruses.length ? choruses[choice % choruses.length]!.start : highlightChoices(project, songEnd)[0]?.start;
  let first = anchor === undefined ? 0 : Math.round(anchor / bar) - Math.round(bars * BEFORE_CHORUS);
  first = Math.max(0, Math.min(first, total - bars));
  return {
    start: first * bar,
    end: (first + bars) * bar,
    bars,
    choruses: choruses.map((c) => ({ start: c.start, end: c.end })),
  };
}

/** Song seconds of every beat from `start` to `end`, by the song's tempo map. */
export function beatTimes(start: number, end: number, tempos: Parameters<typeof beatNow>[1], bpm: number): number[] {
  const out: number[] = [];
  const first = beatNow(start, tempos, bpm);
  let t = first.phase < 1e-6 ? start : start + (1 - first.phase) * first.seconds;
  while (t < end - 1e-6) {
    out.push(t);
    t += beatNow(t + 1e-6, tempos, bpm).seconds;
  }
  return out;
}

/** The fight's input from the song: both members' notes in the clip, in real seconds. */
export function battleInput(
  project: StudioProject,
  left: MemberId,
  right: MemberId,
  seed: number,
  clip: BattleClip = battleClip(project),
  balance: BalanceConfig = DEFAULT_BALANCE,
): BattleInput {
  const real = project.baseBpm / Math.max(1, project.bpm);
  const tempos = project.midiMeta?.tempos;
  const notesOf = (member: MemberId): SongNote[] =>
    fighterPart(project, member, clip)
      .notes.filter((n) => n.start >= clip.start - 1e-6 && n.start < clip.end - 1e-6)
      .map((n) => {
        const phase = beatNow(n.start, tempos, project.baseBpm).phase;
        return {
          time: n.start * real,
          duration: n.duration * real,
          lane: member,
          pitch: n.pitch,
          velocity: n.velocity,
          isDownbeat: phase < ON_BEAT || phase > 1 - ON_BEAT,
        };
      });
  const notes = [...notesOf(left), ...notesOf(right)].sort((a, b) => a.time - b.time || a.pitch - b.pitch);
  const sections: SongSection[] = [];
  let at = clip.start;
  for (const c of [...clip.choruses].sort((a, b) => a.start - b.start)) {
    const s = Math.max(c.start, clip.start);
    const e = Math.min(c.end, clip.end);
    if (e <= s) continue;
    if (s > at) sections.push({ start: at * real, end: s * real, kind: "verse" });
    sections.push({ start: s * real, end: e * real, kind: "chorus" });
    at = e;
  }
  if (at < clip.end) sections.push({ start: at * real, end: clip.end * real, kind: at === clip.start ? "verse" : "outro" });
  return {
    songId: project.name,
    notes,
    sections,
    beats: beatTimes(clip.start, clip.end, tempos, project.baseBpm).map((t) => t * real),
    clip: { start: clip.start * real, end: clip.end * real },
    left,
    right,
    seed,
    balance,
  };
}
