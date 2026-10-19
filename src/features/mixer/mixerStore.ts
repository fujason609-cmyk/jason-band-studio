import { useShallow } from "zustand/react/shallow";
import type { MemberId } from "@/features/band/types";
import { isAudible } from "@/lib/mix";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";

/** Mixer-facing view of one track: mix state plus whether it is actually heard. */
export function useMixerTrack(member: MemberId) {
  return useProjectStore(
    useShallow((s) => {
      const track = s.project.tracks.find((t) => t.memberId === member)!;
      return {
        volume: track.volume,
        muted: track.muted,
        solo: track.solo,
        instrument: track.instrument,
        noteCount: track.notes.length,
        audible: isAudible(track, s.project.tracks),
      };
    }),
  );
}

export function useMixerActions() {
  return useProjectStore(
    useShallow((s) => ({
      setTrackVolume: s.setTrackVolume,
      toggleMute: s.toggleMute,
      toggleSolo: s.toggleSolo,
      clearSolo: s.clearSolo,
      setInstrument: s.setInstrument,
    })),
  );
}

export function useAnySolo() {
  return useProjectStore((s) => s.project.tracks.some((t) => t.solo));
}

export function useInstrumentState(member: MemberId) {
  const instrument = useProjectStore((s) => s.project.tracks.find((t) => t.memberId === member)!.instrument);
  return useStudioStore((s) => s.instrumentStates[instrument]);
}
