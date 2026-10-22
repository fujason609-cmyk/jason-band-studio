import { MEMBERS } from "@/features/band/members";
import { gearFor } from "@/features/band/pixelInstruments";
import type { MemberId } from "@/features/band/types";
import { vocalRoleOf, type VocalSwitches } from "@/features/band/vocals";
import { audibleMap } from "@/lib/mix";
import type { SoloSpot } from "@/lib/soloRound";
import type { StudioProject } from "@/types/project";
import type { LaneInput, Palette } from "./drawTimeline";

export type TimelinePalette = Palette & { members: Record<string, string> };

/** The theme colours the canvas needs. Slow (getComputedStyle): read once per theme, not per frame. */
export function readPalette(): TimelinePalette {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim() || "#888";
  return {
    paper: v("--paper"),
    surface: v("--surface"),
    rule: v("--rule"),
    ruleStrong: v("--rule-strong"),
    ink: v("--ink"),
    inkSoft: v("--ink-soft"),
    selected: v("--lane-selected"),
    accent: v("--accent"),
    members: Object.fromEntries(MEMBERS.map((m) => [m.id, v(m.colorVar)])),
  };
}

/** One lane per member, in band order, as drawTimeline wants them. */
export function buildLanes(
  project: StudioProject,
  palette: TimelinePalette,
  names: Record<MemberId, string>,
  selectedMember: MemberId,
  vocals: VocalSwitches,
  spots: readonly SoloSpot[] = [],
): LaneInput[] {
  const audible = audibleMap(project.tracks);
  return MEMBERS.map((m) => {
    const track = project.tracks.find((t) => t.memberId === m.id)!;
    return {
      label: names[m.id],
      color: palette.members[m.id]!,
      notes: track.notes,
      audible: audible[track.id] ?? true,
      isDrums: track.instrument === "drums",
      selected: m.id === selectedMember,
      ...(track.vocal?.length ? { vocal: { notes: track.vocal, on: vocals[vocalRoleOf(m.id) ?? "lead"] } } : {}),
      solos: spots.filter((s) => s.member === m.id),
      instrument: track.instrument,
      leftHanded: m.leftHanded === true,
      gear: gearFor(m.id, track.instrument),
    };
  });
}
