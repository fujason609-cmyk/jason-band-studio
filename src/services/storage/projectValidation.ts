import { MEMBERS, isInstrumentId, isMemberId } from "@/features/band/members";
import { vocalRoleOf } from "@/features/band/vocals";
import { getT } from "@/i18n/useT";
import { clampBpm, foldBpm } from "@/lib/time";
import { songLength } from "@/stores/useProjectStore";
import type { BendPoint, NoteEvent } from "@/types/midi";
import { PROJECT_VERSION, type StudioProject, type StudioTrack } from "@/types/project";

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** A whole MIDI pitch, a start and length that are real numbers (Infinity and NaN survive IndexedDB). */
function validNote(n: unknown): n is NoteEvent {
  if (!n || typeof n !== "object") return false;
  const r = n as Record<string, unknown>;
  return (
    Number.isInteger(r.pitch) &&
    (r.pitch as number) >= 0 &&
    (r.pitch as number) <= 127 &&
    finite(r.start) &&
    r.start >= 0 &&
    finite(r.duration) &&
    r.duration > 0 &&
    finite(r.velocity)
  );
}

/** A note's bend, if it is a list of finite points within two octaves; anything else is dropped. */
function cleanBend(raw: unknown): BendPoint[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 256) return undefined;
  const points = raw.filter(
    (p): p is BendPoint =>
      !!p && typeof p === "object" && finite(p.at) && p.at >= 0 && finite(p.semitones) && Math.abs(p.semitones) <= 24,
  );
  return points.length === raw.length ? points.map((p) => ({ at: p.at, semitones: p.semitones })) : undefined;
}

/** Valid notes only, velocities clamped, sorted by start; a bend kept when it is sound. */
function cleanNotes(raw: unknown[]): NoteEvent[] {
  return raw
    .filter(validNote)
    .map((n) => {
      const note: NoteEvent = { pitch: n.pitch, start: n.start, duration: n.duration, velocity: clamp01(n.velocity) };
      const bend = cleanBend(n.bend);
      return bend ? { ...note, bend } : note;
    })
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

/**
 * Check a stored project. Returns null when it can't be trusted (wrong version,
 * wrong shape) so the caller can fall back to the demo and tell the user.
 * Individual bad notes are dropped rather than failing the whole project.
 */
export function validateProject(raw: unknown): StudioProject | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== PROJECT_VERSION) return null;
  if (!Array.isArray(r.tracks)) return null;

  const tracks: StudioTrack[] = [];
  for (const member of MEMBERS) {
    const t = (r.tracks as unknown[]).find(
      (x) => x && typeof x === "object" && (x as Record<string, unknown>).memberId === member.id,
    ) as Record<string, unknown> | undefined;
    if (!t || !isMemberId(t.memberId)) return null;
    tracks.push({
      id: typeof t.id === "string" ? t.id : `track-${member.id}`,
      memberId: member.id,
      name: typeof t.name === "string" ? t.name : member.role,
      instrument: isInstrumentId(t.instrument) ? t.instrument : member.defaultInstrument,
      notes: Array.isArray(t.notes) ? cleanNotes(t.notes) : [],
      // optional: only singers have one, and projects from before vocals have none
      ...(Array.isArray(t.vocal) && vocalRoleOf(member.id) ? { vocal: cleanNotes(t.vocal) } : {}),
      volume: clamp01(num(t.volume, 0.8)),
      muted: t.muted === true,
      solo: t.solo === true,
    });
  }

  const rawBase = num(r.baseBpm, 120);
  if (rawBase <= 0) return null;
  // only sets the grid (notes are in seconds), so a tempo out of range is folded, not clamped
  const baseBpm = foldBpm(rawBase);
  const beatsPerBar = Math.max(1, Math.min(16, Math.round(num(r.beatsPerBar, 4))));

  return {
    version: PROJECT_VERSION,
    name: typeof r.name === "string" && r.name.trim() ? r.name : getT().untitled,
    bpm: clampBpm(num(r.bpm, baseBpm)),
    baseBpm,
    beatsPerBar,
    masterVolume: clamp01(num(r.masterVolume, 0.8)),
    tracks,
    // never shorter than the notes, or the song would end before they play
    durationSeconds: Math.max(num(r.durationSeconds, 0), songLength(tracks, baseBpm, beatsPerBar)),
    midiMeta: r.midiMeta && typeof r.midiMeta === "object" ? (r.midiMeta as StudioProject["midiMeta"]) : undefined,
    midiBlobKey: typeof r.midiBlobKey === "string" ? r.midiBlobKey : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}
