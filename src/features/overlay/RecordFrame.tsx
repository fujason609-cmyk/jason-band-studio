import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, Square, X, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { MEMBERS } from "@/features/band/members";
import { MAX_ZOOM, MIN_ZOOM, RULER_HEIGHT } from "@/features/timeline/layout";
import { Timeline } from "@/features/timeline/Timeline";
import { useSpacebarToggle, useTransport } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { useStudioStore } from "@/stores/useStudioStore";
import {
  OVERLAY_COLORS,
  RECORD_FRAMES,
  RECORD_SPLITS,
  recordLaneHeight,
  type OverlayColor,
  type RecordFrame as Frame,
  type RecordSplit,
} from "./overlay";

const ZOOM_STEP = 1.4;

/**
 * Full-screen Instagram recording frame: the timeline on top and the key colour
 * below, inside one box of the chosen IG shape. Controls sit under the box, so a
 * screen recording cropped to the box shows only the score and the key colour.
 */
export function RecordFrame() {
  const overlay = useStudioStore((s) => s.settings.overlay);
  const zoom = useStudioStore((s) => s.settings.zoom);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const setRecordMode = useStudioStore((s) => s.setRecordMode);
  const { status, play, pause, stop, toggle } = useTransport();
  useSpacebarToggle(toggle);
  const t = useT();

  const frameRef = useRef<HTMLDivElement>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const ro = new ResizeObserver(() => setFrameHeight(frame.clientHeight));
    ro.observe(frame);
    setFrameHeight(frame.clientHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRecordMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setRecordMode]);

  const set = (patch: Partial<typeof overlay>) => updateSettings({ overlay: { ...overlay, ...patch } });
  const setZoom = (next: number) => updateSettings({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)) });
  const [rw, rh] = overlay.frame.split(":").map(Number) as [number, number];
  const laneHeight = recordLaneHeight(frameHeight * overlay.split, RULER_HEIGHT, MEMBERS.length);
  const playing = status === "playing";

  return (
    <div className="record-view" role="region" aria-label={t.recordMode}>
      <div
        ref={frameRef}
        className="record-frame"
        data-testid="record-frame"
        style={{ "--rw": rw, "--rh": rh } as CSSProperties}
      >
        <div className="record-frame__score">
          {frameHeight > 0 && <Timeline laneHeight={laneHeight} labels forceFollow />}
        </div>
        <div className="record-frame__key" data-testid="record-key" style={{ background: OVERLAY_COLORS[overlay.color] }} />
      </div>

      <div className="record-controls">
        <div className="record-controls__row">
          {playing ? (
            <IconButton label={t.pause} variant="solid" className="transport__main" onClick={pause}>
              <Pause size={22} />
            </IconButton>
          ) : (
            <IconButton label={t.play} variant="solid" className="transport__main" onClick={() => void play()}>
              <Play size={22} />
            </IconButton>
          )}
          <IconButton label={t.stop} onClick={stop}>
            <Square size={18} />
          </IconButton>
          <IconButton label={t.zoomOut} variant="quiet" onClick={() => setZoom(zoom / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}>
            <ZoomOut size={16} />
          </IconButton>
          <IconButton label={t.zoomIn} variant="quiet" onClick={() => setZoom(zoom * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>
            <ZoomIn size={16} />
          </IconButton>
          <IconButton label={t.exitRecord} className="record-controls__exit" onClick={() => setRecordMode(false)}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="record-controls__row">
          <div className="swatches" role="radiogroup" aria-label={t.overlayColor}>
            {(Object.keys(OVERLAY_COLORS) as OverlayColor[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={overlay.color === c}
                aria-label={t.overlayColors[c]}
                title={t.overlayColors[c]}
                className="swatch"
                style={{ "--swatch": OVERLAY_COLORS[c] } as CSSProperties}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
          <select aria-label={t.recordFrame} value={overlay.frame} onChange={(e) => set({ frame: e.currentTarget.value as Frame })}>
            {RECORD_FRAMES.map((f) => (
              <option key={f} value={f}>
                {t.recordFrames[f]}
              </option>
            ))}
          </select>
          <select
            aria-label={t.recordSplit}
            value={overlay.split}
            onChange={(e) => set({ split: Number(e.currentTarget.value) as RecordSplit })}
          >
            {RECORD_SPLITS.map((s) => (
              <option key={s} value={s}>
                {t.recordSplitValue(Math.round(s * 100))}
              </option>
            ))}
          </select>
        </div>
        <p className="record-controls__hint">{t.recordHint}</p>
      </div>
    </div>
  );
}
