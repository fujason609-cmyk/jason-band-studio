export const MAX_MIDI_BYTES = 5 * 1024 * 1024;

/**
 * What a song file is: a Standard MIDI File, or a score (Guitar Pro 3–8, MusicXML)
 * that is converted to MIDI on import (features/midi/scoreToMidi.ts).
 */
export type SongFormat = "midi" | "score";

const MIDI_NAME = /\.(mid|midi)$/i;
const SCORE_NAME = /\.(gp|gp3|gp4|gp5|gpx|musicxml|mxl|xml)$/i;

/** For the file picker. */
export const SONG_FILE_ACCEPT = ".mid,.midi,audio/midi,audio/x-midi,.gp,.gp3,.gp4,.gp5,.gpx,.musicxml,.mxl,.xml";

/**
 * The picker's `accept` for this device. Phones filter by the file types the system
 * knows, and iOS doesn't know Guitar Pro or .mxl files, so they come up greyed out
 * however `accept` lists them: there, any file can be picked, and `readSongFile`
 * explains when one isn't a song. Computers keep the filter.
 */
export function songFileAccept(nav: Pick<Navigator, "userAgent" | "maxTouchPoints"> = navigator): string | undefined {
  const phone = /iPhone|iPad|iPod|Android/i.test(nav.userAgent);
  // iPadOS reports itself as a Mac, but a Mac has no touch screen
  const iPad = /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
  return phone || iPad ? undefined : SONG_FILE_ACCEPT;
}

export type MidiFileErrorCode = "unsupported" | "empty" | "too-large" | "unreadable-score";

export class MidiFileError extends Error {
  constructor(
    readonly code: MidiFileErrorCode,
    readonly fileName: string,
    message: string,
  ) {
    super(message);
    this.name = "MidiFileError";
  }
}

export function songFormat(name: string): SongFormat | null {
  if (MIDI_NAME.test(name)) return "midi";
  if (SCORE_NAME.test(name)) return "score";
  return null;
}

/** "Fuwa Fuwa Time.gp5" → "Fuwa Fuwa Time" */
export function songTitleFromFileName(name: string): string {
  return name.replace(/\.(mid|midi|gp|gp3|gp4|gp5|gpx|musicxml|mxl|xml)$/i, "");
}

/** Validate a picked file and read it into memory. */
export async function readSongFile(file: File): Promise<{ data: ArrayBuffer; format: SongFormat }> {
  const format = songFormat(file.name);
  if (!format) {
    throw new MidiFileError("unsupported", file.name, `${file.name} isn't a MIDI, Guitar Pro or MusicXML file.`);
  }
  if (file.size === 0) throw new MidiFileError("empty", file.name, `${file.name} is empty.`);
  if (file.size > MAX_MIDI_BYTES) {
    throw new MidiFileError("too-large", file.name, `${file.name} is larger than 5 MB. Choose a smaller file.`);
  }
  return { data: await file.arrayBuffer(), format };
}
