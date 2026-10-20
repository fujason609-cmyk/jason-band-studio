import { TIMELINE_GUTTER } from "@/features/timeline/layout";
import { cameraLeft } from "./drawRecordFrame";
import { pickRecordingType, recordingFileName } from "./frameRecorder";

describe("video recording", () => {
  it("prefers MP4 (what Instagram takes) and falls back to WebM", () => {
    expect(pickRecordingType(() => true)).toEqual({ mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" });
    expect(pickRecordingType((t) => t.startsWith("video/webm"))).toEqual({ mimeType: "video/webm;codecs=vp9,opus", extension: "webm" });
    expect(pickRecordingType(() => false)).toBeNull();
  });

  it("names the file after the song, the frame and the time", () => {
    const when = new Date(2026, 9, 20, 15, 7);
    expect(recordingFileName("After School Jam (demo)", "9:16", "mp4", when)).toBe("After-School-Jam-(demo)_9x16_20261020-1507.mp4");
    expect(recordingFileName('a/b:c*?"<>|', "4:5", "webm", when)).toBe("abc_4x5_20261020-1507.webm");
    expect(recordingFileName("   ", "1:1", "mp4", when)).toBe("band-studio_1x1_20261020-1507.mp4");
  });

  it("keeps the playhead 30% in from the left, clamped to the song", () => {
    const width = 390;
    const zoom = 60;
    expect(cameraLeft(0, zoom, width, 100)).toBe(0); // start of the song: no negative scroll
    const mid = cameraLeft(50, zoom, width, 100);
    expect(TIMELINE_GUTTER + 50 * zoom - mid).toBeCloseTo(width * 0.3);
    const content = TIMELINE_GUTTER * 2 + 100 * zoom;
    expect(cameraLeft(100, zoom, width, 100)).toBe(content - width); // end of the song: no scrolling past it
  });
});
