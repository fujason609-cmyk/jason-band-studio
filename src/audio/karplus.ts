/**
 * Karplus–Strong plucked string, rendered straight into a Float32Array.
 *
 * Tone's PluckSynth runs an AudioWorklet per string, all the time; a few dozen of
 * them overload the audio thread and the band goes silent. Instead the strings
 * are rendered once (tens of milliseconds for a whole guitar) and played back by
 * a Sampler, which costs nothing while a string isn't sounding.
 */

export interface PluckPatch {
  /** seconds for the string to fade by 60 dB */
  t60: number;
  /** pick tone: 0 = dark and soft, 1 = bright and snappy */
  brightness: number;
  /** length of each rendered note in seconds */
  seconds: number;
}

/**
 * One plucked note at `frequency`. A burst of filtered noise one period long is fed
 * round a delay loop whose two-tap average both lowpasses the string a little more
 * each trip and adds half a sample of delay, which the fractional delay accounts for.
 */
export function renderPluck(
  frequency: number,
  sampleRate: number,
  patch: PluckPatch,
  random: () => number = Math.random,
): Float32Array {
  const length = Math.max(1, Math.floor(patch.seconds * sampleRate));
  const out = new Float32Array(length);
  // the averaging filter delays by half a sample, so the loop itself is half a sample shorter
  const period = sampleRate / frequency - 0.5;
  const burst = Math.min(length, Math.ceil(period) + 2);

  // excitation: one period of noise through a one-pole lowpass (the pick)
  const coef = 0.15 + 0.8 * Math.min(1, Math.max(0, patch.brightness));
  let lp = 0;
  let mean = 0;
  for (let i = 0; i < burst; i++) {
    lp += coef * (random() * 2 - 1 - lp);
    out[i] = lp;
    mean += lp;
  }
  mean /= burst;
  for (let i = 0; i < burst; i++) out[i]! -= mean; // no DC thump

  // per-trip loss so the fundamental fades by 60 dB in t60 seconds
  const rho = Math.pow(0.001, 1 / (frequency * patch.t60));
  const at = (pos: number) => {
    const i = Math.floor(pos);
    const f = pos - i;
    return out[i]! * (1 - f) + out[i + 1]! * f;
  };
  for (let n = burst; n < length; n++) {
    const d = n - period;
    out[n] = rho * 0.5 * (at(d) + at(d - 1));
  }

  // normalise, then soften both ends so the sample never clicks
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const gain = peak > 0 ? 0.9 / peak : 0;
  const fadeIn = Math.min(length, Math.round(sampleRate * 0.001));
  const fadeOut = Math.min(length, Math.round(sampleRate * 0.05));
  for (let i = 0; i < length; i++) {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    if (i >= length - fadeOut) g *= (length - i) / fadeOut;
    out[i]! *= g;
  }
  return out;
}

/** MIDI pitches to render for a range, `step` semitones apart, always including the top. */
export function pluckPitches(low: number, high: number, step: number): number[] {
  const pitches: number[] = [];
  for (let p = low; p < high; p += step) pitches.push(p);
  pitches.push(high);
  return pitches;
}
