import * as Tone from "tone";
import type { VocalRole, VocalSound } from "@/features/band/vocals";
import { KEYS_PATCH_TRIM_DB, VOCAL_SOUND_GAIN_DB } from "./audioConfig";
import type { SampleManager } from "./SampleManager";
import { createKeysPatchVoice, createVocalVoice, type SingingVoice, type Voice } from "./voices";

/**
 * An instrument playing a vocal line: the instrument's own voice, brought up (or down) to
 * where a lead / harmony vocal sits in the mix (`VOCAL_SOUND_GAIN_DB`, measured), and no
 * in-breaths.
 */
class InstrumentSinger implements SingingVoice {
  readonly output: Tone.Gain;

  constructor(
    private readonly voice: Voice,
    gainDb: number,
  ) {
    this.output = new Tone.Gain(Tone.dbToGain(gainDb));
    voice.output.connect(this.output);
  }

  breathe() {
    /* instruments don't breathe */
  }
  attack(pitch: number, time: number, velocity: number) {
    this.voice.attack(pitch, time, velocity);
  }
  release(pitch: number, time: number) {
    this.voice.release(pitch, time);
  }
  attackRelease(pitch: number, duration: Tone.Unit.Time, time: number, velocity: number) {
    this.voice.attackRelease(pitch, duration, time, velocity);
  }
  releaseAll(time?: number) {
    this.voice.releaseAll(time);
  }
  dispose() {
    this.voice.dispose();
    this.output.dispose();
  }
}

/**
 * The voice for a vocal part in `sound`: the synthesized singer, Yui's guitar (her lead
 * guitar pack, through her amp in the current playing style), Mugi's recorded piano, or
 * her Triton synth lead / strings. Loads what it needs first.
 */
export async function createSinger(role: VocalRole, sound: VocalSound, samples: SampleManager): Promise<SingingVoice> {
  const gain = VOCAL_SOUND_GAIN_DB[role][sound];
  switch (sound) {
    case "voice":
      return createVocalVoice(role);
    case "guitar":
      await samples.load("lead-guitar");
      return new InstrumentSinger(samples.createVoice("lead-guitar"), gain);
    case "piano":
      await samples.load("keys");
      return new InstrumentSinger(samples.createVoice("keys", "piano"), gain);
    case "synth":
    case "strings":
      return new InstrumentSinger(createKeysPatchVoice(sound, KEYS_PATCH_TRIM_DB[sound]), gain);
  }
}
