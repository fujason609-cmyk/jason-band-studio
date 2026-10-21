import * as Tone from "tone";
import { getMember } from "@/features/band/members";
import type { MemberId } from "@/features/band/types";
import { FEEL_PROFILES, capStrums, humanize, profileFor, strumOffsets, type FeelProfile, type FeelSetting } from "@/lib/feel";
import { gainToDb } from "@/lib/mix";
import { breathTimes, fitToVoice, type VocalRole, type VocalSound } from "@/features/band/vocals";
import { NO_BAND, arrange, arrangeVocal, type BandContext, type PlayStyle, type StyledNote } from "@/lib/playStyle";
import { secondsToTicks } from "@/lib/time";
import type { InstrumentId } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";
import { PPQ, ROOM_BUS, ROOM_SEND_DB } from "./audioConfig";
import type { SampleManager } from "./SampleManager";
import { createSinger } from "./vocalSounds";
import type { SingingVoice, Voice } from "./voices";

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

/**
 * The time to start a note at: as scheduled, unless that is already past. Compare with
 * the audio clock itself, not Tone.now(): Tone.now() is the clock plus the look-ahead,
 * which is exactly where the Part's scheduling window ends, so clamping to it pushed every
 * note to the end of its 50 ms window. Notes landed up to 50 ms late and the ones in one
 * window fired together: no strums, no feel, the band out of step with itself.
 */
