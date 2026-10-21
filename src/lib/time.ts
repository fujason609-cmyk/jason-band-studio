/**
 * Time model
 * ----------
 * Notes are stored in "song seconds": seconds from the start of the song at the
 * song's own tempo map (which @tonejs/midi already resolves for us).
 *
 * The engine schedules every note in Transport ticks computed against a fixed
 * reference tempo (the song's base BPM). Playing at a different BPM is then just
 * a matter of changing Transport.bpm: tick positions never move, so the playhead
 * and the audio can't drift apart, and the current position survives a tempo change.
 */

export const MIN_BPM = 40;
export const MAX_BPM = 300;

/**
 * A playable tempo: inside MIN_BPM…MAX_BPM, to two decimals. Not rounded to whole BPM:
 * an imported song at 133.33 BPM must play at 133.33, or a 4-minute song drifts ~0.6 s
 * against footage synced to the original.
 */
export function clampBpm(bpm: number): number {
  if (!Number.isFinite(bpm)) return 120;
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm * 100) / 100));
}

/**
 * A song's base tempo inside MIN_BPM…MAX_BPM by doubling or halving it: notes are in song
 * seconds, so the base tempo only sets the grid (a 400 BPM file reads as 200 in half time)
 * and the song still plays at its own speed. Clamping it instead would play it slower.
 */
export function foldBpm(bpm: number): number {
  if (!Number.isFinite(bpm) || bpm <= 0) return 120;
  let folded = bpm;
  while (folded > MAX_BPM) folded /= 2;
  while (folded < MIN_BPM) folded *= 2;
  return clampBpm(folded);
}

export function secondsToTicks(songSeconds: number, baseBpm: number, ppq: number): number {
  return Math.round(songSeconds * (baseBpm / 60) * ppq);
}

export function ticksToSeconds(ticks: number, baseBpm: number, ppq: number): number {
  return (ticks / ppq) * (60 / baseBpm);
}

/** How long `songSeconds` of material takes to play at `bpm`. */
export function songToRealSeconds(songSeconds: number, baseBpm: number, bpm: number): number {
  return songSeconds * (baseBpm / bpm);
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const tenths = Math.floor((safe * 10) % 10);
  return `${m}:${s.toString().padStart(2, "0")}.${tenths}`;
}

/** Bar and beat (1-based) for a position in song seconds. */
export function barBeat(songSeconds: number, baseBpm: number, beatsPerBar: number) {
  const beats = Math.max(0, songSeconds) * (baseBpm / 60);
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = Math.floor(beats % beatsPerBar) + 1;
  return { bar, beat };
}
