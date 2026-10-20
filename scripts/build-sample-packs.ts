/**
 * Builds the recorded sample packs in public/instruments/ from CC0 libraries hosted
 * by the sfzinstruments project on GitHub, and writes src/audio/samplePacks.generated.ts.
 *
 *   FFMPEG=/path/to/ffmpeg pnpm samples:build
 *
 * Every source is CC0-1.0 (public domain dedication), so the packs may be shipped
 * and redistributed freely; credits are kept in public/instruments/CREDITS.md anyway.
 * Sources are pinned to a commit so a rebuild gives the same notes.
 *
 * For each note: download (cached in .sample-cache/), decode to mono 44.1 kHz with
 * ffmpeg, mix close and overhead mics for drums, cut the silence before the attack,
 * trim to a fixed length with a fade-out, normalise the peak, encode a 96 kbps MP3.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { InstrumentId } from "../src/types/audio";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";
const CACHE = process.env.SAMPLE_CACHE ?? ".sample-cache";
const RATE = 44100;

const REPOS = {
  guitars: { repo: "karoryfer.black-and-green-guitars", commit: "b3b3249d37dc977a1a297bd2dc053e6d9b6b805c" },
  emily: { repo: "karoryfer.emilyguitar", commit: "b4920dc662fd9cad6dcaccdeecffdd91c8725d8c" },
  jazzBass: { repo: "karoryfer.growlybass", commit: "4f483268fc66b5a6d5781d421c0d11b8d08d3fc6" },
  drums: { repo: "karoryfer.big-rusty-drums", commit: "f07ce00df34a46b6b08375be56fe116cf15782bc" },
  piano: { repo: "Osiris_Piano", commit: "18c6afccb60cff458edbf7c394571783e074e1e9" },
} as const;
type RepoKey = keyof typeof REPOS;

const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
/** Scientific pitch name with flats (no '#', so it is safe in file names and URLs): 61 → "Db4". */
const noteName = (midi: number) => `${FLAT_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
const pitchClass = (midi: number) => FLAT_NAMES[midi % 12]!;
const octave = (midi: number) => Math.floor(midi / 12) - 1;
/** "eb3" → 51: a library's note name in scientific pitch. */
const nameToMidi = (name: string) => {
  const m = name.match(/^([a-g]b?)(-?\d)$/)!;
  const pc = FLAT_NAMES.findIndex((n) => n.toLowerCase() === m[1]);
  return pc + 12 * (Number(m[2]) + 1);
};
const range = (low: number, high: number, step: number) => {
  const out: number[] = [];
  for (let p = low; p <= high; p += step) out.push(p);
  return out;
};

interface Take {
  /** source files, mixed with these weights (drums: close mic + overheads) */
  sources: { repo: RepoKey; path: string; weight: number }[];
  /** seconds kept after the attack */
  seconds: number;
  /** peak level after normalising (drum pieces are balanced against each other here) */
  peak: number;
  /** fade-out length in seconds; default 15% of the note */
  fade?: number;
  /** retune by this many semitones (a smaller drum sounds higher and dies away sooner) */
  semitones?: number;
}

interface Pack {
  instrument: InstrumentId;
  /** a second set of recordings for the same instrument (the soft piano layer), in a subfolder */
  layer?: "soft";
  /** output note name → take */
  notes: Record<string, Take>;
}

const one = (repo: RepoKey, path: string, seconds: number, peak = 0.89, fade?: number): Take => ({
  sources: [{ repo, path, weight: 1 }],
  seconds,
  peak,
  fade,
});

// --- melodic packs -----------------------------------------------------------------

/**
 * The guitar library names files an octave above scientific pitch (its lowest E,
 * MIDI 40, is "e3"), as its SFZ maps show (pitch_keycenter=41 for "f3").
 */
function guitar(instrument: InstrumentId, body: "green" | "black", seconds: number): Pack {
  const notes: Pack["notes"] = {};
  for (const midi of range(40, 85, 3)) {
    const file = `twang_${pitchClass(midi).toLowerCase()}${octave(midi) + 1}_mf_rr1.wav`;
    notes[noteName(midi)] = one("guitars", `Samples/${body}/ord/${file}`, seconds);
  }
  return { instrument, notes };
}

/**
 * Yui: an Epiphone (Gibson's own brand) solid body with two humbuckers, recorded direct
 * with both pickups on. The closest free recording to her Les Paul Standard. File names
 * are scientific pitch ("e2" measures 82.7 Hz, MIDI 40); the library samples every minor
 * third itself, so all of its notes are used.
 */
function epiphone(): Pack {
  const names = ["db2", "e2", "gb2", "a2", "c3", "eb3", "gb3", "a3", "c4", "eb4", "gb4", "a4", "c5", "eb5", "gb5", "a5", "c6", "d6"];
  const notes: Pack["notes"] = {};
  for (const name of names) notes[noteName(nameToMidi(name))] = one("emily", `notes/${name}_mf_rr1.wav`, 3);
  return { instrument: "lead-guitar", notes };
}

/**
 * Mio: a Squier (Fender's own brand) Jazz Bass. Bass libraries name files an octave
 * above what they sound: "e2" measures 41.9 Hz, the open E string, MIDI 28. (The bass
 * used before this one had the same convention and was shipped an octave low.)
 */
function jazzBass(): Pack {
  const names = ["db2", "e2", "gb2", "a2", "c3", "eb3", "gb3", "a3", "c4", "eb4", "gb4", "a4", "c5", "eb5"];
  const notes: Pack["notes"] = {};
  for (const name of names) notes[noteName(nameToMidi(name) - 12)] = one("jazzBass", `sustain/${name}_f_rr1.wav`, 2.5);
  return { instrument: "bass", notes };
}

/**
 * The piano library samples white keys only and names them an octave below
 * scientific pitch ("C0" is MIDI 24). C, E and G keep every note within 2.5
 * semitones of a sample. Piano notes ring a long time, so they are kept long
 * (8 s low, 6 s middle, 4 s high) with a slow fade, and both of the library's
 * velocity layers are used: "vl1" (soft) for quiet playing, "vl2" (hard) otherwise.
 */
function piano(layer: "soft" | "hard"): Pack {
  const notes: Pack["notes"] = {};
  for (let oct = 1; oct <= 7; oct++) {
    for (const [name, pc] of [["C", 0], ["E", 4], ["G", 7]] as const) {
      const midi = 12 * (oct + 1) + pc;
      if (midi > 96) continue;
      const seconds = midi <= 55 ? 8 : midi <= 72 ? 6 : 4;
      const vl = layer === "soft" ? "vl1" : "vl2";
      notes[noteName(midi)] = one("piano", `UC/A/Piano_UC_MicA_${name}${oct - 1}_${vl}.flac`, seconds, 0.89, 0.8);
    }
  }
  return { instrument: "keys", layer: layer === "soft" ? "soft" : undefined, notes };
}

// --- drums -------------------------------------------------------------------------

/** One drum piece: its close mic and the overheads mixed, at the General MIDI note the kit plays it on. */
function piece(dir: string, file: string, close: string, closeWeight: number, ohWeight: number, seconds: number, peak: number, semitones = 0): Take {
  return {
    sources: [
      { repo: "drums", path: `Samples/${dir}/${close}/${file}`, weight: closeWeight },
      { repo: "drums", path: `Samples/${dir}/oh/${file}`, weight: ohWeight },
    ],
    seconds,
    peak,
    semitones,
  };
}

/**
 * Ritsu plays a Yamaha Hipgig: a compact kit with a 16" kick and small toms, tighter
 * and higher than this full-size rock kit (24" kick). Retuning the kick up 5 semitones
 * and the toms up 3 shrinks them the way a smaller shell does: higher and shorter.
 * Snare and cymbals stay as recorded.
 */
const HIPGIG_KICK = 5;
const HIPGIG_TOMS = 3;

function drums(): Pack {
  return {
    instrument: "drums",
    notes: {
      [noteName(36)]: piece("kick_24/kick", "k_vl10_rr1.flac", "kick", 1, 0.5, 1, 0.89, HIPGIG_KICK), // kick
      [noteName(38)]: piece("snare_14/center", "sn_center_vl8_rr1.flac", "top", 1, 0.6, 1.2, 0.85), // snare
      [noteName(42)]: piece("hihat_14/cl", "ht_cl_vl5_rr1.flac", "cl", 0.8, 0.6, 0.5, 0.45), // closed hat
      [noteName(46)]: piece("hihat_14/open", "ht_open_vl4_rr1.flac", "cl", 0.8, 0.6, 1.6, 0.45), // open hat
      [noteName(49)]: piece("crash_17/cr", "cr_vl4_rr1.flac", "cl", 0.5, 1, 3, 0.55), // crash
      [noteName(51)]: piece("ride_22/rd", "rd_vl7_rr1.flac", "cl", 0.5, 1, 2.5, 0.45), // ride
      [noteName(50)]: piece("tom_14/center", "t14_vl5_rr1.flac", "cl", 1, 0.5, 1.5, 0.8, HIPGIG_TOMS), // high tom
      [noteName(47)]: piece("tom_18/center", "t18_vl5_rr1.flac", "cl", 1, 0.5, 1.5, 0.8, HIPGIG_TOMS), // mid tom
      [noteName(43)]: piece("tom_22/center", "t22_vl5_rr1.flac", "cl", 1, 0.5, 1.8, 0.85, HIPGIG_TOMS), // floor tom
    },
  };
}

const PACKS: Pack[] = [
  epiphone(), // Yui's Les Paul → Epiphone humbuckers
  guitar("rhythm-guitar", "black", 2.2), // Azusa's Mustang → the brighter, tighter Hofner (no free Fender single-coil recordings)
  jazzBass(), // Mio's Jazz Bass → Squier Jazz Bass
  piano("hard"),
  piano("soft"),
  drums(),
];

// --- processing --------------------------------------------------------------------

async function fetchCached(repo: RepoKey, path: string): Promise<string> {
  const { repo: name, commit } = REPOS[repo];
  const local = join(CACHE, name, path);
  if (existsSync(local)) return local;
  const url = `https://raw.githubusercontent.com/sfzinstruments/${name}/${commit}/${path.split("/").map(encodeURIComponent).join("/")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  mkdirSync(dirname(local), { recursive: true });
  writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  return local;
}

