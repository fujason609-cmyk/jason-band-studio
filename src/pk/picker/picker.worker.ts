/// <reference lib="webworker" />
import type { StudioProject } from "@/types/project";
import { battleClip, battleInput } from "../sim/songInput";
import type { BattleInput, Side } from "../types";
import { runLab } from "./lab";
import { pickFights } from "./score";

/** Runs the picker and the balance lab off the page's thread, so the page never stalls. */
export type PickerJob =
  | { kind: "pick"; input: Omit<BattleInput, "seed">; firstSeed: number; count: number; winner: Side | null }
  | { kind: "lab"; songs: StudioProject[]; seeds: number };
export type PickerRequest = PickerJob & { id: number };

self.onmessage = (e: MessageEvent<PickerRequest>) => {
  const m = e.data;
  if (m.kind === "pick") {
    postMessage({ id: m.id, kind: "done", value: pickFights(m.input, m.firstSeed, m.count, m.winner) });
  } else {
    const clips = new Map(m.songs.map((s) => [s, battleClip(s)]));
    const report = runLab(m.songs, (s, a, b) => battleInput(s, a, b, 0, clips.get(s)), m.seeds, (done, total) =>
      postMessage({ id: m.id, kind: "progress", done, total }),
    );
    postMessage({ id: m.id, kind: "done", value: report });
  }
};
