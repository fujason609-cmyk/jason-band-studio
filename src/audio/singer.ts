/**
 * A sung "ah" / "oh" in a young female voice, rendered once per note into a Float32Array
 * and played back by a Sampler (like the FM piano and the plucked strings). The parts of
 * a real voice, each kept simple:
 *
 *   source     a glottal pulse (Rosenberg) with a high open quotient: a girl's voice has a
 *              soft, rounded pulse, so its harmonics fall away fast and it never buzzes
 *   breath     noise that puffs with every opening of the vocal folds, then a high-pass:
 *              the airy, light quality of a young voice
 *   vowel      five formant resonators in cascade (the vocal tract), at the values of a
 *              teenage girl's short vocal tract (higher than an adult woman's)
 *   body       a low cut under the voice: the chesty weight below ~250 Hz is what makes a
 *              synthetic voice sound grown-up or male
 *   life       the note starts straight and the vibrato grows in after a moment, a slow
 *              random pitch drift and a little amplitude shimmer, an optional scoop up into
 *              the note
 *
 * Character types for the two singers, not a copy of anyone's voice.
 */
export interface SingerPatch {
  /** formants of the vowel: [frequency Hz, bandwidth Hz] × 5 */
  formants: [number, number][];
  /** share of each glottal cycle the folds are open (0.5 pressed … 0.8 breathy) */
  openQuotient: number;
  /** extra top-end roll-off of the source, Hz (one pole) */
  tilt: number;
  /** breath noise level against the voiced sound */
  breath: number;
  /** low cut under the voice, Hz (one pole) */
  lowCut: number;
  vibrato: { rate: number; cents: number; onset: number; rise: number };
  /** cents below the note the voice starts, and how long it takes to reach it */
  scoop: { cents: number; seconds: number };
  attack: number;
  /** length of each rendered note in seconds */
  seconds: number;
}

/** Yui: a bright, young, open "ah", quick light vibrato, scooping lightly into notes. */
export const YUI_VOICE: SingerPatch = {
  formants: [
    [1050, 100],
    [1600, 120],
    [3150, 180],
    [4300, 250],
    [5200, 300],
  ],
  openQuotient: 0.72,
  tilt: 3400,
  breath: 0.2,
  lowCut: 250,
  vibrato: { rate: 6, cents: 20, onset: 0.22, rise: 0.35 },
  scoop: { cents: 35, seconds: 0.06 },
  attack: 0.035,
  seconds: 5,
};

/** Mio: a warmer, rounder "oh", slower and gentler vibrato, a soft breathy onset. */
export const MIO_VOICE: SingerPatch = {
  formants: [
    [620, 80],
    [1050, 100],
    [2950, 170],
    [4000, 250],
    [4900, 300],
  ],
  openQuotient: 0.76,
  tilt: 2700,
  breath: 0.24,
  lowCut: 220,
  vibrato: { rate: 5.2, cents: 16, onset: 0.3, rise: 0.45 },
  scoop: { cents: 15, seconds: 0.08 },
  attack: 0.08,
  seconds: 5,
};