function notBefore(time: number): number {
  return Math.max(Tone.getContext().currentTime, time);
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
  private readonly liveChannel: Tone.Channel;
  /** the singing stays centred, however the member's instrument is panned */
  private readonly vocalChannel: Tone.Channel;
  private voice: Voice | null = null;
  private liveVoice: Voice | null = null;
  private part: Tone.Part<ScheduledNote> | null = null;
  private notesRef: readonly NoteEvent[] | null = null;
  private baseBpm = 120;
  private beatsPerBar = 4;
  private band: BandContext = NO_BAND;
  private audible = true;
  private instrument: InstrumentId;
  private feel: FeelProfile;
  private vocalVoice: SingingVoice | null = null;
  private vocalPart: Tone.Part<ScheduledNote> | null = null;
  private vocalRef: readonly NoteEvent[] = [];
  private vocalRole: VocalRole | null = null;
  /** what plays the vocal part: the singer or an instrument (settings.vocalSounds) */
  private vocalSound: VocalSound = "voice";
  /** counts vocal-voice builds, so only the latest one is kept */
  private vocalRequest = 0;
  private singing = true;
  private disposed = false;
  /** counts setInstrument calls, so a slower, older one doesn't build voices too */
  private voiceRequest = 0;

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
    const pan = getMember(member).pan;
    this.channel = new Tone.Channel({ volume: 0, pan }).connect(master);
    this.liveChannel = new Tone.Channel({ volume: 0, pan }).connect(master);
    this.vocalChannel = new Tone.Channel({ volume: 0, pan: 0 }).connect(master);
    for (const c of [this.channel, this.liveChannel, this.vocalChannel]) c.send(ROOM_BUS, ROOM_SEND_DB);
  }

  get currentInstrument() {
    return this.instrument;
  }

  /** Rebuild voices once the instrument's source is loaded. */
  async setInstrument(instrument: InstrumentId, retry = false) {
    const changed = instrument !== this.instrument;
    this.instrument = instrument;
    if (changed) this.schedule(); // the style arranges each instrument differently
    this.voice?.dispose();
    this.liveVoice?.dispose();
    this.voice = null;
    this.liveVoice = null;
    // only the latest call builds voices: two calls for the same instrument (a style or
    // keys-patch change, or Retry, while the pack is still loading) would otherwise both
    // build them, and the first pair would keep running, connected and never freed
    const request = ++this.voiceRequest;
    // Mugi's synthesized patches need no recordings: don't wait for (or download) the piano
    if (instrument !== "keys" || this.samples.keysPatch === "piano") await this.samples.load(instrument, retry);
    if (request !== this.voiceRequest || this.disposed) return;
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
    const wasEmpty = this.vocalRef.length === 0;
    this.vocalRef = notes;
    this.vocalRole = role;
    if (notes.length > 0 && wasEmpty) this.buildVocalVoice();
    this.scheduleVocal();
  }

  /** Sing the vocal part, or play it on an instrument. Rebuilds the voice when it changes. */
  setVocalSound(sound: VocalSound) {
    if (sound === this.vocalSound) return;
    this.vocalSound = sound;
    this.buildVocalVoice();
  }

  /** Rebuild the vocal voice if it is the guitar, whose amp follows the playing style. */
  refreshVocalGuitar() {
    if (this.vocalSound === "guitar") this.buildVocalVoice();
  }

  /**
   * Build the voice for the vocal part in the current sound (the singer's notes are
   * rendered, or the instrument loaded, the first time; until then the part is silent).
   * Only the latest request is kept.
   */
  private buildVocalVoice() {
    this.vocalVoice?.dispose();
    this.vocalVoice = null;
    const role = this.vocalRole;
    if (!role || this.vocalRef.length === 0) return;
    const request = ++this.vocalRequest;
    void createSinger(role, this.vocalSound, this.samples).then((voice) => {
      if (request !== this.vocalRequest || this.disposed || this.vocalRef.length === 0) return voice.dispose();
      this.vocalVoice = voice;
      voice.output.connect(this.vocalChannel);
    });
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
      const { offset, velocity } = humanize(this.feel, ev, PPQ, Math.random, this.beatsPerBar);
      if (ev.breath) return this.vocalVoice.breathe(notBefore(time + offset), velocity);
      this.vocalVoice.attackRelease(ev.pitch, `${ev.durationTicks}i`, notBefore(time + offset), velocity);
    }, events);
    this.vocalPart.start(0);
  }

  /**
   * What the rest of the band plays (for generated drums). Pass the same object again
   * when nothing changed; only the drums re-schedule.
   */
  setBand(band: BandContext) {
    if (band === this.band) return;
    this.band = band;
    if (this.instrument === "drums") this.schedule();
  }

  private schedule() {
    this.part?.dispose();
    this.part = null;
    if (!this.notesRef) return;
    const written = toTicks(this.notesRef, this.baseBpm);
    const played = arrange(this.style, this.instrument, written, PPQ, this.beatsPerBar, this.band);
    // a strum takes at most a third of a sixteenth, so fast songs stay tight
    const maxRoll = (60 / this.baseBpm / 4) * 0.33;
    const strums = capStrums(played, strumOffsets(played, PPQ), FEEL_PROFILES[this.member].strumSeconds, maxRoll);
    const events: ScheduledNote[] = played.map((n, i) => ({ ...n, time: `${n.ticks}i`, strumIndex: strums[i]! }));

    this.part = new Tone.Part<ScheduledNote>((time, ev) => {
      if (!this.audible || !this.voice) return; // instrument not ready yet → stay silent
      // drums hit together; only strings get strummed
      // the cap above is at the song's tempo: played faster, a strum shrinks with the beat
      const faster = Math.min(1, this.baseBpm / Tone.getTransport().bpm.value);
      const strumIndex = this.instrument === "drums" ? 0 : ev.strumIndex * faster;
      const { offset, velocity } = humanize(this.feel, { ...ev, strumIndex }, PPQ, Math.random, this.beatsPerBar);
      // Duration in ticks so it stretches with the transport tempo.
      this.voice.attackRelease(ev.pitch, `${ev.durationTicks}i`, notBefore(time + offset), velocity);
    }, events);
    this.part.start(0);
  }

  /**
   * The fader, and the result of the mute / solo rules (`audible`); going silent also cuts
   * ringing notes. Both in one place: Tone's `mute` is just the volume at -Infinity, so
   * writing the fader on every sync would unmute a muted channel, and muting a fader at 0
   * (already -Infinity) would remember 0 dB to unmute to.
   */
  setMix(volume: number, audible: boolean) {
    const db = gainToDb(volume);
    const changed = audible !== this.audible;
    this.audible = audible;
    this.channel.volume.value = audible ? db : -Infinity;
    this.vocalChannel.volume.value = audible ? db : -Infinity;
    this.liveChannel.volume.value = db; // playing along ignores mute and solo
    if (changed && !audible) this.releaseAll();
  }

  releaseAll() {
    this.voice?.releaseAll();
    this.vocalVoice?.releaseAll();
  }

  liveAttack(pitch: number, velocity = 0.8) {
    // now, not Tone.now(): that is the look-ahead time, a tenth of a second late for a finger
    this.liveVoice?.attack(pitch, Tone.immediate(), velocity);
  }

  liveRelease(pitch: number) {
    this.liveVoice?.release(pitch, Tone.immediate());
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
    this.vocalChannel.dispose();
  }
}
