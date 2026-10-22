import * as Tone from "tone";
import type { MemberId } from "@/features/band/types";
import { DEFAULT_VOCALS, DEFAULT_VOCAL_SOUNDS, vocalRoleOf, type VocalSounds, type VocalSwitches } from "@/features/band/vocals";
import type { FeelSetting } from "@/lib/feel";
import { playedBars, type BandContext, type PlayStyle } from "@/lib/playStyle";
import type { KeysPatch } from "./keysPatches";
import { audibleMap, gainToDb } from "@/lib/mix";
import { clampBpm, secondsToTicks } from "@/lib/time";
import type { InstrumentId, InstrumentLoadState, TransportStatus } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";
import type { StudioProject } from "@/types/project";
import { LOOK_AHEAD, PPQ, RECORD_CEILING_DB, RECORD_GAIN_DB, ROOM_BUS } from "./audioConfig";
import { AudioTrack } from "./AudioTrack";
import { Metronome } from "./Metronome";
import { SampleManager } from "./SampleManager";
import { TransportController } from "./TransportController";

/** Shared "nothing to sing", so tracks without vocals keep the same array reference. */
const NO_VOCAL: readonly NoteEvent[] = [];

export interface EngineEvents {
  onInstrumentState?: (instrument: InstrumentId, state: InstrumentLoadState) => void;
  onTransportEnd?: () => void;
  /** audio couldn't be unlocked; `detail` is the browser's reason */
  onStartError?: (detail: string) => void;
}

/**
 * Owns everything that makes sound. React never touches Tone directly: it hands
 * the engine a project snapshot via `sync()` and calls transport / live methods.
 */
export class AudioEngine {
  private master: Tone.Volume | null = null;
  private bus: Tone.Gain | null = null;
  private glue: Tone.Compressor | null = null;
  private room: Tone.Reverb | null = null;
  private roomReturn: Tone.Channel | null = null;
  private readonly tracks = new Map<MemberId, AudioTrack>();
  private readonly samples = new SampleManager();
  private transport: TransportController | null = null;
  private started = false;
  private starting: Promise<boolean> | null = null;
  private events: EngineEvents = {};
  private lastProject: StudioProject | null = null;
  /** song seconds where the written song ends (the solo round after it), Infinity without one */
  private songEnd = Infinity;
  private feel: FeelSetting = "character";
  private style: PlayStyle = "original";
  private autoDrums = true;
  private countIn = false;
  private metronomeOn = false;
  private metronome: Metronome | null = null;
  private vocals: VocalSwitches = DEFAULT_VOCALS;
  private vocalSounds: VocalSounds = DEFAULT_VOCAL_SOUNDS;
  private band: { sources: readonly (readonly NoteEvent[])[]; key: string; value: BandContext } | null = null;
  private capture: { destination: MediaStreamAudioDestinationNode; nodes: Tone.ToneAudioNode[] } | null = null;

  setEvents(events: EngineEvents) {
    this.events = events;
  }

  get isStarted() {
    return this.started;
  }

  /**
   * Must run from a user gesture: browsers keep audio locked until then. Calls made while
   * it is starting share the same start (a first chord strum calls it once per string),
   * so the audio graph is only ever built once.
   */
  start(): Promise<boolean> {
    this.starting ??= this.startOnce().then((ok) => {
      if (!ok) this.starting = null; // let the next gesture try again
      return ok;
    });
    return this.starting;
  }