function decode(file: string): Float32Array {
  const run = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", String(RATE), "pipe:1"], {
    maxBuffer: 1 << 28,
  });
  if (run.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${run.stderr}`);
  const bytes = run.stdout as Buffer;
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4).slice();
}

function encode(samples: Float32Array, out: string) {
  mkdirSync(dirname(out), { recursive: true });
  const input = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const run = spawnSync(FFMPEG, ["-v", "error", "-y", "-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-b:a", "96k", out], {
    input,
  });
  if (run.status !== 0) throw new Error(`ffmpeg could not encode ${out}: ${run.stderr}`);
}

/** Play back faster (or slower) to retune: pitch and length change together, like a smaller drum. */
function retune(x: Float32Array, semitones: number): Float32Array {
  if (!semitones) return x;
  const ratio = 2 ** (semitones / 12);
  const out = new Float32Array(Math.floor((x.length - 1) / ratio));
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const j = Math.floor(pos);
    out[i] = x[j]! + (x[j + 1]! - x[j]!) * (pos - j);
  }
  return out;
}

/** Mix, retune, cut the lead-in before the attack, trim, fade, and normalise. */
function shape(takes: { samples: Float32Array; weight: number }[], seconds: number, peak: number, fadeSeconds?: number, semitones = 0): Float32Array {
  const longest = Math.max(...takes.map((t) => t.samples.length));
  const summed = new Float32Array(longest);
  for (const { samples, weight } of takes) for (let i = 0; i < samples.length; i++) summed[i]! += samples[i]! * weight;
  const mixed = retune(summed, semitones);
  const length = mixed.length;

  let max = 0;
  for (const v of mixed) max = Math.max(max, Math.abs(v));
  // the attack starts where the signal first reaches 2% of its peak; keep 2 ms before it
  let start = mixed.findIndex((v) => Math.abs(v) >= max * 0.02);
  start = Math.max(0, start - Math.round(RATE * 0.002));
  const out = mixed.slice(start, Math.min(length, start + Math.round(seconds * RATE)));

  const gain = max > 0 ? peak / max : 0;
  const fade = Math.min(out.length, fadeSeconds === undefined ? Math.round(out.length * 0.15) : Math.round(fadeSeconds * RATE));
  for (let i = 0; i < out.length; i++) {
    const tail = out.length - i;
    out[i]! *= gain * (tail < fade ? tail / fade : 1);
  }
  return out;
}

async function main() {
  // "keys" → the main recordings; "keys:soft" → the soft layer (files in keys/soft/)
  const manifest: Record<string, Record<string, string>> = {};
  let bytes = 0;
  for (const pack of PACKS) {
    const key = pack.layer ? `${pack.instrument}:${pack.layer}` : pack.instrument;
    manifest[key] = {};
    for (const [note, take] of Object.entries(pack.notes)) {
      const decoded = await Promise.all(
        take.sources.map(async (s) => ({ samples: decode(await fetchCached(s.repo, s.path)), weight: s.weight })),
      );
      const file = pack.layer ? `${pack.layer}/${note}.mp3` : `${note}.mp3`;
      const out = join("public", "instruments", pack.instrument, file);
      encode(shape(decoded, take.seconds, take.peak, take.fade, take.semitones), out);
      bytes += readFileSync(out).byteLength;
      manifest[key]![note] = file;
    }
    console.log(`${key}: ${Object.keys(pack.notes).length} notes`);
  }

  const source = `// Generated by scripts/build-sample-packs.ts — do not edit by hand.
// Note name → file in public/instruments/<instrument>/ (CC0 sources, see CREDITS.md there).
// Keys are instrument ids, or "<instrument>:<layer>" for an extra velocity layer.
export const SAMPLE_FILES: Record<string, Record<string, string>> = ${JSON.stringify(manifest, null, 2)};
`;
  writeFileSync(join("src", "audio", "samplePacks.generated.ts"), source);
  console.log(`wrote ${(bytes / 1024 / 1024).toFixed(2)} MB of MP3`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
