import { useCallback, useEffect, useRef } from "react";
import type { StudioProject } from "@/types/project";
import { battleClip, battleInput } from "../sim/songInput";
import type { BattleInput, Side } from "../types";
import { runLab, type LabReport } from "./lab";
import type { PickerJob, PickerRequest } from "./picker.worker";
import { pickFights, type PickedFight } from "./score";

type Pending = { resolve: (v: never) => void; progress?: (done: number, total: number) => void };

/**
 * The picker and the lab, run in a Web Worker (in place, a step at a time, where there is
 * none: tests). Both are pure number crunching: 500 fights take well under a second.
 */
export function usePicker() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const next = useRef(0);
  useEffect(
    () => () => {
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );
  const ask = useCallback(<T,>(req: PickerJob, progress?: Pending["progress"]): Promise<T> => {
    if (typeof Worker === "undefined") {
      // no worker: run it here, after the click has been painted
      return new Promise((resolve) =>
        setTimeout(() => {
          if (req.kind === "pick") resolve(pickFights(req.input, req.firstSeed, req.count, req.winner) as T);
          else {
            const clips = new Map(req.songs.map((s) => [s, battleClip(s)]));
            resolve(runLab(req.songs, (s, a, b) => battleInput(s, a, b, 0, clips.get(s)), req.seeds, progress) as T);
          }
        }, 0),
      );
    }
    if (!worker.current) {
      worker.current = new Worker(new URL("./picker.worker.ts", import.meta.url), { type: "module" });
      worker.current.onmessage = (e: MessageEvent<{ id: number; kind: "done" | "progress"; value?: unknown; done?: number; total?: number }>) => {
        const p = pending.current.get(e.data.id);
        if (!p) return;
        if (e.data.kind === "progress") p.progress?.(e.data.done!, e.data.total!);
        else {
          pending.current.delete(e.data.id);
          p.resolve(e.data.value as never);
        }
      };
    }
    const id = ++next.current;
    return new Promise<T>((resolve) => {
      pending.current.set(id, { resolve: resolve as Pending["resolve"], progress });
      worker.current!.postMessage({ ...req, id } as PickerRequest);
    });
  }, []);
  const pick = useCallback(
    (input: Omit<BattleInput, "seed">, firstSeed: number, count: number, winner: Side | null) =>
      ask<PickedFight[]>({ kind: "pick", input, firstSeed, count, winner }),
    [ask],
  );
  const lab = useCallback(
    (songs: StudioProject[], seeds: number, progress?: (done: number, total: number) => void) =>
      ask<LabReport>({ kind: "lab", songs, seeds }, progress),
    [ask],
  );
  return { pick, lab };
}
