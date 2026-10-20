import * as Tone from "tone";
import type { MemberId } from "@/features/band/types";
import { humanize, profileFor, strumOffsets, type FeelProfile, type FeelSetting } from "@/lib/feel";
import { gainToDb } from "@/lib/mix";
import { breathTimes, fitToVoice, type VocalRole } from "@/features/band/vocals";
import { arrange, arrangeVocal, type BandContext, type PlayStyle, type StyledNote } from "@/lib/playStyle";
import { secondsToTicks } from "@/lib/time";
import type { InstrumentId } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";
import { PPQ } from "./audioConfig";
import type { SampleManager } from "./SampleManager";
import { createVocalVoice, type SingingVoice, type Voice } from "./voices";

interface ScheduledNote {
  time: string;
  ticks: number;
  pitch: number;
  durationTicks: number;
  velocity: number;
  /** place in a strummed chord (0 = first string) */
  strumIndex: number;
  /** a singer's in-breath before a phrase, not a note */
  breath?: boolean;
}

/** Notes in song seconds → Transport ticks, ready to arrange. */
function toTicks(notes: readonly NoteEvent[], baseBpm: number): StyledNote[] {
  return notes.map((n) => ({
    ticks: secondsToTicks(n.start, baseBpm, PPQ),
    durationTicks: Math.max(1, secondsToTicks(n.duration, baseBpm, PPQ)),
    pitch: n.pitch,
    velocity: n.velocity,
  }));
}

/**
 * One member's lane: a sequenced voice behind a channel strip (volume + mute),
 * plus a separate live voice for keyboard playing so live notes are never cut
 * off by transport stops and ignore mute / solo. Sequenced notes are arranged in the
 * playing style, then played with the member's feel (timing, dynamics, strums); live
 * notes are played as you play them. Yui and Mio also sing (`setVocal`): a vocal voice
 * on the same channel, so the member's volume, mute and solo apply to it too.
 */
export class AudioTrack {
  readonly channel: Tone.Channel;
  private readonly liveChannel: Tone.Volume;
  private voice: Voice | null = null;
  private liveVoice: Voice | null = null;
  private part: Tone.Part<ScheduledNote> | null = null;
  private notesRef: readonly NoteEvent[] | null = null;
  private baseBpm = 120;
  private beatsPerBar = 4;
  private band: BandContext = { autoDrums: false, playedBars: [] };
  private audible = true;
  private instrument: InstrumentId;
  private feel: FeelProfile;
  private vocalVoice: SingingVoice | null = null;
  private vocalPart: Tone.Part<ScheduledNote> | null = null;
  private vocalRef: readonly NoteEvent[] = [];
  private vocalRole: VocalRole | null = null;
  private vocalLoading = false;
  private singing = true;
  private disposed = false;

  constructor(
    private readonly member: MemberId,
    instrument: InstrumentId,
    master: Tone.ToneAudioNode,
    private readonly samples: SampleManager,
    feel: FeelSetting,
    private style: PlayStyle,
  ) {
    this.instrument = instrument;
    this.feel = profileFor(member, feel);
    this.channel = new Tone.Channel({ volume: 0 }).connect(master);
    this.liveChannel = new Tone.Volume(0).connect(master);
  }

  get currentInstrument() {
    return this.instrument;
  }

