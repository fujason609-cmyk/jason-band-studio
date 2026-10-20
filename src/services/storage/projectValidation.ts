import { MEMBERS, isInstrumentId, isMemberId } from "@/features/band/members";
import { vocalRoleOf } from "@/features/band/vocals";
import { clampBpm } from "@/lib/time";
import type { NoteEvent } from "@/types/midi";
import { PROJECT_VERSION, type StudioProject, type StudioTrack } from "@/types/project";

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function validNote(n: unknown): n is NoteEvent {
  if (!n || typeof n !== "object") return false;
  const r = n as Record<string, unknown>;
  return (
    typeof r.pitch === "number" &&
    r.pitch >= 0 &&
    r.pitch <= 127 &&
    typeof r.start === "number" &&
    r.start >= 0 &&
    typeof r.duration === "number" &&
    r.duration > 0 &&
    typeof r.velocity === "number"
  );
}

/** Valid notes only, velocities clamped, sorted by start. */
function cleanNotes(raw: unknown[]): NoteEvent[] {
  return raw
    .filter(validNote)
    .map((n) => ({ pitch: n.pitch, start: n.start, duration: n.duration, velocity: clamp01(n.velocity) }))
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

  const baseBpm = num(r.baseBpm, 120);
  if (baseBpm <= 0) return null;

  return {
    version: PROJECT_VERSION,
    name: typeof r.name === "string" && r.name.trim() ? r.name : "Untitled session",
    bpm: clampBpm(num(r.bpm, baseBpm)),
    baseBpm,
    beatsPerBar: Math.max(1, Math.min(16, Math.round(num(r.beatsPerBar, 4)))),
    masterVolume: clamp01(num(r.masterVolume, 0.8)),
    tracks,
    durationSeconds: Math.max(0.1, num(r.durationSeconds, 1)),
    midiMeta: r.midiMeta && typeof r.midiMeta === "object" ? (r.midiMeta as StudioProject["midiMeta"]) : undefined,
    midiBlobKey: typeof r.midiBlobKey === "string" ? r.midiBlobKey : undefined,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}
