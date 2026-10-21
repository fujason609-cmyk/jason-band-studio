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
      if (this.loop) return;
      // Stop on the audio clock itself; tell the UI with a timer rather than
      // Tone.Draw, whose callbacks are dropped when the tab is in the background.
      this.transport.stop(time);
      const delayMs = Math.max(0, (time - Tone.now()) * 1000);
      // unless playback started again in the meantime (Space right at the end)
      setTimeout(() => {
        if (this.transport.state !== "started" && !this.countingIn) this.onEnd();
      }, delayMs);
    }, `${endTicks}i`);

    this.transport.loopStart = 0;
    this.transport.loopEnd = `${endTicks}i`;
    this.transport.loop = this.loop;
    this.seek(Math.min(position, durationSeconds));
  }

  setLoop(loop: boolean) {
    this.loop = loop;
    this.transport.loop = loop;
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
