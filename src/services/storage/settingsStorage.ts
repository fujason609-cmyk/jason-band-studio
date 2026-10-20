import { isMemberId } from "@/features/band/members";
import type { MemberId } from "@/features/band/types";
import { DEFAULT_OVERLAY, sanitizeOverlay, type OverlaySettings } from "@/features/overlay/overlay";
import { detectLanguage, type Language } from "@/i18n/strings";
import type { FeelSetting } from "@/lib/feel";
import { isPlayStyle, type PlayStyle } from "@/lib/playStyle";
import { isKeysPatch, type KeysPatch } from "@/audio/keysPatches";

export type ThemeSetting = "system" | "light" | "dark";

export interface StudioSettings {
  theme: ThemeSetting;
  language: Language;
  selectedMember: MemberId;
  loop: boolean;
  followPlayhead: boolean;
  /** pixels per song second on the timeline */
  zoom: number;
  /** chroma-key box for video editing */
  overlay: OverlaySettings;
  /** members play with their own timing and dynamics, or strictly on the grid */
  feel: FeelSetting;
  /** Mugi's Triton sound for every keys track */
  keysPatch: KeysPatch;
  /** the genre the band plays the score in */
  playStyle: PlayStyle;
  /** in rock and punk, play a generated beat when the score has no drum part */
  autoDrums: boolean;
  /** one bar of clicks before playback starts */
  countIn: boolean;
  /** a click on every beat while playing */
  metronome: boolean;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  theme: "system",
  language: detectLanguage(),
  selectedMember: "yui",
  loop: false,
  followPlayhead: true,
  zoom: 60,
  overlay: DEFAULT_OVERLAY,
  feel: "character",
  keysPatch: "piano",
  playStyle: "original",
  autoDrums: true,
  countIn: false,
  metronome: false,
};

const KEY = "kon-band-studio:settings:v1";

export function sanitizeSettings(raw: unknown): StudioSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    theme: r.theme === "light" || r.theme === "dark" || r.theme === "system" ? r.theme : DEFAULT_SETTINGS.theme,
    language: r.language === "en" || r.language === "zh" ? r.language : DEFAULT_SETTINGS.language,
    selectedMember: isMemberId(r.selectedMember) ? r.selectedMember : DEFAULT_SETTINGS.selectedMember,
    loop: typeof r.loop === "boolean" ? r.loop : DEFAULT_SETTINGS.loop,
    followPlayhead: typeof r.followPlayhead === "boolean" ? r.followPlayhead : DEFAULT_SETTINGS.followPlayhead,
    zoom:
      typeof r.zoom === "number" && Number.isFinite(r.zoom) ? Math.min(240, Math.max(15, r.zoom)) : DEFAULT_SETTINGS.zoom,
    overlay: sanitizeOverlay(r.overlay),
    feel: r.feel === "steady" || r.feel === "character" ? r.feel : DEFAULT_SETTINGS.feel,
    keysPatch: isKeysPatch(r.keysPatch) ? r.keysPatch : DEFAULT_SETTINGS.keysPatch,
    playStyle: isPlayStyle(r.playStyle) ? r.playStyle : DEFAULT_SETTINGS.playStyle,
    autoDrums: typeof r.autoDrums === "boolean" ? r.autoDrums : DEFAULT_SETTINGS.autoDrums,
    countIn: typeof r.countIn === "boolean" ? r.countIn : DEFAULT_SETTINGS.countIn,
    metronome: typeof r.metronome === "boolean" ? r.metronome : DEFAULT_SETTINGS.metronome,
  };
}

export function loadSettings(): StudioSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: StudioSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage full or blocked (private mode) — settings just won't persist */
  }
}
