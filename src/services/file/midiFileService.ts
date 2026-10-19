export const MAX_MIDI_BYTES = 5 * 1024 * 1024;

export class MidiFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MidiFileError";
  }
}

export function isMidiFileName(name: string): boolean {
  return /\.(mid|midi)$/i.test(name);
}

/** Validate a picked file and read it into memory. */
export async function readMidiFile(file: File): Promise<ArrayBuffer> {
  if (!isMidiFileName(file.name)) {
    throw new MidiFileError(`${file.name} isn't a MIDI file. Choose a file ending in .mid or .midi.`);
  }
  if (file.size === 0) throw new MidiFileError(`${file.name} is empty.`);
  if (file.size > MAX_MIDI_BYTES) {
    throw new MidiFileError(`${file.name} is larger than 5 MB. Choose a smaller MIDI file.`);
  }
  return file.arrayBuffer();
}
