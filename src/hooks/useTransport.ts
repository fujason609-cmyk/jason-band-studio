import { useCallback, useEffect, useRef } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { isTypingTarget } from "@/lib/keyboardMap";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { ensureAudio } from "./useAudioEngine";

export function useTransport() {
  const status = useStudioStore((s) => s.transport);
  const setTransport = useStudioStore((s) => s.setTransport);

  const play = useCallback(async () => {
    if (!(await ensureAudio())) return;
    audioEngine.play();
    setTransport("playing");
  }, [setTransport]);

  const pause = useCallback(() => {
    audioEngine.pause();
    setTransport("paused");
  }, [setTransport]);

  const stop = useCallback(() => {
    audioEngine.stop();
    setTransport("stopped");
  }, [setTransport]);

  /** Back to bar 1 and play, from any state (stop resets the transport to tick 0). */
  const restart = useCallback(async () => {
    if (!(await ensureAudio())) return;
    audioEngine.stop();
    audioEngine.play();
    setTransport("playing");
  }, [setTransport]);

  const toggle = useCallback(() => {
    if (useStudioStore.getState().transport === "playing") pause();
    else void play();
  }, [play, pause]);

  const seek = useCallback((songSeconds: number) => {
    audioEngine.seek(songSeconds);
    if (audioEngine.status === "stopped" && useStudioStore.getState().transport !== "stopped") {
      setTransport("paused");
    }
  }, [setTransport]);

  return { status, play, pause, stop, restart, toggle, seek };
}

/** True while a sound the song needs is still downloading: Play waits, or parts would be missing. */
export function useSoundsLoading(): boolean {
  const audioStarted = useStudioStore((s) => s.audioStarted);
  const instrumentStates = useStudioStore((s) => s.instrumentStates);
  const tracks = useProjectStore((s) => s.project.tracks);
  return audioStarted && tracks.some((t) => instrumentStates[t.instrument]?.status === "loading");
}

/** Space toggles playback unless the user is typing or pressing a focused control. */
export function useSpacebarToggle(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (isTypingTarget(target) || target?.closest("button, [role='slider'], summary, dialog")) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);
}

/**
 * Calls `onFrame` with the transport position (song seconds) on every animation
 * frame. Lives outside React state so the playhead never triggers re-renders.
 */
export function usePlaybackPosition(onFrame: (songSeconds: number) => void) {
  const ref = useRef(onFrame);
  ref.current = onFrame;
  useEffect(() => {
    let raf = 0;
    let last = -1;
    const tick = () => {
      const pos = audioEngine.getPosition();
      if (pos !== last) {
        last = pos;
        ref.current(pos);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  // and after every render: while paused the position doesn't move, but what it reads as
  // can (a new tempo, the language), and only the frame loop would otherwise redraw it
  useEffect(() => {
    ref.current(audioEngine.getPosition());
  });
}
