import { useEffect, useId, useRef } from "react";
import { Check } from "lucide-react";
import { useT } from "@/i18n/useT";
import { usePlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { introTitle } from "./introSkit";
import { RECORD_FPS, type IntroTitle } from "./overlay";

/**
 * The take's words and finer settings, out of the control rows (no room on a phone): the
 * hook text shown over the first seconds (two lines, the English one first), where the
 * song's name on the marquee comes from, and the frame rate.
 */
export function TakeSettingsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const overlay = useStudioStore((s) => s.settings.overlay);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const { project } = usePlayedSong();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const set = (patch: Partial<typeof overlay>) =>
    updateSettings({ overlay: { ...useStudioStore.getState().settings.overlay, ...patch } });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  return (
    <dialog ref={dialogRef} className="video-dialog take-dialog" aria-labelledby={titleId} onCancel={onClose}>
      <header className="video-dialog__head">
        <h2 id={titleId}>{t.takeSettings}</h2>
      </header>
      <div className="take-dialog__body">
        <label className="take-dialog__field">
          <span>{t.hookText}</span>
          <textarea
            rows={2}
            maxLength={200}
            value={overlay.hook}
            placeholder={t.hookPlaceholder}
            onChange={(e) => set({ hook: e.currentTarget.value })}
          />
          <small>{t.hookHint}</small>
        </label>
        <fieldset className="take-dialog__field">
          <legend>{t.signName}</legend>
          {(["score", "file"] as IntroTitle[]).map((source) => (
            <label key={source} className="take-dialog__choice">
              <input
                type="radio"
                name="sign-name"
                checked={overlay.introTitle === source}
                onChange={() => set({ introTitle: source })}
              />
              {source === "score" ? t.signFromScore(introTitle(project, "score")) : t.signFromFile(introTitle(project, "file"))}
            </label>
          ))}
        </fieldset>
        <label className="take-dialog__field">
          <span>{t.recordFps}</span>
          <select value={overlay.fps} onChange={(e) => set({ fps: Number(e.currentTarget.value) === 60 ? 60 : 30 })}>
            {RECORD_FPS.map((fps) => (
              <option key={fps} value={fps}>
                {t.recordFpsOptions[fps]}
              </option>
            ))}
          </select>
          <small>{t.recordFpsHint}</small>
        </label>
      </div>
      <footer className="video-dialog__foot">
        <button type="button" className="btn btn--primary" onClick={onClose}>
          <Check size={16} aria-hidden="true" />
          {t.done}
        </button>
      </footer>
    </dialog>
  );
}
