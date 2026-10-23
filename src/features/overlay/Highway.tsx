import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildLanes, readPalette, type TimelinePalette } from "@/features/timeline/lanes";
import { usePlaybackPosition } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { usePlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { drawHighway } from "./drawHighway";
import { energyAt } from "./energy";

/**
 * The falling-notes view on screen, in the recording frame (the video draws the same with
 * drawRecordFrame). Redrawn on every playback frame from the position, without React state.
 */
export function Highway({
  rightInset = 0,
  insets,
}: {
  rightInset?: number;
  /** the frame's safe area (drawHighway `insets`) */
  insets?: { top: number; side: number; bottom: number };
}) {
  const { project, spots } = usePlayedSong();
  const { zoom, selectedMember, theme, vocals } = useStudioStore((s) => s.settings);
  const playing = useStudioStore((s) => s.transport === "playing");
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const palette = useRef<TimelinePalette | null>(null);
  const position = useRef(0);
  const [reducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setSize({ width: box.clientWidth, height: box.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    measure();
    return () => ro.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.width * dpr) || canvas.height !== Math.round(size.height * dpr)) {
      canvas.width = Math.round(size.width * dpr);
      canvas.height = Math.round(size.height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colours = (palette.current ??= readPalette());
    const ripples = playing && !reducedMotion;
    const barSeconds = (60 / project.baseBpm) * project.beatsPerBar;
    drawHighway({
      ctx,
      width: size.width,
      height: size.height,
      lanes: buildLanes(project, colours, t.memberName, selectedMember, vocals, spots),
      position: position.current,
      zoom,
      baseBpm: project.baseBpm,
      beatsPerBar: project.beatsPerBar,
      tempos: project.midiMeta?.tempos,
      durationSeconds: project.durationSeconds,
      palette: colours,
      ripples,
      energy: ripples ? energyAt(project.tracks.map((tr) => tr.notes), barSeconds, position.current) : 0,
      rightInset,
      insets,
    });
    // the insets are rebuilt each render; their numbers are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, spots, zoom, size, selectedMember, vocals, t, playing, reducedMotion, rightInset, insets?.top, insets?.side, insets?.bottom]);

  useEffect(() => {
    palette.current = null;
    draw();
  }, [draw, theme]);

  usePlaybackPosition((pos) => {
    position.current = pos;
    draw();
  });

  return (
    <div ref={boxRef} className="highway" data-testid="highway">
      <canvas ref={canvasRef} style={{ width: size.width, height: size.height }} />
    </div>
  );
}
