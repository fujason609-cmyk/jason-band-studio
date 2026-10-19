import * as Tone from "tone";
import type { InstrumentId, InstrumentLoadState } from "@/types/audio";
import { SAMPLE_PACKS, samplePackUrl } from "./audioConfig";
import { createSamplerVoice, createSynthVoice, type Voice } from "./voices";

type Listener = (instrument: InstrumentId, state: InstrumentLoadState) => void;

/**
 * Loads instrument sources lazily, caches decoded sample buffers so several
 * tracks can share one pack, and reports load progress to the UI.
 * Synth instruments are "ready" as soon as they are requested.
 */
export class SampleManager {
  private readonly states = new Map<InstrumentId, InstrumentLoadState>();
  private readonly buffers = new Map<InstrumentId, Record<string, Tone.ToneAudioBuffer>>();
  private readonly pending = new Map<InstrumentId, Promise<void>>();
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getState(instrument: InstrumentId): InstrumentLoadState {
    return this.states.get(instrument) ?? { status: "idle", progress: 0 };
  }

  isReady(instrument: InstrumentId): boolean {
    return this.getState(instrument).status === "ready";
  }

  private set(instrument: InstrumentId, state: InstrumentLoadState) {
    this.states.set(instrument, state);
    this.listeners.forEach((l) => l(instrument, state));
  }

  load(instrument: InstrumentId): Promise<void> {
    const existing = this.pending.get(instrument);
    if (existing && this.getState(instrument).status !== "error") return existing;

    const pack = SAMPLE_PACKS[instrument];
    const task = pack ? this.loadPack(instrument, pack.files) : this.loadSynth(instrument);
    this.pending.set(instrument, task);
    return task;
  }

  private async loadSynth(instrument: InstrumentId) {
    this.set(instrument, { status: "ready", progress: 1 });
  }

  private async loadPack(instrument: InstrumentId, files: Record<string, string>) {
    const entries = Object.entries(files);
    let done = 0;
    this.set(instrument, { status: "loading", progress: 0 });
    try {
      const loaded = await Promise.all(
        entries.map(async ([note, file]) => {
          const buffer = await new Tone.ToneAudioBuffer().load(samplePackUrl(instrument, file));
          done += 1;
          this.set(instrument, { status: "loading", progress: done / entries.length });
          return [note, buffer] as const;
        }),
      );
      this.buffers.set(instrument, Object.fromEntries(loaded));
      this.set(instrument, { status: "ready", progress: 1 });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.set(instrument, {
        status: "error",
        progress: done / Math.max(1, entries.length),
        error: `Couldn't load the ${instrument} samples (${message}). Check the files in public/instruments/${instrument}/.`,
      });
      throw err;
    }
  }

  /** Build a new voice for an instrument. Call `load()` first for sample packs. */
  createVoice(instrument: InstrumentId): Voice {
    const pack = SAMPLE_PACKS[instrument];
    const buffers = this.buffers.get(instrument);
    if (pack && buffers) {
      return createSamplerVoice(new Tone.Sampler({ urls: buffers, release: pack.release ?? 0.5 }), pack.volume ?? -6);
    }
    return createSynthVoice(instrument);
  }

  dispose() {
    this.buffers.forEach((set) => Object.values(set).forEach((b) => b.dispose()));
    this.buffers.clear();
    this.pending.clear();
    this.states.clear();
    this.listeners.clear();
  }
}
