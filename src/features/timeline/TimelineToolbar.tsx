import { Crosshair, Drum, Guitar, Smartphone, Sparkles, Star, Swords, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { useT } from "@/i18n/useT";
import { PLAY_STYLES, isPlayStyle } from "@/lib/playStyle";
import { goTo } from "@/pk/route";
import { useStudioStore } from "@/stores/useStudioStore";
import { MAX_ZOOM, MIN_ZOOM } from "./layout";

const ZOOM_STEP = 1.4;

/** Row on top of the timeline: zoom and follow on the left; playing style, feel and the recording frame on the right. */
export function TimelineToolbar() {
  const { zoom, followPlayhead, feel, playStyle, autoDrums, soloRound } = useStudioStore((s) => s.settings);
  const drumsApply = playStyle === "rock" || playStyle === "punk";
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const setRecordMode = useStudioStore((s) => s.setRecordMode);
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
      <div className="timeline-toolbar__group">
        <label className="style-pick" title={t.playStyleHint}>
          <Guitar size={16} aria-hidden />
          <select
            aria-label={t.playStyle}
            value={playStyle}
            onChange={(e) => isPlayStyle(e.currentTarget.value) && updateSettings({ playStyle: e.currentTarget.value })}
          >
            {PLAY_STYLES.map((s) => (
              <option key={s} value={s}>
                {t.playStyles[s]}
              </option>
            ))}
          </select>
        </label>
        <IconButton
          label={!drumsApply ? t.autoDrumsIdle : autoDrums ? t.autoDrumsOn : t.autoDrumsOff}
          variant="quiet"
          pressed={autoDrums}
          disabled={!drumsApply}
          onClick={() => updateSettings({ autoDrums: !autoDrums })}
        >
          <Drum size={16} />
        </IconButton>
        <IconButton
          label={soloRound ? t.soloRoundOn : t.soloRoundOff}
          variant="quiet"
          pressed={soloRound}
          onClick={() => updateSettings({ soloRound: !soloRound })}
        >
          <Star size={16} />
        </IconButton>
        <IconButton
          label={feel === "character" ? t.feelOn : t.feelOff}
          variant="quiet"
          pressed={feel === "character"}
          onClick={() => updateSettings({ feel: feel === "character" ? "steady" : "character" })}
        >
          <Sparkles size={16} />
        </IconButton>
        <IconButton label={t.recordMode} variant="quiet" onClick={() => setRecordMode(true)}>
          <Smartphone size={16} />
        </IconButton>
        <IconButton label={t.pkOpen} variant="quiet" onClick={() => goTo("pk")}>
          <Swords size={16} />
        </IconButton>
      </div>
    </div>
  );
}
