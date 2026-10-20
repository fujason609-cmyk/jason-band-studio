/**
 * Records a canvas plus an audio stream into a video file with MediaRecorder. The
 * canvas is drawn by the app itself, so the video holds exactly the recording frame
 * (no other page, no notifications), and the audio is the band's own output.
 */

/** Container / codec choices, best first: MP4 is what Instagram takes directly. */
const CANDIDATES: [mimeType: string, extension: "mp4" | "webm"][] = [
  ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "mp4"],
  ["video/mp4", "mp4"],
  ["video/webm;codecs=vp9,opus", "webm"],
  ["video/webm;codecs=vp8,opus", "webm"],
  ["video/webm", "webm"],
];

export function pickRecordingType(
  isSupported: (type: string) => boolean = (t) => MediaRecorder.isTypeSupported(t),
): { mimeType: string; extension: "mp4" | "webm" } | null {
  const found = CANDIDATES.find(([type]) => isSupported(type));
  return found ? { mimeType: found[0], extension: found[1] } : null;
}

/** MediaRecorder and canvas capture both exist, and some video type can be written. */
export function canRecordVideo(): boolean {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    pickRecordingType() !== null
  );
}

export interface Recording {
  blob: Blob;
  url: string;
  mimeType: string;
  extension: "mp4" | "webm";
  seconds: number;
}

/** "After School Jam", "9:16", a date → "After-School-Jam_9x16_20261020-1530.mp4" */
export function recordingFileName(song: string, frame: string, extension: string, when: Date): string {
  const safe = song.replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "-") || "band-studio";
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}-${pad(when.getHours())}${pad(when.getMinutes())}`;
  return `${safe}_${frame.replace(":", "x")}_${stamp}.${extension}`;
}

export class FrameRecorder {
  private readonly recorder: MediaRecorder;
  private readonly chunks: Blob[] = [];
  private readonly type: { mimeType: string; extension: "mp4" | "webm" };
  private startedAt = 0;

  constructor(canvas: HTMLCanvasElement, audio: MediaStream, fps = 30) {
    const type = pickRecordingType();
    if (!type) throw new Error("No video type this browser can record");
    this.type = type;
    const stream = new MediaStream([...canvas.captureStream(fps).getVideoTracks(), ...audio.getAudioTracks()]);
    this.recorder = new MediaRecorder(stream, {
      mimeType: type.mimeType,
      videoBitsPerSecond: 6_000_000,
      audioBitsPerSecond: 160_000,
    });
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
  }

  start() {
    this.startedAt = performance.now();
    // a chunk every second, so a long take never sits in one huge buffer
    this.recorder.start(1000);
  }

  stop(): Promise<Recording> {
    return new Promise((resolve) => {
      const seconds = (performance.now() - this.startedAt) / 1000;
      this.recorder.onstop = () => {
        // only now: stopping the tracks first could cut the last chunk short
        this.recorder.stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.chunks, { type: this.type.mimeType.split(";")[0] });
        resolve({ blob, url: URL.createObjectURL(blob), ...this.type, seconds });
      };
      if (this.recorder.state !== "inactive") this.recorder.stop();
      else this.recorder.onstop(new Event("stop"));
    });
  }
}
