import * as Tone from "tone";
import { drumSampleNote, drumVoiceFor, tomFrequency, type DrumVoice } from "@/lib/drums";
import type { InstrumentId } from "@/types/audio";
import type { KeysPatch } from "./keysPatches";
import { SYNTH_TRIM_DB } from "./audioConfig";
import { MUGI_PIANO, renderFmPiano } from "./fmPiano";
import { renderPluck, type PluckPatch } from "./karplus";

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
    maxVoices = 48,
  ) {
    this.output = new Tone.Gain(Tone.dbToGain(trimDb));
    // dense imported parts with long releases need more than Tone's default 32 voices
    // (the bass body); anything wider should be a rendered Sampler instead
    if (source instanceof Tone.PolySynth) source.maxPolyphony = maxVoices;
    source.chain(...chain, this.output);
    this.nodes = [source, ...chain, this.output];
  }

  /**
   * A PolySynth at its voice cap would drop the note anyway, but with a console warning
   * per note; in a dense part that's hundreds a second, which itself slows the page.
   * Skip the note quietly instead (same sound).
   */
  private full() {
    return this.source instanceof Tone.PolySynth && this.source.activeVoices >= this.source.maxPolyphony;
  }
  attack(pitch: number, time: number, velocity: number) {
    if (this.full()) return;
    this.source.triggerAttack(hz(pitch), time, velocity);
  }
  release(pitch: number, time: number) {
    this.source.triggerRelease(hz(pitch), time);
  }
  attackRelease(pitch: number, duration: Tone.Unit.Time, time: number, velocity: number) {
    if (this.full()) return;
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
  // the beater hitting the kick head: a very short, bright tick on top of the boom
  private readonly kickClick = new Tone.NoiseSynth({
    noise: { type: "white" },
    envelope: { attack: 0.001, decay: 0.012, sustain: 0, release: 0.01 },
  });
  private readonly clickFilter = new Tone.Filter(2500, "highpass");
  private readonly lastStart = new Map<object, number>();

  constructor() {
    this.output = new Tone.Gain(Tone.dbToGain(SYNTH_TRIM_DB.drums));
    this.kick.connect(this.output);
    this.kickClick.chain(this.clickFilter, this.output);
    this.kickClick.volume.value = -16;
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
        this.kickClick.triggerAttackRelease("32n", this.at(this.kickClick, time), velocity);
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
    [this.kick, this.kickClick, this.clickFilter, this.tom, this.snare, this.snareBody, this.hat, this.cymbal, this.snareFilter, this.output].forEach(
      (n) => n.dispose(),
    );
  }
}

/** Several voices played as one (a pick transient under a bass body, piano over strings). */
class LayeredVoice implements Voice {
  readonly output: Tone.Gain;
  private readonly nodes: Tone.ToneAudioNode[];

  constructor(
    private readonly layers: Voice[],
    chain: Tone.ToneAudioNode[],
    trimDb: number,
  ) {
    this.output = new Tone.Gain(Tone.dbToGain(trimDb));
    const mix = new Tone.Gain(1);
    layers.forEach((l) => l.output.connect(mix));
    mix.chain(...chain, this.output);
    this.nodes = [mix, ...chain, this.output];
  }

  attack(pitch: number, time: number, velocity: number) {
    this.layers.forEach((l) => l.attack(pitch, time, velocity));
  }
  release(pitch: number, time: number) {
    this.layers.forEach((l) => l.release(pitch, time));
  }
  attackRelease(pitch: number, duration: Tone.Unit.Time, time: number, velocity: number) {
    this.layers.forEach((l) => l.attackRelease(pitch, duration, time, velocity));
  }
  releaseAll(time?: number) {
    this.layers.forEach((l) => l.releaseAll(time));
  }
  dispose() {
    this.layers.forEach((l) => l.dispose());
    this.nodes.forEach((n) => n.dispose());
  }
}

/**
 * Notes computed once in plain JS and played back by a Sampler. Live Tone synths cost
 * CPU for every sounding voice (PluckSynth even while silent), and a dense part overloads
 * the audio thread; a playing buffer costs almost nothing.
 */
export interface RenderedSet {
  /** one note at `frequency` as raw samples */
  render: (frequency: number, sampleRate: number) => Float32Array;
  /** MIDI range to cover, one sample every `step` semitones (the Sampler fills the gaps) */
  low: number;
  high: number;
  step: number;
  /** fade on note-off, seconds */
  release: number;
}

