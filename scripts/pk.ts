/**
 * PK mode from the terminal, for tuning roster.ts without a browser.
 *   pnpm pk sim <song.gp5|.mid|demo> <left> <right> [seed]   print one fight's event timeline
 *   pnpm pk lab [seeds] <song> [song…]                          the balance lab over these songs
 *   pnpm pk pick <song> <left> <right> [count]                  the picker's best fights
 *   pnpm pk parts <song> [song…]                                each member's notes in the fought clip
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { buildTracksFromMapping, suggestMapping } from "../src/features/midi/midiMapper";
import { parseMidi } from "../src/features/midi/midiParser";
import { scoreToMidi } from "../src/features/midi/scoreToMidi";
import { runLab, TARGETS } from "../src/pk/picker/lab";
import { pickFights } from "../src/pk/picker/score";
import { FIGHTER_ORDER } from "../src/pk/roster";
import { simulate } from "../src/pk/sim/simulate";
import { battleClip, battleInput } from "../src/pk/sim/songInput";
import type { MemberId } from "../src/pk/types";
import { clampBpm } from "../src/lib/time";
import { createDemoProject, songLength } from "../src/stores/useProjectStore";
import type { StudioProject } from "../src/types/project";

function load(file: string): StudioProject {
  if (file === "demo") return createDemoProject();
  const bytes = new Uint8Array(readFileSync(file));
  const midi = /\.midi?$/i.test(file) ? bytes : scoreToMidi(bytes).midi;
  const parsed = parseMidi(midi, basename(file));
  const song = buildTracksFromMapping(parsed, suggestMapping(parsed).assignments);
  // as useProjectStore.loadSong builds it
  return {
    ...createDemoProject(),
    name: basename(file).replace(/\.\w+$/, ""),
    ...song,
    bpm: clampBpm(song.baseBpm),
    durationSeconds: songLength(song.tracks, song.baseBpm, song.beatsPerBar),
    midiMeta: parsed.meta,
  };
}

const member = (s: string | undefined): MemberId => {
  const m = FIGHTER_ORDER.find((id) => id === s || (s === "mugi" && id === "tsumugi"));
  if (!m) throw new Error(`member must be one of ${FIGHTER_ORDER.join(", ")}`);
  return m;
};
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "sim") {
  const [file, l, r, seed = "1"] = args;
  const project = load(file!);
  const clip = battleClip(project);
  const result = simulate(battleInput(project, member(l), member(r), Number(seed), clip));
  console.log(`${project.name}: bars ${clip.bars} from ${clip.start.toFixed(1)} s, ${result.input.notes.length} notes`);
  for (const e of result.events) {
    if (e.type === "noteSpawn") continue;
    const { t, type, ...rest } = e;
    console.log(t.toFixed(2).padStart(7), type.padEnd(9), JSON.stringify(rest, (_, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v)));
  }
  console.log("winner", result.winner, "ko", result.koTime?.toFixed(2) ?? "TIME UP");
} else if (cmd === "pick") {
  const [file, l, r, count = "500"] = args;
  const project = load(file!);
  const input = battleInput(project, member(l), member(r), 0);
  console.time("pick");
  const best = pickFights(input, 1, Number(count));
  console.timeEnd("pick");
  for (const p of best) console.log(p.seed, p.winner, p.koTime?.toFixed(2), p.score.total.toFixed(3), JSON.stringify(p.score, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
} else if (cmd === "lab") {
  const seeds = Number.isFinite(Number(args[0])) ? Number(args.shift()) : 200;
  const songs = args.map(load);
  const clips = new Map(songs.map((s) => [s, battleClip(s)]));
  console.time("lab");
  const r = runLab(songs, (s, a, b) => battleInput(s, a, b, 0, clips.get(s)), seeds);
  console.timeEnd("lab");
  console.log(`${r.fights} fights`);
  console.log("        " + FIGHTER_ORDER.map((m) => m.padStart(8)).join(""));
  for (const a of FIGHTER_ORDER) console.log(a.padEnd(8) + FIGHTER_ORDER.map((b) => (a === b ? "-" : pct(r.wins[a][b]!)).padStart(8)).join(""));
  const off = Object.entries(r.wins).flatMap(([a, row]) => Object.entries(row).filter(([, v]) => v! < TARGETS.winRate[0] || v! > TARGETS.winRate[1]).map(([b, v]) => `${a}>${b} ${pct(v!)}`));
  console.log("win rates outside 35–65%:", off.length ? off.join(", ") : "none");
  console.log(`mean KO at ${pct(r.meanKoShare)} of the clip; KO in 80–95%: ${pct(r.koInWindow)} (want > 60%)`);
  console.log(`song by song: ${pct(r.songPairsInRange)} of the (song, pair) win rates in 35–65% (want > ${pct(TARGETS.songPairsInRange)}); worst: ${r.worst ? `${songs[r.worst.song]!.name} ${r.worst.winner}>${r.worst.loser} ${pct(r.worst.rate)}` : "-"}`);
  console.log(`TIME UP: ${pct(r.timeUpRate)} (want < 10%); a comeback: ${pct(r.comebackRate)} (want > 50%), ${r.meanChanges.toFixed(2)} lead changes; both specials: ${pct(r.bothSpecials)} (want > 70%)`);
} else if (cmd === "parts") {
  for (const file of args) {
    const project = load(file);
    const clip = battleClip(project);
    const input = battleInput(project, "yui", "mio", 0, clip);
    const counts = FIGHTER_ORDER.map((m) => {
      const i = battleInput(project, m, m === "yui" ? "mio" : "yui", 0, clip);
      const mine = i.notes.filter((n) => n.lane === m);
      return `${m} ${mine.length}${project.tracks.find((t) => t.memberId === m)?.notes.length ? "" : "*"}`;
    });
    console.log(project.name.slice(0, 40).padEnd(40), `${clip.bars} bars @${(clip.start).toFixed(1)}s`, input.sections.map((s) => `${s.kind}:${s.start.toFixed(1)}-${s.end.toFixed(1)}`).join(" "), "|", counts.join(", "));
  }
} else {
  console.log("usage: pnpm pk sim|pick|lab|parts …");
}
