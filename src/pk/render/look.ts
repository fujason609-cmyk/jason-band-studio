import { MEMBERS } from "@/features/band/members";
import { gearFor } from "@/features/band/pixelInstruments";
import type { StudioProject } from "@/types/project";
import type { NoteEvent } from "@/types/midi";
import type { BattleResult, MemberId, Side } from "../types";
import type { FighterLook } from "./canvas";

/** Names in the video: the same everywhere, as the fans say them ("MUGI"). */
export const VIDEO_NAMES: Record<MemberId, string> = { yui: "YUI", mio: "MIO", ritsu: "RITSU", tsumugi: "MUGI", azusa: "AZUSA" };
const PLAIN: Record<MemberId, string> = { yui: "Yui", mio: "Mio", ritsu: "Ritsu", tsumugi: "Mugi", azusa: "Azusa" };

/** "Mio vs Azusa — who wins?": the hook line the Reels open with (English first). */
export function defaultHook(left: MemberId, right: MemberId): string {
  return `${PLAIN[left]} vs ${PLAIN[right]} — who wins?`;
}

/** The Reel's caption: the question first, then the tags. */
export function defaultCaption(left: MemberId, right: MemberId): string {
  return `Guess the winner before the end 👀 ${PLAIN[left]} vs ${PLAIN[right]}\n#kon #けいおん #케이온 #keion #${PLAIN[left].toLowerCase()} #${PLAIN[right].toLowerCase()}`;
}

/** "Next: Yui vs Ritsu" */
export function nextTeaser(left: MemberId, right: MemberId): string {
  return `Next: ${PLAIN[left]} vs ${PLAIN[right]}`;
}

/** How each fighter looks: her colour, her instrument as in the song, her part to move to. */
export function fighterLooks(result: BattleResult, project: StudioProject, colors: Record<string, string>): Record<Side, FighterLook> {
  const look = (side: Side): FighterLook => {
    const id = side === "L" ? result.input.left : result.input.right;
    const member = MEMBERS.find((m) => m.id === id)!;
    const instrument = project.tracks.find((t) => t.memberId === id)?.instrument ?? member.defaultInstrument;
    const notes: NoteEvent[] = result.input.notes
      .filter((n) => n.lane === id)
      .map((n) => ({ pitch: n.pitch, start: n.time, duration: n.duration, velocity: n.velocity }));
    return {
      id,
      name: VIDEO_NAMES[id],
      color: colors[id] ?? "#ff6f9f",
      instrument,
      leftHanded: member.leftHanded === true,
      gear: gearFor(id, instrument),
      notes,
      isDrums: instrument === "drums",
    };
  };
  return { L: look("L"), R: look("R") };
}
