import { useEffect } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { getT } from "@/i18n/useT";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";

/** Unlock audio from a user gesture. Safe to call repeatedly. */
export async function ensureAudio(): Promise<boolean> {
  const studio = useStudioStore.getState();
  const ok = await audioEngine.start();
  studio.setAudioStarted(ok);
  if (ok) {
    const { loop, feel } = useStudioStore.getState().settings;
    audioEngine.setLoop(loop);
    audioEngine.setFeel(feel);
  }
  return ok;
}

/** Mount once: keeps the engine in sync with the stores and reports engine events back. */
export function useAudioEngineBridge() {
  useEffect(() => {
    audioEngine.setEvents({
      onInstrumentState: (instrument, state) => {
        useStudioStore.getState().setInstrumentState(instrument, state);
        if (state.status === "error") {
          const t = getT();
          useStudioStore.getState().notify({ kind: "error", text: t.samplesFailed(t.instrument[instrument]) });
        }
      },
      onTransportEnd: () => useStudioStore.getState().setTransport("stopped"),
      onStartError: (detail) => useStudioStore.getState().notify({ kind: "error", text: getT().audioBlocked(detail) }),
    });

    // before the first sync, so the keys voices are built with the right sound straight away
    audioEngine.setKeysPatch(useStudioStore.getState().settings.keysPatch);
    audioEngine.sync(useProjectStore.getState().project);
    const unsubProject = useProjectStore.subscribe((s, prev) => {
      if (s.project !== prev.project) audioEngine.sync(s.project);
    });
    const unsubLoop = useStudioStore.subscribe((s, prev) => {
      if (s.settings.loop !== prev.settings.loop) audioEngine.setLoop(s.settings.loop);
      if (s.settings.feel !== prev.settings.feel) audioEngine.setFeel(s.settings.feel);
      if (s.settings.keysPatch !== prev.settings.keysPatch) audioEngine.setKeysPatch(s.settings.keysPatch);
    });
    return () => {
      unsubProject();
      unsubLoop();
    };
  }, []);
}
