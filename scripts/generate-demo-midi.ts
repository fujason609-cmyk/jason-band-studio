/**
 * Writes the built-in demo song to public/demo/after-school-jam.mid so people can
 * try the MIDI import flow with a file that is safe to share.
 *   pnpm demo:midi
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { Midi } from "@tonejs/midi";
import { DEMO_BEATS_PER_BAR, DEMO_BPM, DEMO_PARTS } from "../src/features/band/demoSong";

function buildDemoMidi(): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(DEMO_BPM);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: [DEMO_BEATS_PER_BAR, 4] });
  midi.header.name = "After School Jam";

  const layout = [
    { part: DEMO_PARTS.yui, name: "Lead guitar", program: 29, channel: 0 },
    { part: DEMO_PARTS.azusa, name: "Rhythm guitar", program: 30, channel: 1 },
    { part: DEMO_PARTS.mio, name: "Bass", program: 33, channel: 2 },
    { part: DEMO_PARTS.tsumugi, name: "Keys", program: 4, channel: 3 },
    { part: DEMO_PARTS.ritsu, name: "Drums", program: 0, channel: 9 },
  ];
  for (const { part, name, program, channel } of layout) {
    const track = midi.addTrack();
    track.name = name;
    track.channel = channel;
    track.instrument.number = program;
    part.forEach((n) => track.addNote({ midi: n.pitch, time: n.start, duration: n.duration, velocity: n.velocity }));
  }
  return midi.toArray();
}

mkdirSync("public/demo", { recursive: true });
writeFileSync("public/demo/after-school-jam.mid", buildDemoMidi());
console.log("Wrote public/demo/after-school-jam.mid");
