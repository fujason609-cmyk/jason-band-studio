import type { MemberId } from "./types";

/**
 * Who sings: Yui is the lead vocalist and Mio sings harmony (backing vocals). Their
 * vocal part is a second note list on their track (`StudioTrack.vocal`), sung by a
 * synthesized "ah" / "oh" voice with no words, and switched on or off per role in the
 * settings. Nobody imitates a real singer's voice.
 */
export type VocalRole = "lead" | "harmony";

export const VOCAL_ROLES: Partial<Record<MemberId, VocalRole>> = { yui: "lead", mio: "harmony" };

/** Singers in the order they are offered: lead first. */
export const VOCALISTS: readonly MemberId[] = ["yui", "mio"];

export function vocalRoleOf(member: MemberId): VocalRole | null {
  return VOCAL_ROLES[member] ?? null;
}

/** Where each singer's part should sit: the middle of a girl's singing range (MIDI). */
const VOICE_CENTRE: Record<VocalRole, number> = { lead: 71, harmony: 66 };

/**
 * Move a whole part by octaves so its middle note lands near the singer's range: a men's
 * choir line or a tune written an octave off is sung where a girl sings it. The whole
 * part moves together, so the tune keeps its shape.
 */
export function fitToVoice<T extends { pitch: number }>(notes: readonly T[], role: VocalRole): readonly T[] {
  if (notes.length === 0) return notes;
  const sorted = notes.map((n) => n.pitch).sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)]!;
  const octaves = Math.round((VOICE_CENTRE[role] - middle) / 12);
  return octaves === 0 ? notes : notes.map((n) => ({ ...n, pitch: n.pitch + octaves * 12 }));
}

/** A rest at least this long (seconds) before a note starts a new phrase: time to breathe. */
const BREATH_GAP = 0.35;
/** How long before the phrase the in-breath starts. */
export const BREATH_LEAD = 0.32;

/**
 * When the singer breathes in (song seconds): before the first note and before every note
 * that follows a rest, starting BREATH_LEAD early but never before the last note ends.
 */
export function breathTimes(notes: readonly { start: number; duration: number }[]): number[] {
  const times: number[] = [];
  let lastEnd = -Infinity;
  for (const n of notes) {
    if (n.start - lastEnd >= BREATH_GAP) times.push(Math.max(0, lastEnd, n.start - BREATH_LEAD));
    lastEnd = Math.max(lastEnd, n.start + n.duration);
  }
  return times;
}

export type VocalSwitches = Record<VocalRole, boolean>;

export const DEFAULT_VOCALS: VocalSwitches = { lead: true, harmony: true };
