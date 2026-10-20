/**
 * Two-operator FM piano note, rendered straight into a Float32Array. Same patch the
 * keys used to synthesize live (carrier and modulator sines, modulator at 3× the
 * pitch, index 3.5, quick attack, long decay to a low sustain), but computed once and
 * played back by a Sampler: dense keyboard parts made 64 live FM voices overload the
 * audio thread.
 */
export interface FmPianoPatch {
  harmonicity: number;
  modulationIndex: number;
  /** amplitude: attack, decay (to sustain) in seconds, sustain level */
  attack: number;
  decay: number;
  sustain: number;
  /** brightness envelope: how fast the modulation falls to its floor */
  modDecay: number;
  modSustain: number;
  /** length of each rendered note in seconds */
  seconds: number;
}

export const MUGI_PIANO: FmPianoPatch = {
  harmonicity: 3,
  modulationIndex: 3.5,
  attack: 0.004,
  decay: 1.4,
  sustain: 0.25,
  modDecay: 0.4,
  modSustain: 0.1,
  seconds: 3,
};

export function renderFmPiano(frequency: number, sampleRate: number, patch: FmPianoPatch): Float32Array {
  const length = Math.max(1, Math.floor(patch.seconds * sampleRate));
  const out = new Float32Array(length);
  const carrier = (2 * Math.PI * frequency) / sampleRate;
  const modulator = carrier * patch.harmonicity;
  // exponential segments reach ~2% of their distance in the given time
  const ampTau = patch.decay / 4;
  const modTau = patch.modDecay / 4;
  let peak = 0;
  for (let n = 0; n < length; n++) {
    const t = n / sampleRate;
    const amp =
      t < patch.attack ? t / patch.attack : patch.sustain + (1 - patch.sustain) * Math.exp(-(t - patch.attack) / ampTau);
    const index = patch.modulationIndex * (patch.modSustain + (1 - patch.modSustain) * Math.exp(-t / modTau));
    const y = amp * Math.sin(carrier * n + index * Math.sin(modulator * n));
    out[n] = y;
    peak = Math.max(peak, Math.abs(y));
  }
  // normalise and fade the tail so the sample never clicks
  const gain = peak > 0 ? 0.9 / peak : 0;
  const fadeOut = Math.min(length, Math.round(sampleRate * 0.08));
  for (let n = 0; n < length; n++) {
    out[n]! *= n >= length - fadeOut ? (gain * (length - n)) / fadeOut : gain;
  }
  return out;
}
