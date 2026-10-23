/**
 * The video recording's peak limiter: makeup gain, then a look-ahead limiter that keeps every
 * sample under the ceiling by turning the whole band down smoothly just before a peak and
 * back up after it, never by bending the waveform (the soft clipper it replaced shaped the
 * peaks themselves, which is distortion, and more of it the louder it was pushed).
 *
 * Per sample: the gain the sample needs (ceiling / its peak, linked across both channels),
 * the smallest of those over the look-ahead window, averaged over the window again (so the
 * gain glides down across the look-ahead and is already low enough when the peak arrives:
 * no overshoot), then released slowly. The output is delayed by the look-ahead.
 *
 * Plain JS with nothing from outside the class: the same class runs in the tests and, as
 * source text, in an AudioWorklet (`limiterModuleUrl`). So its fields are only *declared*
 * and set in the constructor: a field with an initializer is compiled (for the build's
 * browser targets) into a call to a bundler helper that doesn't exist in the worklet.
 */
export class LookaheadLimiter {
  declare private readonly size: number;
  declare private readonly gain: number;
  declare private readonly ceiling: number;
  declare private readonly release: number;
  /** the gain each of the last `size` input samples needs */
  declare private readonly need: Float32Array;
  /** sample counts whose need is the window's minimum and the ones after it, increasing need */
  declare private readonly queue: Float64Array;
  declare private head: number;
  declare private count: number;
  /** the last `size` window minimums, and their sum, for the average */
  declare private readonly mins: Float32Array;
  declare private sum: number;
  declare private readonly delayL: Float32Array;
  declare private readonly delayR: Float32Array;
  declare private env: number;
  declare private n: number;
  /** the most the gain went down, dB (for measuring) */
  declare maxReductionDb: number;

  constructor(sampleRate: number, gainDb: number, ceilingDb: number, lookaheadMs = 5, releaseMs = 120) {
    this.size = Math.max(1, Math.round((lookaheadMs / 1000) * sampleRate));
    this.gain = Math.pow(10, gainDb / 20);
    this.ceiling = Math.pow(10, ceilingDb / 20);
    this.release = 1 - Math.exp(-1 / ((releaseMs / 1000) * sampleRate));
    this.need = new Float32Array(this.size);
    this.queue = new Float64Array(this.size + 1);
    this.mins = new Float32Array(this.size).fill(1);
    this.sum = this.size;
    this.delayL = new Float32Array(this.size);
    this.delayR = new Float32Array(this.size);
    this.head = 0;
    this.count = 0;
    this.env = 1;
    this.n = 0;
    this.maxReductionDb = 0;
  }

  /** Limit one block (right may be the left again, for mono). */
  process(inL: Float32Array, inR: Float32Array, outL: Float32Array, outR: Float32Array) {
    const size = this.size;
    const cap = this.queue.length;
    for (let i = 0; i < inL.length; i++) {
      const n = this.n++;
      // the oldest sample leaves the window
      while (this.count > 0 && this.queue[this.head]! <= n - size) {
        this.head = (this.head + 1) % cap;
        this.count--;
      }
      const l = inL[i]!;
      const r = inR[i]!;
      const peak = Math.max(Math.abs(l), Math.abs(r)) * this.gain;
      const need = peak > this.ceiling ? this.ceiling / peak : 1;
      this.need[n % size] = need;
      while (this.count > 0) {
        const back = this.queue[(this.head + this.count - 1) % cap]!;
        if (this.need[back % size]! < need) break;
        this.count--;
      }
      this.queue[(this.head + this.count) % cap] = n;
      this.count++;
      const min = this.need[this.queue[this.head]! % size]!;
      this.sum += min - this.mins[n % size]!;
      this.mins[n % size] = min;
      const smooth = this.sum / size;
      this.env = smooth < this.env ? smooth : this.env + (smooth - this.env) * this.release;
      const g = Math.min(this.env, smooth);
      if (g < 1) this.maxReductionDb = Math.max(this.maxReductionDb, -20 * Math.log10(g));
      // out: the sample from size - 1 samples ago
      this.delayL[n % size] = l;
      this.delayR[n % size] = r;
      const back = (n + 1) % size;
      outL[i] = this.delayL[back]! * this.gain * g;
      outR[i] = this.delayR[back]! * this.gain * g;
    }
  }
}

export const LIMITER_PROCESSOR = "record-limiter";

/** A blob URL for an AudioWorklet module running LookaheadLimiter. */
export function limiterModuleUrl(): string {
  const source = `const Limiter = ${LookaheadLimiter.toString()};
registerProcessor(${JSON.stringify(LIMITER_PROCESSOR)}, class extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = options.processorOptions;
    this.limiter = new Limiter(sampleRate, o.gainDb, o.ceilingDb);
  }
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) {
      // nothing connected (yet): silence, but keep running
      const silent = new Float32Array(output[0].length);
      this.limiter.process(silent, silent, output[0], output[1] || output[0]);
      return true;
    }
    this.limiter.process(input[0], input[1] || input[0], output[0], output[1] || output[0]);
    return true;
  }
});
`;
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}
