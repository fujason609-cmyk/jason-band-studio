import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Crosshair, ZoomIn, ZoomOut } from "lucide-react";
import { audioEngine } from "@/audio/AudioEngine";
import { IconButton } from "@/components/common/IconButton";
import { MEMBERS } from "@/features/band/members";
import { NARROW_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { usePlaybackPosition, useTransport } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { audibleMap } from "@/lib/mix";
import { barBeat } from "@/lib/time";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { drawTimeline, type Palette } from "./drawTimeline";
import { LANE_HEIGHT, MAX_ZOOM, MIN_ZOOM, RULER_HEIGHT, TIMELINE_GUTTER } from "./layout";
import { Playhead } from "./Playhead";

function readPalette(): Palette & { members: Record<string, string> } {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || "#888";
  return {
    paper: v("--paper"),
    surface: v("--surface"),
    rule: v("--rule"),
    ruleStrong: v("--rule-strong"),
    ink: v("--ink"),
    inkSoft: v("--ink-soft"),
    selected: v("--lane-selected"),
    members: Object.fromEntries(MEMBERS.map((m) => [m.id, v(m.colorVar)])),
  };
}

export function Timeline() {
  const project = useProjectStore((s) => s.project);
  const { zoom, followPlayhead, selectedMember, theme } = useStudioStore((s) => s.settings);
  const updateSettings = useStudioStore((s) => s.updateSettings);
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
  const lastAnnounced = useRef(-1);

  const height = RULER_HEIGHT + MEMBERS.length * LANE_HEIGHT;
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
    const palette = readPalette();
    const audible = audibleMap(project.tracks);
    drawTimeline({
      ctx,
      width: viewport,
      height,
      scrollLeft: scroller.scrollLeft,
      zoom,
      baseBpm: project.baseBpm,
      beatsPerBar: project.beatsPerBar,
      durationSeconds: project.durationSeconds,
      palette,
      showLabels: narrow,
      lanes: MEMBERS.map((m) => {
        const track = project.tracks.find((t) => t.memberId === m.id)!;
        return {
          label: t.memberName[m.id],
          color: palette.members[m.id]!,
          notes: track.notes,
          audible: audible[track.id] ?? true,
          isDrums: track.instrument === "drums",
          selected: m.id === selectedMember,
        };
      }),
    });
  }, [project, zoom, viewport, height, narrow, selectedMember, t]);

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
    requestDraw();
  }, [requestDraw, theme]);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", requestDraw);
    return () => mq.removeEventListener("change", requestDraw);
  }, [requestDraw]);

  usePlaybackPosition((pos) => {
    const x = TIMELINE_GUTTER + pos * zoom;
    if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`;
    const scroller = scrollRef.current;
    if (scroller && followPlayhead && transport === "playing" && !scrubbing.current) {
      const left = scroller.scrollLeft;
      if (x < left || x > left + scroller.clientWidth * 0.85) scroller.scrollLeft = x - scroller.clientWidth * 0.15;
    }
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

  const setZoom = (next: number) => {
    const scroller = scrollRef.current;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    if (scroller) {
      // keep the centre of the view in place
      const centre = (scroller.scrollLeft + scroller.clientWidth / 2 - TIMELINE_GUTTER) / zoom;
      requestAnimationFrame(() => {
        scroller.scrollLeft = TIMELINE_GUTTER + centre * clamped - scroller.clientWidth / 2;
      });
    }
    updateSettings({ zoom: clamped });
  };

  return (
    <section className="timeline" aria-label={t.timeline}>
      <div
        ref={scrollRef}
        className="timeline__scroll"
        onScroll={requestDraw}
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
      <div className="timeline__tools">
        <IconButton label={t.zoomOut} variant="quiet" onClick={() => setZoom(zoom / 1.4)} disabled={zoom <= MIN_ZOOM}>
          <ZoomOut size={16} />
        </IconButton>
        <IconButton label={t.zoomIn} variant="quiet" onClick={() => setZoom(zoom * 1.4)} disabled={zoom >= MAX_ZOOM}>
          <ZoomIn size={16} />
        </IconButton>
        <IconButton
          label={t.followPlayhead}
          variant="quiet"
          pressed={followPlayhead}
          onClick={() => updateSettings({ followPlayhead: !followPlayhead })}
        >
          <Crosshair size={16} />
        </IconButton>
      </div>
    </section>
  );
}
