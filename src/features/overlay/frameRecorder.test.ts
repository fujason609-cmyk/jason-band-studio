import { pickRecordingType, recordingFileName, videoBitrate } from "./frameRecorder";

describe("video recording", () => {
  it("prefers MP4 (what Instagram takes) and falls back to WebM", () => {
    expect(pickRecordingType(() => true)).toEqual({ mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" });
    expect(pickRecordingType((t) => t.startsWith("video/webm"))).toEqual({ mimeType: "video/webm;codecs=vp9,opus", extension: "webm" });
    expect(pickRecordingType(() => false)).toBeNull();
  });

  it("gives a 60 fps video more bits than a 30 fps one", () => {
    expect(videoBitrate(30)).toBe(6_000_000);
    expect(videoBitrate(60)).toBeGreaterThan(videoBitrate(30));
  });

  it("names the file after the song, the frame and the time", () => {
    const when = new Date(2026, 9, 20, 15, 7);
    expect(recordingFileName("After School Jam (demo)", "9:16", "mp4", when)).toBe("After-School-Jam-(demo)_9x16_20261020-1507.mp4");
    expect(recordingFileName('a/b:c*?"<>|', "4:5", "webm", when)).toBe("abc_4x5_20261020-1507.webm");
    expect(recordingFileName("   ", "1:1", "mp4", when)).toBe("band-studio_1x1_20261020-1507.mp4");
  });
});
