import { useEffect } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { getT } from "@/i18n/useT";
import { getPlayedSong } from "@/stores/playedSong";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";

/** Unlock audio from a user gesture. Safe to call repeatedly. */
export async function ensureAudio(): Promise<boolean> {
  const studio = useStudioStore.getState();
  const ok = await audioEngine.start();
  studio.setAudioStarted(ok);
  if (ok) {
    const { loop, feel, countIn, metronome } = useStudioStore.getState().settings;
    audioEngine.setLoop(loop);
    audioEngine.setFeel(feel);
    audioEngine.setCountIn(countIn);
    audioEngine.setMetronome(metronome);
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

    // before the first sync, so the voices and parts are built with the right sound straight away
    const { keysPatch, playStyle, autoDrums, vocals, vocalSounds } = useStudioStore.getState().settings;
    audioEngine.setKeysPatch(keysPatch);
    audioEngine.setVocals(vocals);
    audioEngine.setVocalSounds(vocalSounds);
    audioEngine.setStyle(playStyle);
    audioEngine.setAutoDrums(autoDrums);
    // the engine plays the song as played: with the solo round after it when that's on
    const syncPlayed = () => {
      const played = getPlayedSong();
      audioEngine.sync(played.project, played.songEnd);
    };
    syncPlayed();
    const unsubProject = useProjectStore.subscribe((s, prev) => {
      if (s.project !== prev.project) syncPlayed();
    });
    const unsubLoop = useStudioStore.subscribe((s, prev) => {
      if (s.settings.loop !== prev.settings.loop) audioEngine.setLoop(s.settings.loop);
      if (s.settings.feel !== prev.settings.feel) audioEngine.setFeel(s.settings.feel);
      if (s.settings.keysPatch !== prev.settings.keysPatch) audioEngine.setKeysPatch(s.settings.keysPatch);
      if (s.settings.playStyle !== prev.settings.playStyle) audioEngine.setStyle(s.settings.playStyle);
      if (s.settings.autoDrums !== prev.settings.autoDrums) audioEngine.setAutoDrums(s.settings.autoDrums);
      if (s.settings.countIn !== prev.settings.countIn) audioEngine.setCountIn(s.settings.countIn);
      if (s.settings.metronome !== prev.settings.metronome) audioEngine.setMetronome(s.settings.metronome);
      if (s.settings.vocals !== prev.settings.vocals) audioEngine.setVocals(s.settings.vocals);
      if (s.settings.vocalSounds !== prev.settings.vocalSounds) audioEngine.setVocalSounds(s.settings.vocalSounds);
      if (s.settings.soloRound !== prev.settings.soloRound) syncPlayed();
    });
    return () => {
      unsubProject();
      unsubLoop();
    };
  }, []);
}