  /** Rebuild voices once the instrument's source is loaded. */
  async setInstrument(instrument: InstrumentId) {
    const changed = instrument !== this.instrument;
    this.instrument = instrument;
    if (changed) this.schedule(); // the style arranges each instrument differently
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

  setFeel(feel: FeelSetting) {
    this.feel = profileFor(this.member, feel);
  }

  /** Schedule notes on the shared transport. No-op when given the same array again. */
  setNotes(notes: readonly NoteEvent[], baseBpm: number, beatsPerBar: number) {
    if (notes === this.notesRef && baseBpm === this.baseBpm && beatsPerBar === this.beatsPerBar) return;
    const retimed = baseBpm !== this.baseBpm;
    this.notesRef = notes;
    this.baseBpm = baseBpm;
    this.beatsPerBar = beatsPerBar;
    this.schedule();
    if (retimed) this.scheduleVocal();
  }

  /** Play the same notes in another style. Applies from the next note, mid-song too. */
  setStyle(style: PlayStyle) {
    if (style === this.style) return;
    this.style = style;
    this.schedule();
    this.scheduleVocal();
  }

  /**
   * The member's sung part (`role` is theirs: Yui lead, Mio harmony). No-op when given the
   * same array again; an empty part frees the voice.
   */
  setVocal(notes: readonly NoteEvent[], role: VocalRole | null) {
    if (notes === this.vocalRef) return;
    this.vocalRef = notes;
    this.vocalRole = role;
    if (notes.length > 0 && role && !this.vocalVoice && !this.vocalLoading) {
      // the singer's notes are rendered the first time; until then the part stays silent
      this.vocalLoading = true;
      void createVocalVoice(role).then((voice) => {
        this.vocalLoading = false;
        if (this.disposed || this.vocalRef.length === 0) return voice.dispose();
        this.vocalVoice = voice;
        voice.output.connect(this.channel);
      });
    }
    this.scheduleVocal();
  }

  /** The vocal switch: off stops the singing (now) but keeps the part. */
  setSinging(on: boolean) {
    if (on === this.singing) return;
    this.singing = on;
    if (!on) this.vocalVoice?.releaseAll();
  }

  private scheduleVocal() {
    this.vocalPart?.dispose();
    this.vocalPart = null;
    if (this.vocalRef.length === 0) {
      this.vocalVoice?.dispose();
      this.vocalVoice = null;
      return;
    }
    const inRange = this.vocalRole ? fitToVoice(this.vocalRef, this.vocalRole) : this.vocalRef;
    const sung = arrangeVocal(this.style, toTicks(inRange, this.baseBpm), PPQ);
    const events: ScheduledNote[] = sung.map((n) => ({ ...n, time: `${n.ticks}i`, strumIndex: 0 }));
    for (const seconds of breathTimes(inRange)) {
      const ticks = secondsToTicks(seconds, this.baseBpm, PPQ);
      events.push({ time: `${ticks}i`, ticks, pitch: 0, durationTicks: 1, velocity: 0.8, strumIndex: 0, breath: true });
    }
    this.vocalPart = new Tone.Part<ScheduledNote>((time, ev) => {
      if (!this.audible || !this.singing || !this.vocalVoice) return;
      const { offset, velocity } = humanize(this.feel, ev, PPQ, Math.random);
      if (ev.breath) return this.vocalVoice.breathe(Math.max(Tone.now(), time + offset), velocity);
      this.vocalVoice.attackRelease(ev.pitch, `${ev.durationTicks}i`, Math.max(Tone.now(), time + offset), velocity);
    }, events);
    this.vocalPart.start(0);
  }

  /**
   * What the rest of the band plays (for generated drums). Pass the same object again
   * when nothing changed; only an empty drum part re-schedules.
   */
  setBand(band: BandContext) {
    if (band === this.band) return;
    this.band = band;
    if (this.instrument === "drums" && this.notesRef?.length === 0) this.schedule();
  }

  private schedule() {
    this.part?.dispose();
    this.part = null;
    if (!this.notesRef) return;
    const written = toTicks(this.notesRef, this.baseBpm);
    const played = arrange(this.style, this.instrument, written, PPQ, this.beatsPerBar, this.band);
    const strums = strumOffsets(played, PPQ);
    const events: ScheduledNote[] = played.map((n, i) => ({ ...n, time: `${n.ticks}i`, strumIndex: strums[i]! }));

    this.part = new Tone.Part<ScheduledNote>((time, ev) => {
      if (!this.audible || !this.voice) return; // instrument not ready yet → stay silent
      // drums hit together; only strings get strummed
      const strumIndex = this.instrument === "drums" ? 0 : ev.strumIndex;
      const { offset, velocity } = humanize(this.feel, { ...ev, strumIndex }, PPQ, Math.random);
      // Duration in ticks so it stretches with the transport tempo.
      this.voice.attackRelease(ev.pitch, `${ev.durationTicks}i`, Math.max(Tone.now(), time + offset), velocity);
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
    if (!audible) this.releaseAll();
  }

  releaseAll() {
    this.voice?.releaseAll();
    this.vocalVoice?.releaseAll();
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
    this.disposed = true;
    this.part?.dispose();
    this.vocalPart?.dispose();
    this.vocalVoice?.dispose();
    this.voice?.dispose();
    this.liveVoice?.dispose();
    this.channel.dispose();
    this.liveChannel.dispose();
  }
}
