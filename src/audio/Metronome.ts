import * as Tone from "tone";
import { PPQ } from "./audioConfig";

const clickSynth = (out: Tone.ToneAudioNode) =>
  new Tone.Synth({
    oscillator: { type: "triangle" },
    envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
  }).connect(out);

/**
 * Practice clicks: the count-in before playback and the metronome during it. They go
 * straight to the speakers, not through the band's master, so they stay out of video
 * recordings (which capture the master) and out of the master volume.
 */
export class Metronome {
  /** click on every beat while the transport runs */
  enabled = false;
  beatsPerBar = 4;
  private readonly out = new Tone.Volume(-8).toDestination();
  private readonly beat = clickSynth(this.out);
  /** a fresh synth per count-in, so a cancelled one can be cut off by disposing it */
  private counter: Tone.Synth | null = null;
  private readonly repeatId: number;

  constructor() {
    const transport = Tone.getTransport();
    this.repeatId = transport.scheduleRepeat(
      (time) => {
        if (!this.enabled) return;
        const beat = Math.round(transport.getTicksAtTime(time) / PPQ);
        tick(this.beat, time, beat % this.beatsPerBar === 0);
      },
      `${PPQ}i`,
      0,
    );
  }

  /** Click `beats` beats from `startTime`, the first one accented. Returns when the count ends. */
  countIn(startTime: number, beats: number, secondsPerBeat: number): number {
    this.cancelCountIn();
    const counter = clickSynth(this.out);
    this.counter = counter;
    for (let i = 0; i < beats; i++) tick(counter, startTime + i * secondsPerBeat, i === 0);
    const end = startTime + beats * secondsPerBeat;
    // free it once the last click has rung out
    setTimeout(() => {
      if (this.counter === counter) this.cancelCountIn();
    }, (end - Tone.now() + 0.5) * 1000);
    return end;
  }

  /** Silence any count-in clicks still to come. */
  cancelCountIn() {
    this.counter?.dispose();
    this.counter = null;
  }

  dispose() {
    Tone.getTransport().clear(this.repeatId);
    this.cancelCountIn();
    this.beat.dispose();
    this.out.dispose();
  }
}

function tick(synth: Tone.Synth, time: number, accent: boolean) {
  synth.triggerAttackRelease(accent ? "A6" : "E6", 0.04, time, accent ? 1 : 0.6);
}
