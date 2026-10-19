import { Clapperboard, Crosshair, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { OverlayOptions } from "@/features/overlay/VideoOverlayZone";
import { useT } from "@/i18n/useT";
import { useStudioStore } from "@/stores/useStudioStore";
import { MAX_ZOOM, MIN_ZOOM } from "./layout";

const ZOOM_STEP = 1.4;

/** Row under the timeline: zoom and follow on the left, video overlay controls on the right. */
export function TimelineToolbar() {
  const { zoom, followPlayhead, overlay } = useStudioStore((s) => s.settings);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const t = useT();
  const setZoom = (next: number) => updateSettings({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)) });

  return (
    <div className="timeline-toolbar">
      <div className="timeline-toolbar__group">
        <IconButton label={t.zoomOut} variant="quiet" onClick={() => setZoom(zoom / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}>
          <ZoomOut size={16} />
        </IconButton>
        <IconButton label={t.zoomIn} variant="quiet" onClick={() => setZoom(zoom * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>
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
      <OverlayOptions />
      <div className="timeline-toolbar__group">
        <IconButton
          label={overlay.enabled ? t.hideOverlay : t.showOverlay}
          variant="quiet"
          pressed={overlay.enabled}
          onClick={() => updateSettings({ overlay: { ...overlay, enabled: !overlay.enabled } })}
        >
          <Clapperboard size={16} />
        </IconButton>
      </div>
    </div>
  );
}
