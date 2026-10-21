import { isMemberId } from "@/features/band/members";
import type { MemberId } from "@/features/band/types";
import { DEFAULT_OVERLAY, sanitizeOverlay, type OverlaySettings } from "@/features/overlay/overlay";
import { detectLanguage, type Language } from "@/i18n/strings";
import type { FeelSetting } from "@/lib/feel";
import { isPlayStyle, type PlayStyle } from "@/lib/playStyle";
import { DEFAULT_VOCALS, DEFAULT_VOCAL_SOUNDS, isVocalSound, type VocalSounds, type VocalSwitches } from "@/features/band/vocals";
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
  /** after the song, each member plays a 4-bar solo in turn (lib/soloRound) */
  soloRound: boolean;
  /** one bar of clicks before playback starts */
  countIn: boolean;
  /** a click on every beat while playing */
  metronome: boolean;
  /** Yui's lead vocal and Mio's harmony, each on or off */
  vocals: VocalSwitches;
  /** what plays each vocal part: the synthesized voice or an instrument */
  vocalSounds: VocalSounds;
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
  soloRound: false,
  countIn: false,
  metronome: false,
  vocals: DEFAULT_VOCALS,
  vocalSounds: DEFAULT_VOCAL_SOUNDS,
};

const KEY = "kon-band-studio:settings:v1";

function sanitizeVocals(raw: unknown): VocalSwitches {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    lead: typeof r.lead === "boolean" ? r.lead : DEFAULT_VOCALS.lead,
    harmony: typeof r.harmony === "boolean" ? r.harmony : DEFAULT_VOCALS.harmony,
  };
}

function sanitizeVocalSounds(raw: unknown): VocalSounds {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    lead: isVocalSound(r.lead) ? r.lead : DEFAULT_VOCAL_SOUNDS.lead,
    harmony: isVocalSound(r.harmony) ? r.harmony : DEFAULT_VOCAL_SOUNDS.harmony,
  };
}

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
    soloRound: typeof r.soloRound === "boolean" ? r.soloRound : DEFAULT_SETTINGS.soloRound,
    countIn: typeof r.countIn === "boolean" ? r.countIn : DEFAULT_SETTINGS.countIn,
    metronome: typeof r.metronome === "boolean" ? r.metronome : DEFAULT_SETTINGS.metronome,
    vocals: sanitizeVocals(r.vocals),
    vocalSounds: sanitizeVocalSounds(r.vocalSounds),
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
