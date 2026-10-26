import { FIGURE_COLS, FIGURE_ROWS } from "@/features/band/pixelMembers";
import type { Side } from "../types";

/**
 * Where everything goes in the 1080 × 1920 video (9:16). Every coordinate the PK picture
 * uses is here, so moving things clear of Instagram's interface means changing only this
 * file. Measured on a posted Reel (iPhone, the preview screen): Instagram fills the
 * screen's height, so ~43 px of each side are cropped; its back button and title cover the
 * top ~260; the like / comment / share column covers x 930–1000 from y ~1280 down; the
 * account name and caption cover the bottom from ~1720.
 *   0–260      clear (background, the curtains' valance)
 *   270–430    the fighting-game HUD: portraits, HP and energy bars, the round timer, the song
 *   440–1100   the two fighters, big; the VS splash, specials and the KO play here
 *   1120–1560  the note tracks, three lanes a side
 *   1580–1920  the crowd (under the caption: decoration only)
 */
export const VIDEO_W = 1080;
export const VIDEO_H = 1920;

export const ZONES = {
  topClear: 260,
  hud: { top: 270, bottom: 430 },
  stage: { top: 440, bottom: 1100 },
  tracks: { top: 1120, bottom: 1560 },
  crowd: 1580,
} as const;

/** Content stays between these x: clear of the cropped sides, and of the button column below y 1280. */
export const LEFT = 80;
export const RIGHT = 1000;
export const RIGHT_LOW = 920;
export const MIDDLE = 540;

/** The fighters: how wide (their height follows the figure), where they stand. */
export const FIGHTER_W = 330;
export const FIGHTER_H = (FIGHTER_W * FIGURE_ROWS) / FIGURE_COLS;
export const FEET_Y = 1080;
export const FIGHTER_X: Record<Side, number> = { L: 310, R: 760 };

/** The HUD: a portrait at each outer end, the HP bar from it towards the timer in the middle. */
export const PORTRAIT = { size: 104, top: 280 } as const;
export const BAR = { top: 292, height: 44, energyTop: 346, energyHeight: 16 } as const;
export const TIMER = { x: MIDDLE, y: 322, r: 58 } as const;
export const barSpan = (side: Side) =>
  side === "L"
    ? { x0: LEFT + PORTRAIT.size + 12, x1: TIMER.x - TIMER.r - 14 }
    : { x0: TIMER.x + TIMER.r + 14, x1: RIGHT - PORTRAIT.size - 12 };
export const portraitX = (side: Side) => (side === "L" ? LEFT : RIGHT - PORTRAIT.size);
/** The names and combos under the bars, the song's pill under the timer. */
export const NAME_Y = 396;
export const SONG_Y = 414;

/** Note tracks: notes appear at the middle and fly out to each fighter's hit ring, in three lanes by pitch. */
export const TRACK = { top: 1130, bottom: 1550, lead: 1.5 } as const;
export const TRACK_X: Record<Side, { outer: number; inner: number }> = {
  L: { outer: LEFT, inner: MIDDLE - 12 },
  R: { outer: RIGHT_LOW, inner: MIDDLE + 12 },
};
export const HIT_X: Record<Side, number> = { L: LEFT + 56, R: RIGHT_LOW - 56 };
export const LANES_Y = [1215, 1340, 1465] as const;
