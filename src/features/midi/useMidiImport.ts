import { useCallback } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { getT } from "@/i18n/useT";
import { MidiFileError, readSongFile, songTitleFromFileName } from "@/services/file/midiFileService";
import { saveMidiBlob } from "@/services/storage/projectStorage";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { buildTracksFromMapping, suggestMapping } from "./midiMapper";
import { MidiParseError, parseMidi } from "./midiParser";
import type { ParsedMidi } from "@/types/midi";

function describeError(err: unknown): string {
  const t = getT();
  if (err instanceof MidiFileError || err instanceof MidiParseError) return t.midiError[err.code](err.fileName);
  return t.couldNotOpen;
}

/** Guitar Pro / MusicXML → MIDI (one named track per part), with alphaTab loaded only now (it's large). */
async function convertScore(data: ArrayBuffer, fileName: string) {
  try {
    const { scoreToMidi } = await import("./scoreToMidi");
    const converted = scoreToMidi(new Uint8Array(data));
    const midi = converted.midi;
    return { ...converted, data: midi.buffer.slice(midi.byteOffset, midi.byteOffset + midi.byteLength) as ArrayBuffer };
  } catch {
    throw new MidiFileError("unreadable-score", fileName, `${fileName} couldn't be read as a Guitar Pro or MusicXML score.`);
  }
}

/**
 * Program 0 on a converted score usually means "the file didn't say" (MusicXML often
 * doesn't), so its General MIDI name ("acoustic grand piano") would mislead in the
 * mapping dialog: drop it. The part names themselves come with the converted MIDI.
 */
function dropGuessedInstruments(parsed: ParsedMidi): ParsedMidi {
  return {
    ...parsed,
    tracks: parsed.tracks.map((t) => (t.program === 0 && !t.isPercussion ? { ...t, instrumentName: "" } : t)),
  };
}

export function useMidiImport() {
  const openFile = useCallback(async (file: File) => {
    const studio = useStudioStore.getState();
    try {
      const song = await readSongFile(file);
      let data = song.data;
      let title: string | undefined;
      if (song.format === "score") {
        studio.notify({ kind: "info", text: getT().readingScore(file.name) });
        const converted = await convertScore(song.data, file.name);
        data = converted.data;
        title = converted.title || undefined;
      }
      const midi = parseMidi(data, file.name);
      const parsed = song.format === "score" ? dropGuessedInstruments(midi) : midi;
      const { assignments } = suggestMapping(parsed);
      studio.notify(null);
      studio.setPendingImport({ parsed, assignments, data, title });
    } catch (err) {
      studio.notify({ kind: "error", text: describeError(err) });
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
      name: pending.title ?? songTitleFromFileName(pending.parsed.meta.fileName),
      tracks: song.tracks,
      baseBpm: song.baseBpm,
      beatsPerBar: song.beatsPerBar,
      midiMeta: pending.parsed.meta,
      midiBlobKey: storedKey,
    });
    const left = pending.assignments.filter((a) => a.memberId === null).length;
    studio.setPendingImport(null);
    const t = getT();
    const file = pending.parsed.meta.fileName;
    studio.notify({ kind: "info", text: left > 0 ? t.loadedLeftOut(file, left) : t.loaded(file) });
  }, []);

  const cancel = useCallback(() => useStudioStore.getState().setPendingImport(null), []);

  return { openFile, confirm, cancel };
}
