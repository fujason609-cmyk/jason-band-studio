import { Midi } from "@tonejs/midi";
import type { NoteEvent, ParsedMidi, ParsedMidiTrack } from "@/types/midi";

export type MidiParseErrorCode = "unreadable" | "no-notes";

export class MidiParseError extends Error {
  constructor(
    readonly code: MidiParseErrorCode,
    readonly fileName: string,
    message: string,
  ) {
    super(message);
    this.name = "MidiParseError";
  }
}

/**
 * MIDI text is bytes; the MIDI reader gives one character per byte. Most files today write
 * UTF-8 (and score imports always do), so decode it as that, and keep the bytes as they
 * are when they aren't UTF-8.
 */
export function decodeMidiText(text: string): string {
  if (![...text].some((c) => c.charCodeAt(0) >= 0x80)) return text;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(text, (c) => c.charCodeAt(0)));
  } catch {
    return text;
  }
}

/**
 * The MIDI reader splits a track at its first program change. When a track sets volume
 * and pan before choosing its instrument, its name stays on that note-less first piece
 * (whose channel reads as 0, since the reader takes it from notes): an unnamed track
 * right after a named one without notes gets that name back.
 */
function trackNames(tracks: readonly Midi["tracks"][number][]): string[] {
  return tracks.map((track, i) => {
    const own = decodeMidiText(track.name.trim());
    const before = tracks[i - 1];
    if (own || !before || before.notes.length > 0) return own;
    return decodeMidiText(before.name.trim());
  });
}

/** Parse a Standard MIDI File into note events in song seconds, keeping timing metadata. */
export function parseMidi(data: ArrayBuffer | Uint8Array, fileName: string): ParsedMidi {
  let midi: Midi;
  try {
    midi = new Midi(data);
  } catch {
    throw new MidiParseError(
      "unreadable",
      fileName,
      `${fileName} isn't a readable MIDI file. Export it again as a Standard MIDI File (.mid) and try once more.`,
    );
  }

  const names = trackNames(midi.tracks);
  const tracks: ParsedMidiTrack[] = midi.tracks
    .map((track, index): ParsedMidiTrack => {
      const notes: NoteEvent[] = track.notes
        .filter((n) => n.duration > 0 || track.instrument.percussion)
        .map((n) => ({
          pitch: n.midi,
          start: n.time,
          duration: Math.max(n.duration, 0.05),
          velocity: n.velocity,
        }))
        .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
      const percussion = track.instrument.percussion || track.channel === 9;
      return {
        index,
        name: names[index] || `Track ${index + 1}`,
        channel: track.channel,
        program: track.instrument.number,
        instrumentName: percussion ? "drum kit" : track.instrument.name,
        isPercussion: percussion,
        notes,
      };
    })
    .filter((t) => t.notes.length > 0);

  if (tracks.length === 0) {
    throw new MidiParseError("no-notes", fileName, `${fileName} has no notes to play. Pick a MIDI file that contains note data.`);
  }

  const tempos = midi.header.tempos.map((t) => ({
    ticks: t.ticks,
    bpm: t.bpm,
    time: t.time ?? midi.header.ticksToSeconds(t.ticks),
  }));
  const timeSignatures = midi.header.timeSignatures.map((ts) => ({
    ticks: ts.ticks,
    numerator: ts.timeSignature[0] ?? 4,
    denominator: ts.timeSignature[1] ?? 4,
  }));

  const lastNoteEnd = Math.max(...tracks.flatMap((t) => t.notes.map((n) => n.start + n.duration)));

  return {
    meta: {
      fileName,
      ppq: midi.header.ppq,
      tempos,
      timeSignatures,
      durationSeconds: Math.max(lastNoteEnd, 0.1),
    },
    tracks,
  };
}
