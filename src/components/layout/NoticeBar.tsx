import { X } from "lucide-react";
import { useStudioStore } from "@/stores/useStudioStore";
import { IconButton } from "@/components/common/IconButton";

export function NoticeBar() {
  const notice = useStudioStore((s) => s.notice);
  const notify = useStudioStore((s) => s.notify);
  if (!notice) return null;
  return (
    <div className={`notice notice--${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <p>{notice.text}</p>
      <IconButton label="Dismiss message" variant="quiet" onClick={() => notify(null)}>
        <X size={16} />
      </IconButton>
    </div>
  );
}
