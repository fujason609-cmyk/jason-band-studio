import { useCallback } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { readMidiFile } from "@/services/file/midiFileService";
import { saveMidiBlob } from "@/services/storage/projectStorage";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { buildTracksFromMapping, suggestMapping } from "./midiMapper";
import { parseMidi } from "./midiParser";

export function useMidiImport() {
  const openFile = useCallback(async (file: File) => {
    const studio = useStudioStore.getState();
    try {
      const data = await readMidiFile(file);
      const parsed = parseMidi(data, file.name);
      const { assignments } = suggestMapping(parsed);
      studio.notify(null);
      studio.setPendingImport({ parsed, assignments, data });
    } catch (err) {
      studio.notify({ kind: "error", text: err instanceof Error ? err.message : "That file couldn't be opened." });
    }
  }, []);

  const confirm = useCallback(async () => {
    const studio = useStudioStore.getState();
    const pending = studio.pendingImport;
    if (!pending) return;
    const projectStore = useProjectStore.getState();
    const song = buildTracksFromMapping(pending.parsed, pending.assignments, projectStore.project.tracks);

    const blobKey = `midi-${Date.now()}`;
    let storedKey: string | undefined = blobKey;
    try {
      await saveMidiBlob(blobKey, pending.data);
    } catch {
      storedKey = undefined; // the song still plays; only the original file isn't kept
    }

    audioEngine.stop();
    studio.setTransport("stopped");
    projectStore.loadSong({
      name: pending.parsed.meta.fileName.replace(/\.(mid|midi)$/i, ""),
      tracks: song.tracks,
      baseBpm: song.baseBpm,
      beatsPerBar: song.beatsPerBar,
      midiMeta: pending.parsed.meta,
      midiBlobKey: storedKey,
    });
    const left = pending.assignments.filter((a) => a.memberId === null).length;
    studio.setPendingImport(null);
    studio.notify({
      kind: "info",
      text: left > 0
        ? `Loaded ${pending.parsed.meta.fileName}. ${left} track${left === 1 ? "" : "s"} left out.`
        : `Loaded ${pending.parsed.meta.fileName}.`,
    });
  }, []);

  const cancel = useCallback(() => useStudioStore.getState().setPendingImport(null), []);

  return { openFile, confirm, cancel };
}
