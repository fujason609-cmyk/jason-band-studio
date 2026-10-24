import { useEffect, useRef } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { readPalette } from "@/features/timeline/lanes";
import { HOOK_SECONDS, drawOpening, openingFrame } from "./opening";

interface Props {
  /** the audio-clock time the take's first frame shows, or null: a still preview of it */
  openedAt: number | null;
  hook: readonly string[];
  title: string;
  /** the skit shows the name itself */
  skit: boolean;
  /** over a stage view, whose marquee is part of the stage: the hook text only */
  stage: boolean;
  /** the frame above the key strip, CSS px */
  width: number;
  height: number;
  safeTop: number;
  safeSide: number;
}

/**
 * The take's opening on screen (the video paints the same in drawRecordFrame): the hook text,
 * and over the score views the name card, timed from the audio clock; a still of the first
 * frame while nothing plays, so the hook text can be seen where it will be.
 */
export function OpeningOverlay({ openedAt, hook, title, skit, stage, width, height, safeTop, safeSide }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ink = readPalette().ink;
    let frame = 0;
    const paint = () => {
      const t = openedAt === null ? null : Math.max(0, audioEngine.audioTime() - openedAt);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const f = openingFrame(t, hook.length > 0, skit);
      drawOpening(ctx, { width, height, safeTop, safeSide }, stage ? { ...f, card: false } : f, hook, title, ink);
      // the still preview is drawn once; a take's opening until it has gone
      if (t !== null && t < HOOK_SECONDS + 1) frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [openedAt, hook, title, skit, stage, width, height, safeTop, safeSide]);
  return <canvas ref={ref} className="record-intro" style={{ width, height }} aria-hidden="true" />;
}
