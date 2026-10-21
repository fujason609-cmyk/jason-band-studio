import { useEffect, type ReactNode } from "react";
import { getT } from "@/i18n/useT";
import { loadCurrentProject, pruneMidiBlobs, saveCurrentProject } from "@/services/storage/projectStorage";
import { loadSettings, saveSettings } from "@/services/storage/settingsStorage";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import type { StudioProject } from "@/types/project";

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
    /** a change not saved yet (debounced), written at once when the page goes away */
    let unsaved: StudioProject | null = null;
    let warnedSaveFailure = false;
    let canSave = false;

    const studio = useStudioStore.getState();
    studio.updateSettings(loadSettings());
    const unsubSettings = useStudioStore.subscribe((s, prev) => {
      if (s.settings !== prev.settings) saveSettings(s.settings);
    });

    const save = () => {
      clearTimeout(timer);
      const project = unsaved;
      unsaved = null;
      if (!project || !canSave) return;
      saveCurrentProject(project)
        .then(() => {
          warnedSaveFailure = false; // warn again if it fails again later
        })
        .catch(() => {
          if (warnedSaveFailure) return;
          warnedSaveFailure = true;
          useStudioStore.getState().notify({ kind: "error", text: getT().saveFailed });
        });
    };
    // edits made while the stored project is still loading count too (subscribed first)
    const unsubProject = useProjectStore.subscribe((s, prev) => {
      if (s.project === prev.project) return;
      unsaved = s.project;
      clearTimeout(timer);
      if (canSave) timer = setTimeout(save, SAVE_DELAY_MS);
    });
    // closing the tab or leaving the app within the save delay mustn't lose the last change
    const flush = () => {
      if (document.visibilityState === "hidden") save();
    };
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", flush);

    const before = useProjectStore.getState().project;
    loadCurrentProject().then((result) => {
      if (cancelled) return;
      // a song imported (or a fader moved) while loading wins over the stored one
      const changedMeanwhile = useProjectStore.getState().project !== before;
      if (result.kind === "ok" && !changedMeanwhile) {
        useProjectStore.getState().replaceProject(result.project);
        unsaved = null;
      }
      if (result.kind === "ok" || result.kind === "empty") {
        void pruneMidiBlobs(useProjectStore.getState().project.midiBlobKey).catch(() => undefined);
      }
      if (result.kind === "corrupt") {
        studio.notify({ kind: "error", text: getT().sessionCorrupt });
      }
      if (result.kind === "unavailable") {
        // storage is blocked (private mode): don't try, so this notice isn't replaced by "save failed"
        studio.notify({ kind: "info", text: getT().storageBlocked });
      } else {
        canSave = true;
        if (unsaved) timer = setTimeout(save, SAVE_DELAY_MS);
      }
      studio.setHydrated();
    });

    return () => {
      cancelled = true;
      save();
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", flush);
      unsubSettings();
      unsubProject();
    };
  }, []);

  return <>{children}</>;
}
