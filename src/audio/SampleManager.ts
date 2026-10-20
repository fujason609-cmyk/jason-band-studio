import * as Tone from "tone";
import type { InstrumentId, InstrumentLoadState } from "@/types/audio";
import { SAMPLE_PACKS, samplePackUrl, type SamplePack } from "./audioConfig";
import { pluckPitches } from "./karplus";
import { RENDERED_SETS, createPackVoice, createSynthVoice, type Voice } from "./voices";

type Listener = (instrument: InstrumentId, state: InstrumentLoadState) => void;
type Notes = Record<string, Tone.ToneAudioBuffer>;

/**
 * Loads instrument sources lazily, caches decoded buffers so several tracks can share
 * them, and reports load progress to the UI.
 *
 * Instruments with a recorded pack (SAMPLE_PACKS) fetch it; if that fails (offline, a
 * missing file) they fall back to their synth voice so the band keeps playing, and the
 * state says "error" so the mixer offers Retry. Synth instruments are ready at once,
 * except the ones in RENDERED_SETS, whose notes are rendered once and shared.
 */
export class SampleManager {
  private readonly states = new Map<InstrumentId, InstrumentLoadState>();
  private readonly packs = new Map<InstrumentId, { main: Notes; soft?: Notes }>();
  private readonly rendered = new Map<InstrumentId, Notes>();
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

  /** Resolves once the instrument can make sound (recorded or synthesized); never rejects. */
  load(instrument: InstrumentId): Promise<void> {
    const existing = this.pending.get(instrument);
    if (existing && this.getState(instrument).status !== "error") return existing;

    const pack = SAMPLE_PACKS[instrument];
    const task = pack ? this.loadPack(instrument, pack) : this.loadSynth(instrument);
    this.pending.set(instrument, task);
    return task;
  }

  private async loadSynth(instrument: InstrumentId, report = true) {
    const set = RENDERED_SETS[instrument];
    if (set && !this.rendered.has(instrument)) {
      const sampleRate = Tone.getContext().sampleRate;
      const notes: Notes = {};
      const pitches = pluckPitches(set.low, set.high, set.step);
      for (const [i, pitch] of pitches.entries()) {
        const frequency = Tone.Frequency(pitch, "midi");
        notes[frequency.toNote()] = Tone.ToneAudioBuffer.fromArray(set.render(frequency.toFrequency(), sampleRate));
        // hand the main thread back between notes so rendering never freezes the page
        if (report) this.set(instrument, { status: "loading", progress: (i + 1) / pitches.length });
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      this.rendered.set(instrument, notes);
    }
    if (report) this.set(instrument, { status: "ready", progress: 1 });
  }

  private async loadPack(instrument: InstrumentId, pack: SamplePack) {
    const layers = { main: pack.files, ...(pack.soft ? { soft: pack.soft.files } : {}) };
    const entries = Object.entries(layers).flatMap(([layer, files]) =>
      Object.entries(files).map(([note, file]) => ({ layer: layer as "main" | "soft", note, file })),
    );
    let done = 0;
    this.set(instrument, { status: "loading", progress: 0 });
    try {
      const loaded = await Promise.all(
        entries.map(async (e) => {
          const buffer = await new Tone.ToneAudioBuffer().load(samplePackUrl(instrument, e.file));
          done += 1;
          this.set(instrument, { status: "loading", progress: done / entries.length });
          return { ...e, buffer };
        }),
      );
      const pick = (layer: "main" | "soft") =>
        Object.fromEntries(loaded.filter((e) => e.layer === layer).map((e) => [e.note, e.buffer]));
      this.packs.set(instrument, { main: pick("main"), soft: pack.soft ? pick("soft") : undefined });
      this.set(instrument, { status: "ready", progress: 1 });
    } catch (err) {
      // keep playing on the synth voice; the error state shows Retry in the mixer
      await this.loadSynth(instrument, false);
      const message = err instanceof Error ? err.message : String(err);
      this.set(instrument, {
        status: "error",
        progress: done / Math.max(1, entries.length),
        error: `Couldn't load the ${instrument} samples (${message}). Check the files in public/instruments/${instrument}/.`,
      });
    }
  }

  /** Build a new voice for an instrument. Call `load()` first. */
  createVoice(instrument: InstrumentId): Voice {
    const pack = SAMPLE_PACKS[instrument];
    const buffers = this.packs.get(instrument);
    if (pack && buffers) {
      const sampler = (urls: Notes) => new Tone.Sampler({ urls, release: pack.release ?? 0.5 });
      const soft = pack.soft && buffers.soft ? { sampler: sampler(buffers.soft), below: pack.soft.below } : undefined;
      return createPackVoice(instrument, sampler(buffers.main), pack.volume ?? 0, soft);
    }
    return createSynthVoice(instrument, this.rendered.get(instrument));
  }

  dispose() {
    const free = (notes?: Notes) => Object.values(notes ?? {}).forEach((b) => b.dispose());
    this.packs.forEach((p) => {
      free(p.main);
      free(p.soft);
    });
    this.rendered.forEach(free);
    this.packs.clear();
    this.rendered.clear();
    this.pending.clear();
    this.states.clear();
    this.listeners.clear();
  }
}
