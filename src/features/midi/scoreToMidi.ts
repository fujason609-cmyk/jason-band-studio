/**
 * Guitar Pro and MusicXML → Standard MIDI File, so a score goes through the same
 * import as a .mid (track mapping dialog, timeline, mixer). alphaTab reads the score
 * (tunings, capos, tempo changes, repeats, drum articulations become real MIDI notes)
 * and its MIDI generator plays it out. It is large, so this module is only loaded,
 * with a dynamic import, when such a file is opened.
 */
import * as alphaTab from "@coderline/alphatab";

export interface ConvertedScore {
  midi: Uint8Array;
  /** score title, when the file has one */
  title: string;
  /** MIDI channel → the score track's name, to label the tracks in the mapping dialog */
  trackNames: Record<number, string>;
}

// The import shows its own message when a file can't be read; alphaTab's console dump would only add noise.
alphaTab.Logger.logLevel = alphaTab.LogLevel.None;

/** Score text can carry non-breaking or doubled spaces; show it as plain words. */
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

export function scoreToMidi(data: Uint8Array): ConvertedScore {
  const settings = new alphaTab.Settings();
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(data, settings);

  const file = new alphaTab.midi.MidiFile();
  file.format = alphaTab.midi.MidiFileFormat.MultiTrack;
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(file, true);
  new alphaTab.midi.MidiFileGenerator(score, settings, handler).generate();

  const trackNames: Record<number, string> = {};
  for (const track of score.tracks) {
    const name = clean(track.name) || clean(track.shortName);
    if (name) {
      trackNames[track.playbackInfo.primaryChannel] = name;
      trackNames[track.playbackInfo.secondaryChannel] ??= name;
    }
  }
  return { midi: file.toBinary(), title: clean(score.title), trackNames };
}
