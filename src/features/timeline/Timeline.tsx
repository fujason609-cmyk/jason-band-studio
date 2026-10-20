import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { MEMBERS } from "@/features/band/members";
import { NARROW_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { usePlaybackPosition, useTransport } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { barBeat } from "@/lib/time";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { drawTimeline } from "./drawTimeline";
import { cameraLeft, followStep } from "./camera";
import { buildLanes, readPalette, type TimelinePalette } from "./lanes";
import { LANE_HEIGHT, RULER_HEIGHT, TIMELINE_GUTTER } from "./layout";
import { Playhead } from "./Playhead";

interface TimelineProps {
  /** lane height in px; the recording frame shrinks lanes to fit */
  laneHeight?: number;
  /** draw member names on the lanes (always on when there's no mixer beside them) */
  labels?: boolean;
  /** keep the playhead in view while playing, whatever the setting says */
  forceFollow?: boolean;
}

/** After a wheel or touch scroll, follow mode waits this long before gliding back. */
const USER_SCROLL_HOLD_MS = 2000;

export function Timeline({ laneHeight = LANE_HEIGHT, labels, forceFollow = false }: TimelineProps = {}) {
  const project = useProjectStore((s) => s.project);
  const { zoom, followPlayhead: followSetting, selectedMember, theme, vocals } = useStudioStore((s) => s.settings);
  const followPlayhead = forceFollow || followSetting;
  const transport = useStudioStore((s) => s.transport);
  const { seek } = useTransport();
  const narrow = useMediaQuery(NARROW_QUERY);
  const t = useT();

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(0);
  const frame = useRef(0);
  const scrubbing = useRef(false);
  // a wheel or touch scroll pauses following for a moment, so you can look around while it plays
  const userScrolledAt = useRef(-Infinity);
  const lastAnnounced = useRef(-1);
  // read once per theme: getComputedStyle is too slow to run on every frame
  const palette = useRef<TimelinePalette | null>(null);
  const position = useRef(0);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const playing = transport === "playing";

  const height = RULER_HEIGHT + MEMBERS.length * laneHeight;
  const showLabels = labels ?? narrow;
  const contentWidth = Math.ceil(TIMELINE_GUTTER * 2 + project.durationSeconds * zoom);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = scrollRef.current;
    if (!canvas || !scroller || viewport === 0) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(viewport * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(viewport * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colours = (palette.current ??= readPalette());
    drawTimeline({
      ctx,
      width: viewport,
      height,
      scrollLeft: scroller.scrollLeft,
      zoom,
      baseBpm: project.baseBpm,
      beatsPerBar: project.beatsPerBar,
      durationSeconds: project.durationSeconds,
      palette: colours,
      showLabels,
      laneHeight,
      position: position.current,
      ripples: playing && !reducedMotion,
      lanes: buildLanes(project, colours, t.memberName, selectedMember, vocals),
    });
  }, [project, zoom, viewport, height, showLabels, laneHeight, selectedMember, vocals, t, playing, reducedMotion]);

  const requestDraw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(draw);
  }, [draw]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const ro = new ResizeObserver(() => setViewport(scroller.clientWidth));
    ro.observe(scroller);
    setViewport(scroller.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    palette.current = null;
    requestDraw();
  }, [requestDraw, theme]);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      palette.current = null;
      requestDraw();
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [requestDraw]);

  usePlaybackPosition((pos) => {
    const scroller = scrollRef.current;
    // follow: the score glides under a steady playhead (no page jumps). Scroll first,
    // then draw, so notes and playhead land in the same frame.
    const following =
      followPlayhead && transport === "playing" && !scrubbing.current && performance.now() - userScrolledAt.current > USER_SCROLL_HOLD_MS;
    if (scroller && following) {
      const target = cameraLeft(pos, zoom, scroller.clientWidth, project.durationSeconds);
      const next = followStep(scroller.scrollLeft, target);
      if (Math.abs(next - scroller.scrollLeft) >= 0.5) scroller.scrollLeft = next;
    }
    // already inside an animation frame: redraw now so the glowing notes track the playhead
    position.current = pos;
    draw();
    const x = TIMELINE_GUTTER + pos * zoom;
    if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`;
    const whole = Math.floor(pos);
    if (scroller && whole !== lastAnnounced.current) {
      lastAnnounced.current = whole;
      const { bar, beat } = barBeat(pos, project.baseBpm, project.beatsPerBar);
      scroller.setAttribute("aria-valuenow", String(whole));
      scroller.setAttribute("aria-valuetext", t.barBeat(bar, beat));
    }
  });

  const timeAt = (clientX: number) => {
    const scroller = scrollRef.current!;
    const rect = scroller.getBoundingClientRect();
    return (clientX - rect.left + scroller.scrollLeft - TIMELINE_GUTTER) / zoom;
  };

  const barSeconds = (60 / project.baseBpm) * project.beatsPerBar;

  // Zoom is set from the toolbar under the timeline; keep the centre of the view in place.
  const lastZoom = useRef(zoom);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const prev = lastZoom.current;
    lastZoom.current = zoom;
    if (!scroller || prev === zoom) return;
    const centre = (scroller.scrollLeft + scroller.clientWidth / 2 - TIMELINE_GUTTER) / prev;
    scroller.scrollLeft = TIMELINE_GUTTER + centre * zoom - scroller.clientWidth / 2;
  }, [zoom]);

  return (
    <section className="timeline" aria-label={t.timeline}>
      <div
        ref={scrollRef}
        className="timeline__scroll"
        onScroll={requestDraw}
        onWheel={() => (userScrolledAt.current = performance.now())}
        onTouchMove={() => (userScrolledAt.current = performance.now())}
        role="slider"
        tabIndex={0}
        aria-label={t.timelineSlider}
        aria-valuemin={0}
        aria-valuemax={Math.floor(project.durationSeconds)}
        onKeyDown={(e) => {
          const pos = audioEngine.getPosition();
          const bar = Math.round(pos / barSeconds);
          if (e.key === "ArrowRight") seek((bar + 1) * barSeconds);
          else if (e.key === "ArrowLeft") seek(Math.max(0, bar - 1) * barSeconds);
          else if (e.key === "Home") seek(0);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          scrubbing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(timeAt(e.clientX));
        }}
        onPointerMove={(e) => {
          if (scrubbing.current) seek(timeAt(e.clientX));
        }}
        onPointerUp={(e) => {
          scrubbing.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          scrubbing.current = false;
        }}
      >
        <div className="timeline__content" style={{ width: contentWidth, height }}>
          <canvas ref={canvasRef} className="timeline__canvas" style={{ width: viewport, height }} />
          <Playhead ref={playheadRef} />
        </div>
      </div>
    </section>
  );
}
