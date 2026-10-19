import { useEffect } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";

/** Unlock audio from a user gesture. Safe to call repeatedly. */
export async function ensureAudio(): Promise<boolean> {
  const studio = useStudioStore.getState();
  const ok = await audioEngine.start();
  studio.setAudioStarted(ok);
  if (ok) audioEngine.setLoop(useStudioStore.getState().settings.loop);
  return ok;
}

/** Mount once: keeps the engine in sync with the stores and reports engine events back. */
export function useAudioEngineBridge() {
  useEffect(() => {
    const studio = useStudioStore.getState();
    audioEngine.setEvents({
      onInstrumentState: (instrument, state) => {
        useStudioStore.getState().setInstrumentState(instrument, state);
        if (state.status === "error" && state.error) {
          useStudioStore.getState().notify({ kind: "error", text: state.error });
        }
      },
      onTransportEnd: () => useStudioStore.getState().setTransport("stopped"),
      onError: (text) => studio.notify({ kind: "error", text }),
    });

    audioEngine.sync(useProjectStore.getState().project);
    const unsubProject = useProjectStore.subscribe((s, prev) => {
      if (s.project !== prev.project) audioEngine.sync(s.project);
    });
    const unsubLoop = useStudioStore.subscribe((s, prev) => {
      if (s.settings.loop !== prev.settings.loop) audioEngine.setLoop(s.settings.loop);
    });
    return () => {
      unsubProject();
      unsubLoop();
    };
  }, []);
}
