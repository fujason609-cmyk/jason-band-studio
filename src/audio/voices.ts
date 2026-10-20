import * as Tone from "tone";
import { drumVoiceFor, tomFrequency, type DrumVoice } from "@/lib/drums";
import type { InstrumentId } from "@/types/audio";
import { SYNTH_TRIM_DB } from "./audioConfig";

/** A playable sound source. Every instrument, synthesized or sampled, looks like this. */
export interface Voice {
  readonly output: Tone.ToneAudioNode;
  attack(pitch: number, time: number, velocity: number): void;
  release(pitch: number, time: number): void;
  /** `duration` may be seconds or a Tone time string such as "96i" */
  attackRelease(pitch: number, duration: Tone.Unit.Time, time: number, velocity: number): void;
  releaseAll(time?: number): void;
  dispose(): void;
}

const hz = (pitch: number) => Tone.Frequency(pitch, "midi").toFrequency();

/** Polyphonic melodic voice built around a PolySynth (or Sampler) plus an effects chain. */
class MelodicVoice implements Voice {
  readonly output: Tone.Gain;
  private readonly nodes: Tone.ToneAudioNode[];

  constructor(
    private readonly source: Tone.PolySynth | Tone.Sampler,
    chain: Tone.ToneAudioNode[],
    trimDb: number,
  ) {
    this.output = new Tone.Gain(Tone.dbToGain(trimDb));
    source.chain(...chain, this.output);
    this.nodes = [source, ...chain, this.output];
  }

  attack(pitch: number, time: number, velocity: number) {
    this.source.triggerAttack(hz(pitch), time, velocity);
  }
  release(pitch: number, time: number) {
    this.source.triggerRelease(hz(pitch), time);
  }
  attackRelease(pitch: number, duration: Tone.Unit.Time, time: number, velocity: number) {
    this.source.triggerAttackRelease(hz(pitch), duration, time, velocity);
  }
  releaseAll(time?: number) {
    this.source.releaseAll(time);
  }
  dispose() {
    this.nodes.forEach((n) => n.dispose());
  }
}

/** Five synthesized drums. Monophonic sources need strictly increasing start times. */
class SynthDrumKit implements Voice {
  readonly output: Tone.Gain;
  private readonly kick = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
  });
  private readonly tom = new Tone.MembraneSynth({
    pitchDecay: 0.08,
    octaves: 2.5,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.2 },
  });
  private readonly snare = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.05 },
  });
  private readonly snareBody = new Tone.MembraneSynth({
    pitchDecay: 0.02,
    octaves: 1.5,
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 },
  });
  private readonly hat = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 5000,
    octaves: 1.5,
  });
  private readonly cymbal = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 1.2, release: 0.6 },
    harmonicity: 5.1,
    modulationIndex: 40,
    resonance: 4200,
    octaves: 1.5,
  });
  private readonly snareFilter = new Tone.Filter(1800, "highpass");
  private readonly lastStart = new Map<object, number>();

  constructor() {
    this.output = new Tone.Gain(Tone.dbToGain(SYNTH_TRIM_DB.drums));
    this.kick.connect(this.output);
    this.tom.connect(this.output);
    this.snare.chain(this.snareFilter, this.output);
    this.snareBody.connect(this.output);
    this.hat.connect(this.output);
    this.cymbal.connect(this.output);
    this.hat.volume.value = -14;
    this.cymbal.volume.value = -18;
    this.snare.volume.value = -4;
    this.snareBody.volume.value = -10;
  }

  private at(source: object, time: number): number {
    // A late callback asks for a time already past; Tone would move it up to "now",
    // which can equal the previous hit's start. Clamp to now first, then step past the last start.
    const requested = Math.max(time, Tone.now());
    const last = this.lastStart.get(source) ?? -1;
    const safe = requested <= last ? last + 0.002 : requested;
    this.lastStart.set(source, safe);
    return safe;
  }

  private hit(voice: DrumVoice, pitch: number, time: number, velocity: number) {
    switch (voice) {
      case "kick":
        this.kick.triggerAttackRelease(48, "16n", this.at(this.kick, time), velocity);
        break;
      case "tom":
        this.tom.triggerAttackRelease(tomFrequency(pitch), "8n", this.at(this.tom, time), velocity);
        break;
      case "snare":
      case "clap":
        this.snare.triggerAttackRelease("16n", this.at(this.snare, time), velocity);
        this.snareBody.triggerAttackRelease(190, "32n", this.at(this.snareBody, time), velocity);
        break;
      case "closed-hat":
        this.hat.envelope.decay = 0.05;
        this.hat.triggerAttackRelease(320, "32n", this.at(this.hat, time), velocity);
        break;
      case "open-hat":
        this.hat.envelope.decay = 0.3;
        this.hat.triggerAttackRelease(320, "8n", this.at(this.hat, time), velocity);
        break;
      case "ride":
        this.cymbal.envelope.decay = 0.5;
        this.cymbal.triggerAttackRelease(440, "8n", this.at(this.cymbal, time), velocity * 0.7);
        break;
      case "crash":
        this.cymbal.envelope.decay = 1.4;
        this.cymbal.triggerAttackRelease(300, "2n", this.at(this.cymbal, time), velocity);
        break;
    }
  }

  attack(pitch: number, time: number, velocity: number) {
    this.hit(drumVoiceFor(pitch), pitch, time, velocity);
  }
  release() {
    /* drums are one-shots */
  }
  attackRelease(pitch: number, _duration: Tone.Unit.Time, time: number, velocity: number) {
    this.hit(drumVoiceFor(pitch), pitch, time, velocity);
  }
  releaseAll() {
    /* one-shots decay on their own; muting the channel silences them */
  }
  dispose() {
    [this.kick, this.tom, this.snare, this.snareBody, this.hat, this.cymbal, this.snareFilter, this.output].forEach(
      (n) => n.dispose(),
    );
  }
}

