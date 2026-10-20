import { act, renderHook } from "@testing-library/react";
import { TWO_PART_MUSICXML } from "@/test/scores";
import { SONG_FILE_ACCEPT, songFileAccept, songFormat, songTitleFromFileName } from "@/services/file/midiFileService";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import { useMidiImport } from "./useMidiImport";

vi.mock("@/audio/AudioEngine", () => ({ audioEngine: { stop: vi.fn() } }));

describe("song file formats", () => {
  it("knows MIDI, Guitar Pro and MusicXML by their file names", () => {
    expect(songFormat("song.mid")).toBe("midi");
    expect(songFormat("Song.MIDI")).toBe("midi");
    for (const name of ["a.gp", "a.gp3", "a.gp4", "a.gp5", "a.gpx", "a.musicxml", "a.mxl", "a.xml"]) {
      expect(songFormat(name)).toBe("score");
    }
    expect(songFormat("song.mp3")).toBeNull();
    expect(songTitleFromFileName("Fuwa Fuwa Time.gp5")).toBe("Fuwa Fuwa Time");
  });

  it("lets phones pick any file (iOS greys out .gp5 whatever the filter says), and filters on computers", () => {
    const iPhone = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15", maxTouchPoints: 5 };
    const iPad = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", maxTouchPoints: 5 };
    const android = { userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130", maxTouchPoints: 5 };
    const mac = { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15", maxTouchPoints: 0 };
    const windows = { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130", maxTouchPoints: 0 };
    expect(songFileAccept(iPhone)).toBeUndefined();
    expect(songFileAccept(iPad)).toBeUndefined();
    expect(songFileAccept(android)).toBeUndefined();
    expect(songFileAccept(mac)).toBe(SONG_FILE_ACCEPT);
    expect(songFileAccept(windows)).toContain(".gp5");
  });
});

describe("importing a score", () => {
  beforeEach(() => useStudioStore.setState({ pendingImport: null, notice: null, settings: { ...DEFAULT_SETTINGS, language: "en" } }));

  it("converts a MusicXML file and offers its parts by name, with the score's title", async () => {
    const { result } = renderHook(() => useMidiImport());
    const file = new File([TWO_PART_MUSICXML], "test.musicxml", { type: "application/xml" });
    await act(() => result.current.openFile(file));
    const pending = useStudioStore.getState().pendingImport!;
    expect(pending.title).toBe("Test Song");
    expect(pending.parsed.tracks.map((t) => t.name).sort()).toEqual(["Bass", "Piano"]);
    // the bass part goes to Mio by its General MIDI program, as for any MIDI file
    const bass = pending.parsed.tracks.find((t) => t.name === "Bass")!;
    expect(pending.assignments.find((a) => a.midiTrackIndex === bass.index)?.memberId).toBe("mio");
    expect(useStudioStore.getState().notice).toBeNull();
  });

  it("explains a file it can't read", async () => {
    const { result } = renderHook(() => useMidiImport());
    await act(() => result.current.openFile(new File(["not a score"], "broken.gp5")));
    expect(useStudioStore.getState().pendingImport).toBeNull();
    expect(useStudioStore.getState().notice?.text).toMatch(/couldn't be read as a Guitar Pro or MusicXML score/);
  });

  it("names the formats it reads when given something else", async () => {
    const { result } = renderHook(() => useMidiImport());
    await act(() => result.current.openFile(new File(["x"], "song.mp3")));
    expect(useStudioStore.getState().notice?.text).toMatch(/MIDI \(\.mid\), Guitar Pro/);
  });
});
