import { useEffect, useRef } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { buildLanes, readPalette } from "@/features/timeline/lanes";
import { getT } from "@/i18n/useT";
import { getPlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { drawIntro, introLength } from "./introSkit";
import type { IntroTake } from "./useFrameRecording";

interface Props {
  take: IntroTake;
  /** the frame above the key strip, CSS px */
  width: number;
  height: number;
  safeTop: number;
  safeSide: number;
  safeBottom: number;
}

/**
 * The opening skit on screen, over the score, painted from the audio clock by the same
 * `drawIntro` as the video. Stops painting once the count-in is over.
 */
export function IntroOverlay({ take, width, height, safeTop, safeSide, safeBottom }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const palette = readPalette();
    const area = { width, height, safeTop, safeSide, safeBottom };
    let frame = 0;
    const paint = () => {
      const elapsed = audioEngine.audioTime() - take.introAt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (elapsed >= introLength(take.plan)) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { settings } = useStudioStore.getState();
      const lanes = buildLanes(
        getPlayedSong().project,
        palette,
        getT().memberName,
        settings.selectedMember,
        settings.vocals,
      );
      drawIntro(ctx, area, take.plan, Math.max(0, elapsed), lanes, palette.ink);
      frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [take, width, height, safeTop, safeSide, safeBottom]);
  return <canvas ref={ref} className="record-intro" style={{ width, height }} aria-hidden="true" />;
}
