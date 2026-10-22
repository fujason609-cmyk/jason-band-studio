import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { buildLanes, readPalette, type TimelinePalette } from "@/features/timeline/lanes";
import { usePlaybackPosition } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { usePlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { drawTeaCorner } from "./drawTeaCorner";

/** The tea table and the turtle in the Reels frame's top band, on screen (the video draws the same). */
export function TeaCorner({ height }: { height: number }) {
  const { project, spots } = usePlayedSong();
  const { selectedMember, vocals, theme } = useStudioStore((s) => s.settings);
  const playing = useStudioStore((s) => s.transport === "playing");
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const palette = useRef<{ theme: string; value: TimelinePalette } | null>(null);
  const position = useRef(0);
  const [reducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  useLayoutEffect(() => {
    const canvas = canvasRef.current?.parentElement;
    if (!canvas) return;
    const ro = new ResizeObserver(() => setWidth(canvas.clientWidth));
    ro.observe(canvas);
    setWidth(canvas.clientWidth);
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (palette.current?.theme !== theme) palette.current = { theme, value: readPalette() };
    drawTeaCorner({
      ctx,
      x: 0,
      y: 0,
      width,
      height,
      lanes: buildLanes(project, palette.current.value, t.memberName, selectedMember, vocals, spots),
      position: position.current,
      live: playing && !reducedMotion,
      ink: palette.current.value.ink,
    });
  }, [width, height, project, spots, selectedMember, vocals, t, theme, playing, reducedMotion]);

  usePlaybackPosition((pos) => {
    position.current = pos;
    draw();
  });

  return (
    <div className="tea-corner" style={{ height }} aria-hidden="true">
      <canvas ref={canvasRef} style={{ width, height }} />
    </div>
  );
}
