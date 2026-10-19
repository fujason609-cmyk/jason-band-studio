import { useEffect, type ReactNode } from "react";
import { getT } from "@/i18n/useT";
import { loadCurrentProject, saveCurrentProject } from "@/services/storage/projectStorage";
import { loadSettings, saveSettings } from "@/services/storage/settingsStorage";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";

const SAVE_DELAY_MS = 400;

/**
 * Restores settings (localStorage) and the current project (IndexedDB) on load,
 * then saves changes back. Audio objects are never stored: the engine rebuilds
 * itself from the restored project.
 */
export function PersistenceProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubProject: (() => void) | undefined;
    let warnedSaveFailure = false;

    const studio = useStudioStore.getState();
    studio.updateSettings(loadSettings());
    const unsubSettings = useStudioStore.subscribe((s, prev) => {
      if (s.settings !== prev.settings) saveSettings(s.settings);
    });

    loadCurrentProject().then((result) => {
      if (cancelled) return;
      if (result.kind === "ok") useProjectStore.getState().replaceProject(result.project);
      if (result.kind === "corrupt") {
        studio.notify({ kind: "error", text: getT().sessionCorrupt });
      }
      if (result.kind === "unavailable") {
        studio.notify({ kind: "info", text: getT().storageBlocked });
      }
      studio.setHydrated();

      unsubProject = useProjectStore.subscribe((s, prev) => {
        if (s.project === prev.project) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          saveCurrentProject(s.project).catch(() => {
            if (warnedSaveFailure) return;
            warnedSaveFailure = true;
            useStudioStore
              .getState()
              .notify({ kind: "error", text: getT().saveFailed });
          });
        }, SAVE_DELAY_MS);
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubSettings();
      unsubProject?.();
    };
  }, []);

  return <>{children}</>;
}
