import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { buildLanes, readPalette } from "@/features/timeline/lanes";
import { getT } from "@/i18n/useT";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { drawRecordFrame } from "./drawRecordFrame";
import { FrameRecorder, type Recording } from "./frameRecorder";
import { OVERLAY_COLORS } from "./overlay";

/** Video width in pixels; the height follows the frame shape (1080 × 1920 for 9:16). */
export const VIDEO_WIDTH = 1080;
/** Keep recording this long after playback stops, so ringing notes and cymbals end naturally. */
const TAIL_MS = 800;
/**
 * The captured sound reaches the recorder a little after the audio clock says it plays
 * (measured in Chrome: 27–88 ms, about 50 on average, at a 30 fps frame resolution), so
 * the picture is drawn this much later to keep the video in sync.
 */
const PICTURE_DELAY_SECONDS = 0.04;

export interface FrameLayout {
  width: number;
  height: number;
  keyHeight: number;
  laneHeight: number;
}

interface Session {
  recorder: FrameRecorder;
  canvas: HTMLCanvasElement;
  frame: number;
  /** set once playback stops: the picture holds here for the tail */
  frozenAt: number | null;
}

/**
 * Records the recording frame while it plays. The frame is repainted by the app onto an
 * off-page canvas at VIDEO_WIDTH (same drawing as the page, with the playhead following
 * the sound being heard), and the audio is the band's master output only.
 *
 * Starts when `rolling` turns on (if `armed`): that's playback, or the countdown before
 * it. Stops when it turns off, and hands back the finished video as `result` for the
 * save dialog; `discard` throws the current take away instead.
 */
export function useFrameRecording(armed: boolean, rolling: boolean, layout: FrameLayout) {
  const [recording, setRecording] = useState(false);
  const [result, setResult] = useState<Recording | null>(null);
  const session = useRef<Session | null>(null);
  const latestLayout = useRef(layout);
  latestLayout.current = layout;
  const wants = useRef({ armed, rolling });
  wants.current = { armed, rolling };

  const begin = useCallback(() => {
    if (session.current || latestLayout.current.width === 0) return;
    const audio = audioEngine.captureAudio();
    if (!audio) return;
    // layout and scale are fixed for the whole take (the frame controls are locked meanwhile).
    // The video is exactly Instagram's size (1080 × 1920 / 1350 / 1080), so the scene's
    // height is derived from it rather than from the frame's rounded on-screen height.
    const [rw, rh] = useStudioStore.getState().settings.overlay.frame.split(":").map(Number) as [number, number];
    const scale = VIDEO_WIDTH / latestLayout.current.width;
    const canvas = document.createElement("canvas");
    canvas.width = VIDEO_WIDTH;
    canvas.height = Math.round((VIDEO_WIDTH * rh) / rw);
    const l = { ...latestLayout.current, height: canvas.height / scale };
    canvas.className = "record-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas); // some browsers only capture a canvas that is in the page
    const ctx = canvas.getContext("2d")!;
    const palette = readPalette();
    const ripples = !matchMedia("(prefers-reduced-motion: reduce)").matches;

    const s: Session = { recorder: new FrameRecorder(canvas, audio), canvas, frame: 0, frozenAt: null };
    const paint = () => {
      const { project } = useProjectStore.getState();
      const { settings } = useStudioStore.getState();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawRecordFrame(ctx, {
        ...l,
        zoom: settings.zoom,
        position: s.frozenAt ?? Math.max(0, audioEngine.getAudiblePosition() - PICTURE_DELAY_SECONDS),
        durationSeconds: project.durationSeconds,
        baseBpm: project.baseBpm,
        beatsPerBar: project.beatsPerBar,
        lanes: buildLanes(project, palette, getT().memberName, settings.selectedMember, settings.vocals),
        palette,
        keyColor: OVERLAY_COLORS[settings.overlay.color],
        ripples,
      });
      s.frame = requestAnimationFrame(paint);
    };
    paint();
    s.recorder.start();
    session.current = s;
    setRecording(true);
  }, []);

  const finish = useCallback(async () => {
    const s = session.current;
    if (!s || s.frozenAt !== null) return;
    s.frozenAt = audioEngine.getAudiblePosition();
    await new Promise((resolve) => setTimeout(resolve, TAIL_MS));
    // thrown away meanwhile (left the frame): nothing to finish, and the audio capture may
    // already belong to a new take
    if (session.current !== s) return;
    cancelAnimationFrame(s.frame);
    const video = await s.recorder.stop();
    audioEngine.stopAudioCapture();
    s.canvas.remove();
    session.current = null;
    setRecording(false);
    setResult(video);
    // Play pressed again during the tail: that's the next take
    if (wants.current.armed && wants.current.rolling) begin();
  }, [begin]);

  useEffect(() => {
    if (rolling && armed) begin();
    if (!rolling) void finish();
  }, [rolling, armed, begin, finish]);

  const discard = useCallback(() => {
    const s = session.current;
    if (!s) return;
    cancelAnimationFrame(s.frame);
    void s.recorder.stop().then((v) => URL.revokeObjectURL(v.url));
    audioEngine.stopAudioCapture();
    s.canvas.remove();
    session.current = null;
    setRecording(false);
  }, []);

  // leaving the recording frame mid-take throws the take away
  useEffect(() => discard, [discard]);

  const dismiss = useCallback(() => {
    setResult((r) => {
      if (r) URL.revokeObjectURL(r.url);
      return null;
    });
  }, []);

  return { recording, result, dismiss, discard };
}