const pluck = (patch: PluckPatch) => (frequency: number, sampleRate: number) => renderPluck(frequency, sampleRate, patch);

/** SampleManager renders these when the instrument is first needed and passes them to createSynthVoice. */
export const RENDERED_SETS: Partial<Record<InstrumentId, RenderedSet>> = {
  // Les Paul: long sustain, warm pick
  "lead-guitar": { render: pluck({ t60: 3.2, brightness: 0.55, seconds: 3.5 }), low: 40, high: 88, step: 3, release: 0.35 },
  // Mustang: brighter attack, shorter ring for chords
  "rhythm-guitar": { render: pluck({ t60: 1.6, brightness: 0.75, seconds: 2.2 }), low: 40, high: 79, step: 3, release: 0.12 },
  // the finger on the Jazz Bass string (layered under the synth body)
  bass: { render: pluck({ t60: 1.2, brightness: 0.35, seconds: 1.6 }), low: 28, high: 60, step: 3, release: 0.12 },
  // Mugi's FM piano
  keys: { render: (f, sr) => renderFmPiano(f, sr, MUGI_PIANO), low: 33, high: 100, step: 3, release: 0.6 },
};

/** Only plays sequenced notes held at least `minSeconds`; a pad that swells under chords, not runs. */
class HeldNotesOnly implements Voice {
  readonly output: Tone.ToneAudioNode;

  constructor(
    private readonly voice: Voice,
    private readonly minSeconds: number,
  ) {
    this.output = voice.output;
  }

  attack() {
    /* live playing stays a clean piano */
  }
  release() {
    /* nothing was started live */
  }
  attackRelease(pitch: number, duration: Tone.Unit.Time, time: number, velocity: number) {
    if (Tone.Time(duration).toSeconds() >= this.minSeconds) this.voice.attackRelease(pitch, duration, time, velocity);
  }
  releaseAll(time?: number) {
    this.voice.releaseAll(time);
  }
  dispose() {
    this.voice.dispose();
  }
}

/** One plain sawtooth per note, at most 32 at once: cheap enough to sit under any part. */
function stringPad() {
  const pad = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: "sawtooth" },
    envelope: { attack: 0.35, decay: 0.2, sustain: 0.8, release: 0.7 },
  });
  return pad;
}

/** A guitar amp in miniature: input cut, drive, tone stack, speaker cabinet, a little room. */
function guitarAmp(opts: { lowCut: number; drive: number; eq: { low?: number; mid?: number; high?: number }; cabinet: number; room: number }) {
  return [
    new Tone.Filter(opts.lowCut, "highpass"),
    new Tone.Distortion({ distortion: opts.drive, oversample: "4x" }),
    new Tone.EQ3({ lowFrequency: 250, highFrequency: 2600, ...opts.eq }),
    new Tone.Filter({ frequency: opts.cabinet, type: "lowpass", rolloff: -24 }),
    new Tone.Reverb({ decay: 1.4, wet: opts.room }),
  ];
}

/**
 * Each instrument is voiced after the gear its band member is known for:
 *   lead guitar   Yui's Gibson Les Paul: humbucker crunch, long sustain, warm mids
 *   rhythm guitar Azusa's Fender Mustang: brighter single coils, lighter drive, tight decay
 *   bass          Mio's Fender Jazz Bass, fingerstyle: round body with a soft finger pluck
 *   keys          Mugi's Korg workstation: an FM piano with a string pad under held chords
 *   drums         Ritsu's kit: punchy kick with beater click, bright crash
 */
