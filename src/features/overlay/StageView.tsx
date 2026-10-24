import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { buildLanes, readPalette, type TimelinePalette } from "@/features/timeline/lanes";
import { usePlaybackPosition } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { usePlayedSong } from "@/stores/playedSong";
import { drumsGenerated } from "@/lib/playStyle";
import { useStudioStore } from "@/stores/useStudioStore";
import { drawStageView, type StageViewInput } from "./drawStageView";
import { energyAt } from "./energy";

/**
 * The stage views on screen, in the recording frame (the video draws the same with
 * drawRecordFrame). Redrawn on every playback frame from the position, without React state.
 * `sign` says, at each frame, how the marquee over the stage shows (it follows the take's
 * opening).
 */
export function StageView({
  mode,
  insets,
  rightInset = 0,
  sign,
}: {
  mode: StageViewInput["mode"];
  insets: { top: number; side: number; bottom: number };
  rightInset?: number;
  sign: () => StageViewInput["sign"];
}) {
  const { project, spots } = usePlayedSong();
  const { zoom, selectedMember, theme, vocals } = useStudioStore((s) => s.settings);
  const generatedDrums = useStudioStore((s) => drumsGenerated(s.settings.playStyle, s.settings.autoDrums));
  const playing = useStudioStore((s) => s.transport === "playing");
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const palette = useRef<TimelinePalette | null>(null);
  const position = useRef(0);
  const signRef = useRef(sign);
  signRef.current = sign;
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
    drawStageView({
      ctx,
      width: size.width,
      height: size.height,
      safeTop: insets.top,
      safeSide: insets.side,
      safeBottom: insets.bottom,
      mode,
      lanes: buildLanes(project, colours, t.memberName, selectedMember, vocals, spots, generatedDrums),
      position: position.current,
      baseBpm: project.baseBpm,
      beatsPerBar: project.beatsPerBar,
      tempos: project.midiMeta?.tempos,
      durationSeconds: project.durationSeconds,
      zoom,
      palette: colours,
      ripples,
      energy: ripples ? energyAt(project.tracks.map((tr) => tr.notes), barSeconds, position.current) : 0,
      rightInset,
      sign: signRef.current(),
    });
    // the insets are rebuilt each render; their numbers are what matter
  }, [project, spots, zoom, size, selectedMember, vocals, generatedDrums, t, playing, reducedMotion, rightInset, mode, insets.top, insets.side, insets.bottom]);

  useEffect(() => {
    palette.current = null;
    draw();
  }, [draw, theme]);

  // a still stage keeps being drawn too: the marquee drops in and the bulbs chase
  useEffect(() => {
    if (playing) return;
    const id = setInterval(draw, 120);
    return () => clearInterval(id);
  }, [playing, draw]);

  usePlaybackPosition((pos) => {
    position.current = pos;
    draw();
  });

  return (
    <div ref={boxRef} className="highway" data-testid="stage-view">
      <canvas ref={canvasRef} style={{ width: size.width, height: size.height }} />
    </div>
  );
}
