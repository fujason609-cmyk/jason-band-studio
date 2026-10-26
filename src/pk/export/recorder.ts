import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { FrameRecorder, type Recording } from "@/features/overlay/frameRecorder";
import { ensureAudio } from "@/hooks/useAudioEngine";
import { getT } from "@/i18n/useT";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { VIDEO_H, VIDEO_W } from "../render/layout";

/** Export spec: 1080 × 1920 at a steady 30 fps, 10 Mbps. */
export const PK_FPS = 30;
export const PK_BITRATE = 10_000_000;
/** The captured sound reaches the recorder about this much after the audio clock (as in the recording frame). */
const PICTURE_DELAY_SECONDS = 0.045;
/** After the clip, the last notes ring this long, the picture held on the result. */
const RING_SECONDS = 1;

export type TakePhase = "idle" | "playing" | "recording";

interface Run {
  record: boolean;
  recorder: FrameRecorder | null;
  canvas: HTMLCanvasElement | null;
  timers: number[];
  frame: number;
  /** the picture's time (real song seconds) when playback last moved */
  last: number;
  unlisten: () => void;
}

/**
 * Plays the fight's clip (song seconds `clip`) and, for a take, records it: the picture is
 * `draw` at 1080 × 1920 on an off-page canvas every frame, from the audio clock (so a slow
 * frame drops a frame, never the sync), plus the band's sound. The music starts straight
 * away (no count-in) and stops at the clip's end, letting the last notes ring.
 * `now()` is the picture's time for the screen.
 */
export function usePkTake(clip: { start: number; end: number }, draw: (ctx: CanvasRenderingContext2D, now: number) => void) {
  const [phase, setPhase] = useState<TakePhase>("idle");
  const [video, setVideo] = useState<Recording | null>(null);
  const run = useRef<Run | null>(null);
  const latest = useRef({ clip, draw });
  latest.current = { clip, draw };

  const real = () => {
    const { baseBpm, bpm } = useProjectStore.getState().project;
    return baseBpm / Math.max(1, bpm);
  };
  /** Where the picture is: the sound being heard (for a take, as the recorder hears it). */
  const now = useCallback((): number => {
    const r = run.current;
    if (!r) return latest.current.clip.start * real();
    if (audioEngine.status === "playing") r.last = (audioEngine.getAudiblePosition() - (r.record ? PICTURE_DELAY_SECONDS : 0)) * real();
    return r.last;
  }, []);

  const finish = useCallback(async (keep: boolean, notice?: string) => {
    const r = run.current;
    if (!r) return;
    run.current = null;
    r.timers.forEach((id) => clearTimeout(id));
    r.unlisten();
    cancelAnimationFrame(r.frame);
    if (r.recorder) {
      const v = await r.recorder.stop();
      audioEngine.stopAudioCapture();
      if (keep) setVideo(v);
      else URL.revokeObjectURL(v.url);
    }
    r.canvas?.remove();
    audioEngine.pause();
    audioEngine.setLoopRange(null);
    audioEngine.seek(latest.current.clip.start);
    useStudioStore.getState().setTransport("paused");
    if (notice) useStudioStore.getState().notify({ kind: "info", text: notice });
    setPhase("idle");
  }, []);

  const start = useCallback(
    async (record: boolean) => {
      if (run.current || !(await ensureAudio())) return;
      const { clip } = latest.current;
      audioEngine.stop();
      audioEngine.setLoopRange({ start: clip.start, end: clip.end });
      audioEngine.seek(clip.start);
      let recorder: FrameRecorder | null = null;
      let canvas: HTMLCanvasElement | null = null;
      if (record) {
        const audio = audioEngine.captureAudio();
        canvas = document.createElement("canvas");
        canvas.width = VIDEO_W;
        canvas.height = VIDEO_H;
        canvas.className = "record-canvas";
        canvas.setAttribute("aria-hidden", "true");
        document.body.appendChild(canvas); // some browsers only capture a canvas in the page
        try {
          if (!audio) throw new Error("no audio capture");
          recorder = new FrameRecorder(canvas, audio, PK_FPS, PK_BITRATE);
        } catch {
          canvas.remove();
          audioEngine.stopAudioCapture();
          useStudioStore.getState().notify({ kind: "error", text: getT().recordingFailed });
          return;
        }
      }
      // a hidden tab paints no frames: the video would freeze under the sound
      const onVisibility = () => {
        if (document.visibilityState === "hidden") void finish(false, getT().recordingHidden);
      };
      document.addEventListener("visibilitychange", onVisibility);
      const r: Run = {
        record,
        recorder,
        canvas,
        timers: [],
        frame: 0,
        last: clip.start * real(),
        unlisten: () => document.removeEventListener("visibilitychange", onVisibility),
      };
      run.current = r;
      // straight in: no count-in clicks before a fight
      const countIn = useStudioStore.getState().settings.countIn;
      audioEngine.setCountIn(false);
      audioEngine.play();
      audioEngine.setCountIn(countIn);
      useStudioStore.getState().setTransport("playing");
      recorder?.start();
      const endAt = audioEngine.audioTime() + (clip.end - clip.start) * real();
      // stop playing new notes at the clip's end, a moment early (the next bar's first note
      // mustn't sneak in), letting the sounding ones ring; then the take ends
      r.timers.push(
        window.setTimeout(() => {
          if (run.current === r) audioEngine.ringOutAt(endAt - 0.005);
        }, Math.max(0, (endAt - audioEngine.audioTime() - 0.25) * 1000)),
        window.setTimeout(() => void finish(true), (endAt - audioEngine.audioTime() + RING_SECONDS + PICTURE_DELAY_SECONDS) * 1000),
      );
      if (canvas) {
        const ctx = canvas.getContext("2d")!;
        const paint = () => {
          try {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            latest.current.draw(ctx, now());
          } catch (err) {
            console.error("PK frame failed", err);
            void finish(false, getT().recordingBroke);
            return;
          }
          r.frame = requestAnimationFrame(paint);
        };
        paint();
      }
      setPhase(record ? "recording" : "playing");
    },
    [finish, now],
  );

  /** Stop: a take stopped before the end isn't the whole fight, so it's thrown away. */
  const stop = useCallback(() => {
    const r = run.current;
    if (r) void finish(false, r.record ? getT().pkTakeCut : undefined);
  }, [finish]);

  // leaving the page mid-take throws it away
  useEffect(() => () => void finish(false), [finish]);

  const dismiss = useCallback(() => {
    setVideo((v) => {
      if (v) setTimeout(() => URL.revokeObjectURL(v.url), 60_000);
      return null;
    });
  }, []);

  return { phase, start, stop, video, dismiss, now };
}