export function createSynthVoice(instrument: InstrumentId, rendered?: Record<string, Tone.ToneAudioBuffer>): Voice {
  const trim = SYNTH_TRIM_DB[instrument];
  const sampled = () => {
    const set = RENDERED_SETS[instrument];
    if (!set || !rendered) throw new Error(`${instrument} needs its notes rendered first`);
    return new Tone.Sampler({ urls: rendered, release: set.release });
  };
  switch (instrument) {
    case "lead-guitar":
      return new MelodicVoice(
        sampled(),
        guitarAmp({ lowCut: 90, drive: 0.6, eq: { low: 2, mid: 3, high: -2 }, cabinet: 4800, room: 0.14 }),
        trim,
      );
    case "rhythm-guitar":
      return new MelodicVoice(
        sampled(),
        guitarAmp({ lowCut: 120, drive: 0.32, eq: { low: -1, mid: 1, high: 1.5 }, cabinet: 6200, room: 0.09 }),
        trim,
      );
    case "bass":
      return new LayeredVoice(
        [
          new MelodicVoice(
            new Tone.PolySynth(Tone.MonoSynth, {
              oscillator: { type: "sawtooth" },
              filter: { Q: 1, type: "lowpass", rolloff: -24 },
              filterEnvelope: { attack: 0.002, decay: 0.25, sustain: 0.3, release: 0.2, baseFrequency: 140, octaves: 2.2 },
              envelope: { attack: 0.003, decay: 0.3, sustain: 0.75, release: 0.12 },
            }),
            [],
            0,
          ),
          // the finger plucking the string
          new MelodicVoice(sampled(), [], -9),
        ],
        [new Tone.Compressor({ threshold: -20, ratio: 4, attack: 0.005, release: 0.12 }), new Tone.EQ3({ low: 3, mid: 0, high: -4 })],
        trim,
      );
    case "keys":
      return new LayeredVoice(
        [
          new MelodicVoice(sampled(), [], 0),
          // soft string pad that swells in under held chords (not under fast runs)
          new HeldNotesOnly(new MelodicVoice(stringPad(), [new Tone.Filter(2400, "lowpass")], -13, 32), 0.3),
        ],
        [new Tone.Chorus(1.5, 2, 0.25).start(), new Tone.Reverb({ decay: 2.2, wet: 0.22 })],
        trim,
      );
    case "drums":
      return new SynthDrumKit();
  }
}

/**
 * Mugi's Triton workstation patches other than the recorded piano. Each is one small
 * PolySynth with a hard voice cap (see the CPU budget note in CLAUDE.md): a dense part
 * drops its oldest voices rather than overloading the audio thread.
 */
export function createKeysPatchVoice(patch: Exclude<KeysPatch, "piano">, trimDb: number): Voice {
  switch (patch) {
    case "strings":
      // string ensemble: one saw per voice (the chorus makes it wide, cheaper than detuned
      // stacks, so more voices fit), slow bow attack, medium release
      return new MelodicVoice(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "sawtooth" },
          envelope: { attack: 0.22, decay: 0.3, sustain: 0.85, release: 0.5 },
        }),
        [new Tone.Filter(3200, "lowpass"), new Tone.Chorus(0.8, 3.5, 0.5).start(), new Tone.Reverb({ decay: 2.6, wet: 0.3 })],
        trimDb,
        40,
      );
    case "synth":
      // bright analog-style lead: saws with a filter that opens on each note
      return new MelodicVoice(
        new Tone.PolySynth(Tone.MonoSynth, {
          oscillator: { type: "sawtooth" },
          filter: { type: "lowpass", Q: 2, rolloff: -24 },
          filterEnvelope: { attack: 0.005, decay: 0.35, sustain: 0.45, release: 0.3, baseFrequency: 600, octaves: 3 },
          envelope: { attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.2 },
        }),
        [new Tone.Chorus(2, 2, 0.2).start(), new Tone.FeedbackDelay({ delayTime: "8n", feedback: 0.2, wet: 0.12 }), new Tone.Reverb({ decay: 1.6, wet: 0.15 })],
        trimDb,
        24,
      );
    case "organ":
      // drawbar organ (16', 8', 4', 2 2/3' and 2' pulled out) with a slow rotary wobble
      return new MelodicVoice(
        new Tone.PolySynth(Tone.Synth, {
          oscillator: { type: "custom", partials: [0.7, 1, 0, 0.6, 0, 0.4, 0, 0.3] },
          envelope: { attack: 0.004, decay: 0.05, sustain: 1, release: 0.08 },
        }),
        [new Tone.Vibrato(5.5, 0.08), new Tone.Chorus(0.9, 2.5, 0.3).start(), new Tone.Reverb({ decay: 1.4, wet: 0.15 })],
        trimDb,
        40,
      );
  }
}

/**
 * The recorded kit: one sample per piece, and every drum note of the part goes to the
 * right piece (drumSampleNote) instead of the Sampler repitching a neighbour. Hits ring
 * out on their own; a closed hi-hat chokes a ringing open one, like a real hat pedal.
 */
class SampledDrumKit implements Voice {
  readonly output: Tone.Gain;

  constructor(
    private readonly sampler: Tone.Sampler,
    trimDb: number,
  ) {
    this.output = new Tone.Gain(Tone.dbToGain(trimDb));
    sampler.connect(this.output);
  }

