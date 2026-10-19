import * as Tone from "tone";
import { gainToDb } from "@/lib/mix";
import { secondsToTicks } from "@/lib/time";
import type { InstrumentId } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";
import { PPQ } from "./audioConfig";
import type { SampleManager } from "./SampleManager";
import type { Voice } from "./voices";

interface ScheduledNote {
  time: string;
  pitch: number;
  durationTicks: number;
  velocity: number;
}

/**
 * One member's lane: a sequenced voice behind a channel strip (volume + mute),
 * plus a separate live voice for keyboard playing so live notes are never cut
 * off by transport stops and ignore mute / solo.
 */
export class AudioTrack {
  readonly channel: Tone.Channel;
  private readonly liveChannel: Tone.Volume;
  private voice: Voice | null = null;
  private liveVoice: Voice | null = null;
  private part: Tone.Part<ScheduledNote> | null = null;
  private notesRef: readonly NoteEvent[] | null = null;
  private baseBpm = 120;
  private audible = true;
  private instrument: InstrumentId;

  constructor(
    instrument: InstrumentId,
    master: Tone.ToneAudioNode,
    private readonly samples: SampleManager,
  ) {
    this.instrument = instrument;
    this.channel = new Tone.Channel({ volume: 0 }).connect(master);
    this.liveChannel = new Tone.Volume(0).connect(master);
  }

  get currentInstrument() {
    return this.instrument;
  }

  /** Rebuild voices once the instrument's source is loaded. */
  async setInstrument(instrument: InstrumentId) {
    this.instrument = instrument;
    this.voice?.dispose();
    this.liveVoice?.dispose();
    this.voice = null;
    this.liveVoice = null;
    await this.samples.load(instrument);
    if (this.instrument !== instrument) return; // a newer change won the race
    this.voice = this.samples.createVoice(instrument);
    this.voice.output.connect(this.channel);
    this.liveVoice = this.samples.createVoice(instrument);
    this.liveVoice.output.connect(this.liveChannel);
  }

  /** Schedule notes on the shared transport. No-op when given the same array again. */
  setNotes(notes: readonly NoteEvent[], baseBpm: number) {
    if (notes === this.notesRef && baseBpm === this.baseBpm) return;
    this.notesRef = notes;
    this.baseBpm = baseBpm;
    this.part?.dispose();

    const events: ScheduledNote[] = notes.map((n) => ({
      time: `${secondsToTicks(n.start, baseBpm, PPQ)}i`,
      pitch: n.pitch,
      durationTicks: Math.max(1, secondsToTicks(n.duration, baseBpm, PPQ)),
      velocity: n.velocity,
    }));

    this.part = new Tone.Part<ScheduledNote>((time, ev) => {
      if (!this.audible || !this.voice) return; // instrument not ready yet → stay silent
      // Duration in ticks so it stretches with the transport tempo.
      this.voice.attackRelease(ev.pitch, `${ev.durationTicks}i`, time, ev.velocity);
    }, events);
    this.part.start(0);
  }

  setVolume(volume: number) {
    const db = gainToDb(volume);
    this.channel.volume.value = db;
    this.liveChannel.volume.value = db;
  }

  /** Apply the result of the mute / solo rules. Going silent also cuts ringing notes. */
  setAudible(audible: boolean) {
    if (audible === this.audible) return;
    this.audible = audible;
    this.channel.mute = !audible;
    if (!audible) this.voice?.releaseAll();
  }

  releaseAll() {
    this.voice?.releaseAll();
  }

  liveAttack(pitch: number, velocity = 0.8) {
    this.liveVoice?.attack(pitch, Tone.now(), velocity);
  }

  liveRelease(pitch: number) {
    this.liveVoice?.release(pitch, Tone.now());
  }

  liveReleaseAll() {
    this.liveVoice?.releaseAll();
  }

  get ready() {
    return this.voice !== null;
  }

  dispose() {
    this.part?.dispose();
    this.voice?.dispose();
    this.liveVoice?.dispose();
    this.channel.dispose();
    this.liveChannel.dispose();
  }
}