export function createSynthVoice(instrument: InstrumentId): Voice {
  const trim = SYNTH_TRIM_DB[instrument];
  switch (instrument) {
    case "lead-guitar":
      return new MelodicVoice(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "fatsawtooth", count: 3, spread: 18 },
          envelope: { attack: 0.004, decay: 0.25, sustain: 0.55, release: 0.35 },
        }),
        [new Tone.Distortion(0.35), new Tone.Filter(3400, "lowpass"), new Tone.Chorus(2, 2.5, 0.3).start()],
        trim,
      );
    case "rhythm-guitar":
      return new MelodicVoice(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "fatsquare", count: 2, spread: 12 },
          envelope: { attack: 0.003, decay: 0.12, sustain: 0.25, release: 0.12 },
        }),
        [new Tone.Distortion(0.55), new Tone.Filter(1900, "lowpass")],
        trim,
      );
    case "bass":
      return new MelodicVoice(
        new Tone.PolySynth(Tone.MonoSynth, {
          oscillator: { type: "sawtooth" },
          filter: { Q: 1.5, type: "lowpass", rolloff: -24 },
          filterEnvelope: { attack: 0.004, decay: 0.18, sustain: 0.35, release: 0.2, baseFrequency: 110, octaves: 2.6 },
          envelope: { attack: 0.004, decay: 0.2, sustain: 0.7, release: 0.15 },
        }),
        [],
        trim,
      );
    case "keys":
      return new MelodicVoice(
        new Tone.PolySynth(Tone.FMSynth, {
          harmonicity: 3,
          modulationIndex: 3.5,
          oscillator: { type: "sine" },
          modulation: { type: "sine" },
          envelope: { attack: 0.004, decay: 1.4, sustain: 0.25, release: 0.9 },
          modulationEnvelope: { attack: 0.002, decay: 0.4, sustain: 0.1, release: 0.5 },
        }),
        [new Tone.Reverb({ decay: 1.8, wet: 0.18 })],
        trim,
      );
    case "drums":
      return new SynthDrumKit();
  }
}

export function createSamplerVoice(sampler: Tone.Sampler, trimDb: number): Voice {
  return new MelodicVoice(sampler, [], trimDb);
}