  private hit(pitch: number, time: number, velocity: number) {
    const note = drumSampleNote(pitch);
    if (note === 42) this.sampler.triggerRelease(hz(46), time);
    this.sampler.triggerAttack(hz(note), time, velocity);
  }
  attack(pitch: number, time: number, velocity: number) {
    this.hit(pitch, time, velocity);
  }
  release() {
    /* drums are one-shots */
  }
  attackRelease(pitch: number, _duration: Tone.Unit.Time, time: number, velocity: number) {
    this.hit(pitch, time, velocity);
  }
  releaseAll(time?: number) {
    this.sampler.releaseAll(time);
  }
  dispose() {
    this.sampler.dispose();
    this.output.dispose();
  }
}

/**
 * A recorded instrument with two velocity layers: quiet notes play the soft-hammer
 * recordings, the rest the hard ones. Both are normalised to the same peak, so the
 * velocity alone sets the level and crossing the split only changes the tone.
 */
class VelocityLayers implements Voice {
  readonly output: Tone.Gain;
  private readonly nodes: Tone.ToneAudioNode[];

  constructor(
    private readonly hard: Tone.Sampler,
    private readonly soft: Tone.Sampler,
    private readonly below: number,
    chain: Tone.ToneAudioNode[],
    trimDb: number,
  ) {
    this.output = new Tone.Gain(Tone.dbToGain(trimDb));
    const mix = new Tone.Gain(1);
    hard.connect(mix);
    soft.connect(mix);
    mix.chain(...chain, this.output);
    this.nodes = [hard, soft, mix, ...chain, this.output];
  }

  private layer(velocity: number) {
    return velocity < this.below ? this.soft : this.hard;
  }
  attack(pitch: number, time: number, velocity: number) {
    this.layer(velocity).triggerAttack(hz(pitch), time, velocity);
  }
  release(pitch: number, time: number) {
    // whichever layer started it; releasing a note that isn't sounding is a no-op
    this.hard.triggerRelease(hz(pitch), time);
    this.soft.triggerRelease(hz(pitch), time);
  }
  attackRelease(pitch: number, duration: Tone.Unit.Time, time: number, velocity: number) {
    this.layer(velocity).triggerAttackRelease(hz(pitch), duration, time, velocity);
  }
  releaseAll(time?: number) {
    this.hard.releaseAll(time);
    this.soft.releaseAll(time);
  }
  dispose() {
    this.nodes.forEach((n) => n.dispose());
  }
}

/**
 * Voices for the recorded packs (SAMPLE_PACKS). Same member voicing as the synths:
 * the guitars still go through Yui's and Azusa's amps (the recordings are clean
 * hollow-bodies) and the bass gets the same compression. The bass needs no synth body
 * and the piano no string pad: the recordings have their own body and sustain, and a
 * sawtooth pad droned audibly under long held piano notes.
 */
export function createPackVoice(
  instrument: InstrumentId,
  sampler: Tone.Sampler,
  trimDb: number,
  soft?: { sampler: Tone.Sampler; below: number },
): Voice {
  switch (instrument) {
    case "lead-guitar":
      // Les Paul into a cranked amp: humbucker crunch, thick low mids, rolled-off top
      return new MelodicVoice(
        sampler,
        guitarAmp({ lowCut: 85, drive: 0.55, eq: { low: 2, mid: 3, high: -1.5 }, cabinet: 5000, room: 0.14 }),
        trimDb,
      );
    case "rhythm-guitar":
      // Mustang single coils: brighter and glassier, lighter drive, less low end
      return new MelodicVoice(
        sampler,
        guitarAmp({ lowCut: 130, drive: 0.22, eq: { low: -2, mid: 0, high: 2.5 }, cabinet: 7500, room: 0.1 }),
        trimDb,
      );
    case "bass":
      return new MelodicVoice(
        sampler,
        [new Tone.Compressor({ threshold: -20, ratio: 4, attack: 0.005, release: 0.12 }), new Tone.EQ3({ low: 2, mid: 0, high: -2 })],
        trimDb,
      );
    case "keys": {
      const room = new Tone.Reverb({ decay: 2.2, wet: 0.2 });
      return soft
        ? new VelocityLayers(sampler, soft.sampler, soft.below, [room], trimDb)
        : new MelodicVoice(sampler, [room], trimDb);
    }
    case "drums":
      return new SampledDrumKit(sampler, trimDb);
  }
}