  private async startOnce(): Promise<boolean> {
    if (this.started) return true;
    try {
      await Tone.start();
      Tone.getContext().lookAhead = LOOK_AHEAD;
      this.master = new Tone.Volume(0).toDestination();
      // the band bus: every track and the shared room, gently glued by one compressor
      // (a couple of dB on the loudest hits, so the parts move together), then the master
      this.glue = new Tone.Compressor({ threshold: -18, ratio: 2, knee: 8, attack: 0.02, release: 0.25 });
      this.bus = new Tone.Gain(1).chain(this.glue, this.master);
      this.room = new Tone.Reverb({ decay: 1.6, preDelay: 0.012, wet: 1 });
      this.roomReturn = new Tone.Channel().receive(ROOM_BUS).chain(this.room, this.bus);
      this.transport = new TransportController(
        () => {
          this.tracks.forEach((t) => t.releaseAll());
          this.events.onTransportEnd?.();
        },
        () => this.tracks.forEach((t) => t.releaseAll()),
      );
      this.metronome = new Metronome();
      this.metronome.enabled = this.metronomeOn;
      this.samples.subscribe((instrument, state) => this.events.onInstrumentState?.(instrument, state));
      this.started = true;
      if (this.lastProject) this.sync(this.lastProject, this.songEnd);
      return true;
    } catch (err) {
      this.events.onStartError?.(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /**
   * Bring the engine in line with a project snapshot. Cheap to call often. `songEnd` is
   * where the written song ends when a solo round is appended (generated drums only fill
   * the song, and only when the song itself has no drums).
   */
  sync(project: StudioProject, songEnd = Infinity) {
    this.lastProject = project;
    this.songEnd = songEnd;
    if (!this.started || !this.master || !this.transport) return;

    this.master.volume.value = gainToDb(project.masterVolume);
    this.transport.configure(project.baseBpm, project.durationSeconds);
    this.transport.setBpm(clampBpm(project.bpm));

    if (this.metronome) this.metronome.beatsPerBar = project.beatsPerBar;
    const band = this.bandContext(project);
    const audible = audibleMap(project.tracks);
    for (const track of project.tracks) {
      let audio = this.tracks.get(track.memberId);
      if (!audio) {
        audio = new AudioTrack(track.memberId, track.instrument, this.bus!, this.samples, this.feel, this.style);
        this.tracks.set(track.memberId, audio);
        this.loadInstrument(audio, track.instrument);
      } else if (audio.currentInstrument !== track.instrument) {
        this.loadInstrument(audio, track.instrument);
      }
      audio.setNotes(track.notes, project.baseBpm, project.beatsPerBar);
      audio.setBand(band);
      const role = vocalRoleOf(track.memberId);
      // the sound first, so a part played on an instrument never renders the singer first
      if (role) audio.setVocalSound(this.vocalSounds[role]);
      audio.setVocal(track.vocal ?? NO_VOCAL, role);
      if (role) audio.setSinging(this.vocals[role]);
      audio.setMix(track.volume, audible[track.id] ?? true);
    }
  }

  /** Where the non-drum parts play, for generated drums. Same object while nothing changed. */
  private bandContext(project: StudioProject): BandContext {
    const sources = project.tracks.filter((t) => t.instrument !== "drums").map((t) => t.notes);
    const key = `${this.autoDrums}|${project.baseBpm}|${project.beatsPerBar}|${this.songEnd}`;
    const songEndTicks = Number.isFinite(this.songEnd) ? secondsToTicks(this.songEnd, project.baseBpm, PPQ) : Infinity;
    const memo = this.band;
    if (memo && memo.key === key && memo.sources.length === sources.length && memo.sources.every((n, i) => n === sources[i])) {
      return memo.value;
    }
    const ticks = function* () {
      for (const notes of sources) {
        for (const n of notes) {
          yield { ticks: secondsToTicks(n.start, project.baseBpm, PPQ), durationTicks: secondsToTicks(n.duration, project.baseBpm, PPQ) };
        }
      }
    };
    const value: BandContext = {
      autoDrums: this.autoDrums,
      playedBars: this.autoDrums
        ? playedBars(ticks(), PPQ * project.beatsPerBar).filter((bar) => bar * PPQ * project.beatsPerBar < songEndTicks)
        : [],
      songEndTicks,
    };
    this.band = { sources, key, value };
    return value;
  }

  private loadInstrument(audio: AudioTrack, instrument: InstrumentId, retry = false) {
    audio.setInstrument(instrument, retry).catch(() => {
      /* state already reported through onInstrumentState */
    });
  }

  /** The mixer's Retry: download a pack that failed again. */
  retryInstrument(instrument: InstrumentId) {
    this.tracks.forEach((t) => {
      if (t.currentInstrument === instrument) this.loadInstrument(t, instrument, true);
    });
  }

  /** New voices for every track playing `instrument` (a style or patch change); a failed pack isn't fetched again. */
  private rebuildInstrument(instrument: InstrumentId) {
    this.tracks.forEach((t) => {
      if (t.currentInstrument === instrument) this.loadInstrument(t, instrument);
    });
  }

  get status(): TransportStatus {
    return this.transport?.status ?? "stopped";
  }

  /** Play, after one bar of count-in clicks when that's switched on. */
  play() {
    // already playing, or counting in (a second tap while audio was starting would
    // otherwise start the music at once, over the count-in clicks)
    if (!this.transport || this.transport.status === "playing") return;
    if (!this.countIn || !this.metronome) {
      this.transport.play();
      return;
    }
    const secondsPerBeat = 60 / Tone.getTransport().bpm.value;
    const beats = this.lastProject?.beatsPerBar ?? 4;
    this.transport.play(this.metronome.countIn(Tone.now() + 0.05, beats, secondsPerBeat));
  }
  pause() {
    this.metronome?.cancelCountIn();
    this.transport?.pause();
  }
  stop() {
    this.metronome?.cancelCountIn();
    this.transport?.stop();
  }
  seek(songSeconds: number) {
    this.transport?.seek(songSeconds);
  }
  /** Mugi's Triton sound. Works before start(); rebuilds the voices of every keys track. */
  setKeysPatch(patch: KeysPatch) {
    if (this.samples.keysPatch === patch) return;
    this.samples.keysPatch = patch;
    this.rebuildInstrument("keys");
  }

  /** Members' playing personality, or strictly on the grid. Applies from the next note. */
  setFeel(feel: FeelSetting) {
    this.feel = feel;
    this.tracks.forEach((t) => t.setFeel(feel));
  }

  /**
   * The genre the band plays the score in. Works before start(): rearranges every part
   * and rebuilds the guitars, whose amps are set per style.
   */
  setStyle(style: PlayStyle) {
    if (style === this.style) return;
    this.style = style;
    this.samples.style = style;
    this.tracks.forEach((t) => t.setStyle(style));
    this.rebuildInstrument("lead-guitar");
    this.rebuildInstrument("rhythm-guitar");
    this.tracks.forEach((t) => t.refreshVocalGuitar()); // a vocal played on the guitar, too
  }

  /** Yui's lead vocal and Mio's harmony switched on or off. Works before start(). */
  setVocals(vocals: VocalSwitches) {
    this.vocals = vocals;
    this.tracks.forEach((track, member) => {
      const role = vocalRoleOf(member);
      if (role) track.setSinging(vocals[role]);
    });
  }

  /** What plays Yui's and Mio's vocal parts: the singer, or an instrument taking the tune. */
  setVocalSounds(sounds: VocalSounds) {
    this.vocalSounds = sounds;
    this.tracks.forEach((track, member) => {
      const role = vocalRoleOf(member);
      if (role) track.setVocalSound(sounds[role]);
    });
  }

  /** Generated drums for drumless scores in rock and punk. */
  setAutoDrums(on: boolean) {
    if (on === this.autoDrums) return;
    this.autoDrums = on;
    if (this.lastProject) this.sync(this.lastProject, this.songEnd);
  }

  /** One bar of clicks before playback starts. */
  setCountIn(on: boolean) {
    this.countIn = on;
  }

  /** A click on every beat while playing (not recorded into videos). */
  setMetronome(on: boolean) {
    this.metronomeOn = on;
    if (this.metronome) this.metronome.enabled = on;
  }

  setLoop(loop: boolean) {
    this.transport?.setLoop(loop);
  }
  /** Loop just this stretch (song seconds), or the whole song again with null. */
  setLoopRange(range: { start: number; end: number } | null) {
    this.transport?.setLoopRange(range);
  }
  getPosition(): number {
    return this.transport?.getPosition() ?? 0;
  }
  /** Position of the sound being heard now (behind getPosition by the look-ahead). For recordings. */
  getAudiblePosition(): number {
    return this.transport?.getAudiblePosition() ?? 0;
  }

  /**
   * A live stream of the band's master output, and nothing else (no microphone, no other
   * tabs), for recording a video. Call stopAudioCapture() when done.
   */
  captureAudio(): MediaStream | null {
    if (!this.master) return null;
    if (!this.capture) {
      // Reels loudness: the band comes out around -17.5 LUFS (measured, EBU R128), quieter
      // than the -14 most Reels are mastered to, and Instagram turns loud videos down but
      // not quiet ones up. Brought up by RECORD_GAIN_DB, peaks held under -1 dB; only the
      // recording, never what plays in the room.
      const destination = Tone.getContext().createMediaStreamDestination();
      const makeup = new Tone.Gain(Tone.dbToGain(RECORD_GAIN_DB));
      // a soft clipper, not Tone.Limiter: the browser's compressor behind it has a 30 dB knee
      // and its own makeup gain, so peaks went past the ceiling (measured +0.2 dBFS)
      const ceiling = Tone.dbToGain(RECORD_CEILING_DB);
      const knee = ceiling * 0.7;
      const limiter = new Tone.WaveShaper((x) => {
        const a = Math.abs(x);
        return a <= knee ? x : Math.sign(x) * (knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee)));
      }, 4096);
      limiter.oversample = "4x";
      this.master.connect(makeup);
      makeup.connect(limiter);
      limiter.connect(destination);
      this.capture = { destination, nodes: [makeup, limiter] };
    }
    return this.capture.destination.stream;
  }
  stopAudioCapture() {
    if (!this.capture) return;
    this.capture.nodes.forEach((n) => n.dispose());
    this.capture = null;
  }

  noteOn(member: MemberId, pitch: number, velocity = 0.85) {
    this.tracks.get(member)?.liveAttack(pitch, velocity);
  }
  noteOff(member: MemberId, pitch: number) {
    this.tracks.get(member)?.liveRelease(pitch);
  }
  allNotesOff(member?: MemberId) {
    if (member) this.tracks.get(member)?.liveReleaseAll();
    else this.tracks.forEach((t) => t.liveReleaseAll());
  }

  dispose() {
    this.transport?.dispose();
    this.metronome?.dispose();
    this.metronome = null;
    this.tracks.forEach((t) => t.dispose());
    this.tracks.clear();
    this.samples.dispose();
    for (const node of [this.roomReturn, this.room, this.bus, this.glue]) node?.dispose();
    this.roomReturn = this.room = this.bus = this.glue = null;
    this.master?.dispose();
    this.master = null;
    this.transport = null;
    this.started = false;
    this.starting = null;
  }
}

/** One engine per page. */
export const audioEngine = new AudioEngine();
