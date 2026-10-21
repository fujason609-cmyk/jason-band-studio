import { useEffect, useId, useRef, useState } from "react";
import { Download, X } from "lucide-react";
import { TOUCH_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { useT } from "@/i18n/useT";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { recordingFileName, type Recording } from "./frameRecorder";

/**
 * Shown when a take ends: preview it, then save it or throw it away. On phones "Save"
 * opens the share sheet (on iPhone, "Save Video" puts it in Photos, where Instagram
 * picks it up); elsewhere, and if sharing isn't possible, it downloads the file.
 */
export function SaveVideoDialog({ video, onClose }: { video: Recording; onClose: () => void }) {
  const t = useT();
  const song = useProjectStore((s) => s.project.name);
  const frame = useStudioStore((s) => s.settings.overlay.frame);
  const touch = useMediaQuery(TOUCH_QUERY);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [saving, setSaving] = useState(false);
  const fileName = recordingFileName(song, frame, video.extension, new Date());

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal?.();
  }, []);

  const download = () => {
    const a = document.createElement("a");
    a.href = video.url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const save = async () => {
    setSaving(true);
    try {
      const file = new File([video.blob], fileName, { type: video.blob.type });
      if (touch && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: song });
      } else {
        download();
      }
      onClose();
    } catch (err) {
      // closing the share sheet without choosing is not a failure: stay open to try again
      if (!(err instanceof DOMException && err.name === "AbortError")) download();
    } finally {
      setSaving(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="video-dialog" aria-labelledby={titleId} onCancel={onClose}>
      <header className="video-dialog__head">
        <h2 id={titleId}>{t.savePrompt}</h2>
        <p>{t.saveDetails(Math.round(video.seconds), frame, video.extension, video.fps)}</p>
      </header>
      <video className="video-dialog__preview" src={video.url} controls playsInline />
      {video.extension === "webm" && <p className="video-dialog__note">{t.webmNote}</p>}
      <footer className="video-dialog__foot">
        <button type="button" className="btn" onClick={onClose}>
          <X size={16} aria-hidden="true" />
          {t.discardVideo}
        </button>
        <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={saving}>
          <Download size={16} aria-hidden="true" />
          {t.saveVideo}
        </button>
      </footer>
    </dialog>
  );
}
