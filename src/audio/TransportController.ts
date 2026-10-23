import * as Tone from "tone";
import { secondsToTicks, ticksToSeconds } from "@/lib/time";
import type { TransportStatus } from "@/types/audio";
import { PPQ } from "./audioConfig";

/**
 * The single clock for the whole band. Positions are exposed in song seconds
 * (seconds at the song's base tempo), which is also what the timeline draws.
 */
export class TransportController {
  private readonly transport = Tone.getTransport();
  private baseBpm = 120;
  private durationSeconds = 0;
  private loop = false;
  /** a stretch looped instead of the whole song (the highlight take), song seconds */
  private range: { start: number; end: number } | null = null;
  private endEventId: number | null = null;
  /** audio-clock time a counted-in start is waiting for */
  private startsAt: number | null = null;

  constructor(
    private readonly onEnd: () => void,
    private readonly onCut: () => void,
  ) {
    this.transport.PPQ = PPQ;
  }

  /** Waiting out a count-in: the start is scheduled but hasn't happened yet. */
  private get countingIn() {
    return this.startsAt !== null && Tone.now() < this.startsAt;
  }

  get status(): TransportStatus {
    if (this.countingIn) return "playing";
    const s = this.transport.state;
    return s === "started" ? "playing" : s === "paused" ? "paused" : "stopped";
  }

  configure(baseBpm: number, durationSeconds: number) {
    if (baseBpm === this.baseBpm && durationSeconds === this.durationSeconds) return;
    const position = this.getPosition();
    this.baseBpm = baseBpm;
    this.durationSeconds = durationSeconds;
    const endTicks = secondsToTicks(durationSeconds, baseBpm, PPQ);

    if (this.endEventId !== null) this.transport.clear(this.endEventId);
    this.endEventId = this.transport.schedule((time) => {
      if (this.loop || this.range) return;
      // Stop once the sound gets there, from a timer, not here: stopping inside the
      // transport's own callback set the ticks back to 0 while its clock was still counting
      // this window, and the song's first notes played again at the end (measured: 2 takes
      // in 3). A timer, not Tone.Draw, whose callbacks are dropped in a background tab.
      const delayMs = Math.max(0, (time - Tone.now()) * 1000);
      setTimeout(() => {
        // unless playback stopped, started again or moved back meanwhile (Space at the end)
        if (this.transport.state !== "started" || this.countingIn) return;
        if (this.getPosition() < this.durationSeconds - 0.01) return;
        this.transport.stop();
        this.onEnd();
      }, delayMs);
    }, `${endTicks}i`);

    this.applyLoop();
    this.seek(Math.min(position, durationSeconds));
  }

  setLoop(loop: boolean) {
    this.loop = loop;
    this.applyLoop();
  }

  /**
   * Loop only `range` (song seconds), or the whole song again (null). Notes still ringing
   * at the loop point carry on into the next time round, as they would in the song.
   */
  setLoopRange(range: { start: number; end: number } | null) {
    this.range = range;
    this.applyLoop();
  }

  private applyLoop() {
    const ticks = (s: number) => `${secondsToTicks(s, this.baseBpm, PPQ)}i`;
    this.transport.loopStart = this.range ? ticks(this.range.start) : 0;
    this.transport.loopEnd = ticks(this.range ? this.range.end : this.durationSeconds);
    this.transport.loop = this.loop || this.range !== null;
  }

  setBpm(bpm: number) {
    // Changing tempo leaves the tick position untouched, so the playhead stays put.
    this.transport.bpm.value = bpm;
  }

  /** Start now, or at audio-clock time `at` (after a count-in). */
  play(at?: number) {
    if (this.getPosition() >= this.durationSeconds - 0.01) this.seek(0);
    this.startsAt = at ?? null;
    this.transport.start(at);
  }

  pause() {
    if (this.countingIn) {
      // a pause before the start can't cancel it; stop does, then put the position back
      const ticks = this.transport.ticks;
      this.transport.stop();
      this.transport.ticks = ticks;
    } else {
      this.transport.pause();
    }
    this.startsAt = null;
    this.onCut();
  }

  /**
   * Pause at audio-clock `time` without cutting the notes still sounding: they ring on (the
   * end of a chorus take). A later pause() or stop() cuts them.
   */
  pauseAt(time: number) {
    this.startsAt = null;
    this.transport.pause(time);
  }

  stop() {
    this.startsAt = null;
    this.transport.stop();
    this.transport.ticks = 0;
    this.onCut();
  }

  seek(songSeconds: number) {
    const clamped = Math.max(0, Math.min(songSeconds, this.durationSeconds));
    this.onCut();
    this.transport.ticks = secondsToTicks(clamped, this.baseBpm, PPQ);
  }

  /** Current position in song seconds. */
  getPosition(): number {
    return ticksToSeconds(this.transport.ticks, this.baseBpm, PPQ);
  }

  /**
   * Position (song seconds) of what is coming out of the speakers right now. Tone
   * schedules ahead by the context's lookAhead, so `getPosition()` runs that far
   * ahead of the sound; a recording pairs pictures with sound, so it uses this.
   */
  getAudiblePosition(): number {
    const now = Tone.getContext().rawContext.currentTime;
    return Math.max(0, ticksToSeconds(this.transport.getTicksAtTime(now), this.baseBpm, PPQ));
  }

  dispose() {
    if (this.endEventId !== null) this.transport.clear(this.endEventId);
    this.transport.stop();
    this.transport.cancel(0);
  }
}
