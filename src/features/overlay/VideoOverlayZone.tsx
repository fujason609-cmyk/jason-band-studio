import type { CSSProperties } from "react";
import { X } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { useT } from "@/i18n/useT";
import { useStudioStore } from "@/stores/useStudioStore";
import {
  OVERLAY_ASPECTS,
  OVERLAY_COLORS,
  OVERLAY_SIZES,
  OVERLAY_WIDTH,
  aspectRatio,
  type OverlayAspect,
  type OverlayColor,
  type OverlaySettings,
  type OverlaySize,
} from "./overlay";

/** Tallest the box may get, so portrait shapes still fit on screen. */
const MAX_HEIGHT_VH = 80;

export function VideoOverlayZone() {
  const overlay = useStudioStore((s) => s.settings.overlay);
  const playing = useStudioStore((s) => s.transport === "playing");
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const t = useT();
  if (!overlay.enabled) return null;

  const set = (patch: Partial<OverlaySettings>) => updateSettings({ overlay: { ...overlay, ...patch } });
  const [w, h] = overlay.aspect.split(":").map(Number) as [number, number];
  const width = `min(${OVERLAY_WIDTH[overlay.size] * 100}%, ${(MAX_HEIGHT_VH * w) / h}vh)`;

  return (
    <section className="overlay-zone" aria-label={t.overlayZone}>
      {/* stays in the layout while hidden so the box never moves during a recording */}
      <div className={`overlay-zone__controls ${playing ? "is-hidden" : ""}`}>
        <div className="overlay-zone__title">
          <h2>{t.overlayZone}</h2>
          <p>{t.overlayHint}</p>
        </div>
        <div className="overlay-zone__options">
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
          <select
            aria-label={t.overlayAspect}
            value={overlay.aspect}
            onChange={(e) => set({ aspect: e.currentTarget.value as OverlayAspect })}
          >
            {OVERLAY_ASPECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select
            aria-label={t.overlaySize}
            value={overlay.size}
            onChange={(e) => set({ size: e.currentTarget.value as OverlaySize })}
          >
            {OVERLAY_SIZES.map((s) => (
              <option key={s} value={s}>
                {t.overlaySizes[s]}
              </option>
            ))}
          </select>
          <IconButton label={t.hideOverlay} variant="quiet" onClick={() => set({ enabled: false })}>
            <X size={16} />
          </IconButton>
        </div>
      </div>
      {/* the key area itself: one flat colour, no text, border or shadow */}
      <div
        className="overlay-zone__key"
        data-testid="overlay-key"
        aria-hidden="true"
        style={{ background: OVERLAY_COLORS[overlay.color], aspectRatio: aspectRatio(overlay.aspect), width }}
      />
    </section>
  );
}