/** Small seeded generator, so a note renders the same every time (and in tests). */
function random(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Glottal flow over one cycle (phase 0..1): opens over 2/3 of the open phase, closes faster. */
function glottalFlow(phase: number, openQuotient: number): number {
  const opening = openQuotient * 0.66;
  const closing = openQuotient - opening;
  if (phase < opening) return 0.5 * (1 - Math.cos((Math.PI * phase) / opening));
  if (phase < openQuotient) return Math.cos((Math.PI * (phase - opening)) / (2 * closing));
  return 0;
}

/**
 * The quick in-breath a singer takes before a phrase: air rushing through an open mouth,
 * mostly between 1.5 and 6 kHz (two one-pole filters around noise), rising and falling
 * over `seconds`. The vowel shapes it a little, through its second formant.
 */
export function renderBreath(sampleRate: number, patch: SingerPatch, seconds = 0.32, seed = 3): Float32Array {
  const length = Math.max(1, Math.floor(seconds * sampleRate));
  const out = new Float32Array(length);
  const noise = random(seed);
  const hp = Math.exp((-2 * Math.PI * 1500) / sampleRate);
  const lp = Math.exp((-2 * Math.PI * 6000) / sampleRate);
  const [f2, bw2] = patch.formants[1]!;
  const r = Math.exp((-Math.PI * bw2 * 3) / sampleRate);
  const b = 2 * r * Math.cos((2 * Math.PI * f2) / sampleRate);
  const c = -r * r;
  let low = 0;
  let smooth = 0;
  let y1 = 0;
  let y2 = 0;
  let peak = 0;
  for (let n = 0; n < length; n++) {
    const t = n / length;
    const x = noise();
    low = x * (1 - hp) + low * hp;
    smooth = (x - low) * (1 - lp) + smooth * lp;
    const shaped = smooth + 0.5 * ((1 - b - c) * smooth + b * y1 + c * y2);
    y2 = y1;
    y1 = shaped;
    // an inhale swells and stops a little before the note
    const env = Math.sin(Math.PI * Math.min(1, t / 0.9)) ** 1.5;
    out[n] = shaped * env;
    peak = Math.max(peak, Math.abs(out[n]!));
  }
  const gain = peak > 0 ? 0.9 / peak : 0;
  for (let n = 0; n < length; n++) out[n]! *= gain;
  return out;
}

export function renderSungNote(frequency: number, sampleRate: number, patch: SingerPatch, seed = 1): Float32Array {
  const length = Math.max(1, Math.floor(patch.seconds * sampleRate));
  const out = new Float32Array(length);
  const noise = random(seed);
  const drift = random(seed * 7919);

  // formant resonators (Klatt): y = a·x + b·y1 + c·y2, unity gain at DC
  const resonators = patch.formants.map(([f, bw]) => {
    const r = Math.exp((-Math.PI * bw) / sampleRate);
    const b = 2 * r * Math.cos((2 * Math.PI * f) / sampleRate);
    const c = -r * r;
    return { a: 1 - b - c, b, c, y1: 0, y2: 0 };
  });
  const tilt = Math.exp((-2 * Math.PI * patch.tilt) / sampleRate);
  const breathHp = Math.exp((-2 * Math.PI * 1500) / sampleRate);
  const bodyHp = Math.exp((-2 * Math.PI * patch.lowCut) / sampleRate);
  let bodyLow = 0;

  let phase = 0;
  let lastFlow = 0;
  let tilted = 0;
  let noiseLow = 0;
  let wander = 0;
  let shimmer = 0;
  let peak = 0;
  for (let n = 0; n < length; n++) {
    const t = n / sampleRate;
    // pitch: scoop up into the note, vibrato that grows in, slow random drift (±~8 cents)
    const scoop = t < patch.scoop.seconds ? -patch.scoop.cents * (1 - t / patch.scoop.seconds) ** 2 : 0;
    const v = patch.vibrato;
    const depth = t < v.onset ? 0 : Math.min(1, (t - v.onset) / v.rise) * v.cents;
    wander += (drift() * 8 - wander) * (3 / sampleRate);
    const cents = scoop + depth * Math.sin(2 * Math.PI * v.rate * t) + wander;
    phase += (frequency * 2 ** (cents / 1200)) / sampleRate;
    if (phase >= 1) phase -= 1;

    // source: the flow's slope (what the lips radiate), softened, plus breath puffs
    const flow = glottalFlow(phase, patch.openQuotient);
    const voiced = (flow - lastFlow) * sampleRate / frequency;
    lastFlow = flow;
    tilted = voiced * (1 - tilt) + tilted * tilt;
    const hiss = noise();
    noiseLow = hiss * (1 - breathHp) + noiseLow * breathHp;
    const breath = (hiss - noiseLow) * patch.breath * (0.25 + flow);
    let x = tilted + breath;

    for (const r of resonators) {
      const y = r.a * x + r.b * r.y1 + r.c * r.y2;
      r.y2 = r.y1;
      r.y1 = y;
      x = y;
    }

    // take the chesty weight off the bottom
    bodyLow = x * (1 - bodyHp) + bodyLow * bodyHp;
    x -= bodyLow;

    // loudness: a soft onset, a gentle swell and fade over the held note, a little shimmer
    shimmer += (noise() * 0.04 - shimmer) * (20 / sampleRate);
    const env = (t < patch.attack ? t / patch.attack : 1) * (1 - 0.25 * (t / patch.seconds)) * (1 + shimmer);
    const y = x * env;
    out[n] = y;
    peak = Math.max(peak, Math.abs(y));
  }

  // normalise and fade the tail so the sample never clicks
  const gain = peak > 0 ? 0.9 / peak : 0;
  const fadeOut = Math.min(length, Math.round(sampleRate * 0.15));
  for (let n = 0; n < length; n++) out[n]! *= n >= length - fadeOut ? (gain * (length - n)) / fadeOut : gain;
  return out;
}
