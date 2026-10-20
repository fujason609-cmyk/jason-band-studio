/**
 * Guitar Pro and MusicXML → Standard MIDI File, so a score goes through the same
 * import as a .mid (track mapping dialog, timeline, mixer). alphaTab reads the score
 * (tunings, capos, tempo changes, repeats, drum articulations become real MIDI notes)
 * and its MIDI generator plays it out. It is large, so this module is only loaded,
 * with a dynamic import, when such a file is opened.
 */
import * as alphaTab from "@coderline/alphatab";

export interface ConvertedScore {
  /** one MIDI track per score part, named after the part */
  midi: Uint8Array;
  /** score title, when the file has one */
  title: string;
}

// The import shows its own message when a file can't be read; alphaTab's console dump would only add noise.
alphaTab.Logger.logLevel = alphaTab.LogLevel.None;

/**
 * Some Guitar Pro 5 writers (Songsterr's GP5 converter among them) store an unused second
 * voice as zero beats. alphaTab then leaves that voice out of the bar, so bars of one staff
 * end up with different voice counts, and linking beats across bars fails ("Cannot read
 * properties of undefined (reading 'beats')"). Before alphaTab links the score, give every
 * bar as many voices as the busiest bar of its staff, each padded with one empty beat:
 * what alphaTab already does for bars missing from a track.
 */
export function padVoices(score: alphaTab.model.Score) {
  for (const track of score.tracks) {
    for (const staff of track.staves) {
      const voices = Math.max(1, ...staff.bars.map((b) => b.voices.length));
      for (const bar of staff.bars) {
        while (bar.voices.length < voices) {
          const voice = new alphaTab.model.Voice();
          bar.addVoice(voice);
          const empty = new alphaTab.model.Beat();
          empty.isEmpty = true;
          voice.addBeat(empty);
        }
      }
    }
  }
}

const finishScore = alphaTab.model.Score.prototype.finish;
alphaTab.model.Score.prototype.finish = function (this: alphaTab.model.Score, settings: alphaTab.Settings) {
  padVoices(this);
  finishScore.call(this, settings);
};

const DRUM_CHANNEL = 9;

function* beatsOf(track: alphaTab.model.Track) {
  for (const staff of track.staves) for (const bar of staff.bars) for (const voice of bar.voices) yield* voice.beats;
}

/**
 * One MIDI channel per part (drums on channel 10), set here rather than taken from the
 * file: converted files can point every part at the same channel, even one above 15,
 * which merges the parts or writes broken MIDI (in a GP5 file alphaTab then hands all the
 * parts one shared playback object, so each part gets its own copy first; its instrument
 * is then one guess for every part, as are the instrument changes such files put in the
 * first bar, so both are cleared and the part names decide). Past 15 melodic parts
 * channels are reused; the parts still stay apart, one MIDI track each.
 */
export function assignChannels(score: alphaTab.model.Score) {
  const users = new Map<alphaTab.model.PlaybackInformation, number>();
  for (const track of score.tracks) users.set(track.playbackInfo, (users.get(track.playbackInfo) ?? 0) + 1);
  let next = 0;
  for (const track of score.tracks) {
    const shared = (users.get(track.playbackInfo) ?? 0) > 1;
    track.playbackInfo = Object.assign(new alphaTab.model.PlaybackInformation(), track.playbackInfo);
    if (shared) {
      track.playbackInfo.program = 0;
      for (const beat of beatsOf(track)) {
        beat.automations = beat.automations.filter((a) => a.type !== alphaTab.model.AutomationType.Instrument);
      }
    }
    let channel = DRUM_CHANNEL;
    if (!track.staves.some((s) => s.isPercussion)) {
      channel = next % 15;
      if (channel >= DRUM_CHANNEL) channel += 1;
      next += 1;
    }
    // bends would get a second channel; the studio plays notes only, so one is enough
    track.playbackInfo.primaryChannel = channel;
    track.playbackInfo.secondaryChannel = channel;
  }
}

function variableLength(value: number): number[] {
  const out = [value & 0x7f];
  for (let v = value >> 7; v > 0; v >>= 7) out.unshift((v & 0x7f) | 0x80);
  return out;
}

/** An MTrk chunk holding only "end of track". */
const EMPTY_TRACK = [0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 4, 0x00, 0xff, 0x2f, 0x00];

/**
 * Put a track-name event (UTF-8) at the start of each MTrk chunk of a multi-track MIDI
 * file (`names[i]` names the i-th track; empty names are skipped), behind a new empty
 * first track. The MIDI reader drops a first track without notes, and splits a track at
 * its first program change, which leaves a part's name on a note-less first piece: for
 * the first part, that piece would be the dropped track.
 */
export function nameMidiTracks(midi: Uint8Array, names: readonly string[]): Uint8Array {
  const view = new DataView(midi.buffer, midi.byteOffset, midi.byteLength);
  let offset = 8 + view.getUint32(4); // after the MThd chunk
  const header = midi.slice(0, offset);
  new DataView(header.buffer).setUint16(10, view.getUint16(10) + 1); // one more track
  const parts: Uint8Array[] = [header, new Uint8Array(EMPTY_TRACK)];
  for (let track = 0; offset + 8 <= midi.length; track++) {
    const length = view.getUint32(offset + 4);
    const name = new TextEncoder().encode(names[track] ?? "");
    const event = name.length ? [0x00, 0xff, 0x03, ...variableLength(name.length), ...name] : [];
    const head = midi.slice(offset, offset + 8); // "MTrk" + length
    new DataView(head.buffer).setUint32(4, length + event.length);
    parts.push(head, new Uint8Array(event), midi.subarray(offset + 8, offset + 8 + length));
    offset += 8 + length;
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Score text can carry non-breaking or doubled spaces; show it as plain words. */
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function scoreToMidi(data: Uint8Array): ConvertedScore {
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(data, settings);
  assignChannels(score);

  const file = new alphaTab.midi.MidiFile();
  file.format = alphaTab.midi.MidiFileFormat.MultiTrack;
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(file, true);
  new alphaTab.midi.MidiFileGenerator(score, settings, handler).generate();

  // alphaTab writes score track i as MIDI track i, without a name
  const names = score.tracks.map((t) => clean(t.name) || clean(t.shortName));
  return { midi: nameMidiTracks(file.toBinary(), names), title: clean(score.title) };
}
