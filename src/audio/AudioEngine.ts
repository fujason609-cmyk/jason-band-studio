import * as Tone from "tone";
import type { MemberId } from "@/features/band/types";
import type { FeelSetting } from "@/lib/feel";
import type { PlayStyle } from "@/lib/playStyle";
import type { KeysPatch } from "./keysPatches";
import { audibleMap, gainToDb } from "@/lib/mix";
import { clampBpm } from "@/lib/time";
import type { InstrumentId, InstrumentLoadState, TransportStatus } from "@/types/audio";
import type { StudioProject } from "@/types/project";
import { LOOK_AHEAD } from "./audioConfig";
import { AudioTrack } from "./AudioTrack";
import { SampleManager } from "./SampleManager";
import { TransportController } from "./TransportController";

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
  private readonly tracks = new Map<MemberId, AudioTrack>();
  private readonly samples = new SampleManager();
  private transport: TransportController | null = null;
  private started = false;
  private events: EngineEvents = {};
  private lastProject: StudioProject | null = null;
  private feel: FeelSetting = "character";
  private style: PlayStyle = "original";
  private capture: MediaStreamAudioDestinationNode | null = null;

  setEvents(events: EngineEvents) {
    this.events = events;
  }

  get isStarted() {
    return this.started;
  }

  /** Must run from a user gesture: browsers keep audio locked until then. */
  async start(): Promise<boolean> {
    if (this.started) return true;
    try {
      await Tone.start();
      Tone.getContext().lookAhead = LOOK_AHEAD;
      this.master = new Tone.Volume(0).toDestination();
      this.transport = new TransportController(
        () => {
          this.tracks.forEach((t) => t.releaseAll());
          this.events.onTransportEnd?.();
        },
        () => this.tracks.forEach((t) => t.releaseAll()),
      );
      this.samples.subscribe((instrument, state) => this.events.onInstrumentState?.(instrument, state));
      this.started = true;
      if (this.lastProject) this.sync(this.lastProject);
      return true;
    } catch (err) {
      this.events.onStartError?.(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  /** Bring the engine in line with a project snapshot. Cheap to call often. */
  sync(project: StudioProject) {
    this.lastProject = project;
    if (!this.started || !this.master || !this.transport) return;

    this.master.volume.value = gainToDb(project.masterVolume);
    this.transport.configure(project.baseBpm, project.durationSeconds);
    this.transport.setBpm(clampBpm(project.bpm));

    const audible = audibleMap(project.tracks);
    for (const track of project.tracks) {
      let audio = this.tracks.get(track.memberId);
      if (!audio) {
        audio = new AudioTrack(track.memberId, track.instrument, this.master, this.samples, this.feel, this.style);
        this.tracks.set(track.memberId, audio);
        this.loadInstrument(audio, track.instrument);
      } else if (audio.currentInstrument !== track.instrument) {
        this.loadInstrument(audio, track.instrument);
      }
      audio.setNotes(track.notes, project.baseBpm, project.beatsPerBar);
      audio.setVolume(track.volume);
      audio.setAudible(audible[track.id] ?? true);
    }
  }

  private loadInstrument(audio: AudioTrack, instrument: InstrumentId) {
    audio.setInstrument(instrument).catch(() => {
      /* state already reported through onInstrumentState */
    });
  }

  retryInstrument(instrument: InstrumentId) {
    this.tracks.forEach((t) => {
      if (t.currentInstrument === instrument) this.loadInstrument(t, instrument);
    });
  }

  get status(): TransportStatus {
    return this.transport?.status ?? "stopped";
  }

  play() {
    this.transport?.play();
  }
  pause() {
    this.transport?.pause();
  }
  stop() {
    this.transport?.stop();
  }
  seek(songSeconds: number) {
    this.transport?.seek(songSeconds);
  }
  /** Mugi's Triton sound. Works before start(); rebuilds the voices of every keys track. */
  setKeysPatch(patch: KeysPatch) {
    if (this.samples.keysPatch === patch) return;
    this.samples.keysPatch = patch;
    this.retryInstrument("keys");
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
    this.retryInstrument("lead-guitar");
    this.retryInstrument("rhythm-guitar");
  }

  setLoop(loop: boolean) {
    this.transport?.setLoop(loop);
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
    this.capture ??= Tone.getContext().createMediaStreamDestination();
    this.master.connect(this.capture);
    return this.capture.stream;
  }
  stopAudioCapture() {
    if (!this.capture) return;
    this.master?.disconnect(this.capture);
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
    this.tracks.forEach((t) => t.dispose());
    this.tracks.clear();
    this.samples.dispose();
    this.master?.dispose();
    this.master = null;
    this.transport = null;
    this.started = false;
  }
}

/** One engine per page. */
export const audioEngine = new AudioEngine();
