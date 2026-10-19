import type { StudioProject } from "@/types/project";
import { STORE_MIDI, STORE_PROJECTS, idbDelete, idbGet, idbPut } from "./idb";
import { validateProject } from "./projectValidation";

const CURRENT = "current";

export type LoadResult =
  | { kind: "empty" }
  | { kind: "ok"; project: StudioProject }
  | { kind: "corrupt" }
  | { kind: "unavailable" };

export async function loadCurrentProject(): Promise<LoadResult> {
  let raw: unknown;
  try {
    raw = await idbGet(STORE_PROJECTS, CURRENT);
  } catch {
    return { kind: "unavailable" };
  }
  if (raw === undefined) return { kind: "empty" };
  const project = validateProject(raw);
  return project ? { kind: "ok", project } : { kind: "corrupt" };
}

export async function saveCurrentProject(project: StudioProject): Promise<void> {
  await idbPut(STORE_PROJECTS, CURRENT, project);
}

export async function clearCurrentProject(): Promise<void> {
  await idbDelete(STORE_PROJECTS, CURRENT);
}

/** The original MIDI file is kept as a Blob, never inside the project JSON. */
export async function saveMidiBlob(key: string, data: ArrayBuffer): Promise<void> {
  await idbPut(STORE_MIDI, key, new Blob([data], { type: "audio/midi" }));
}

export async function loadMidiBlob(key: string): Promise<Blob | undefined> {
  return idbGet<Blob>(STORE_MIDI, key);
}
