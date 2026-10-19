import { Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { audioEngine } from "@/audio/AudioEngine";
import { IconButton } from "@/components/common/IconButton";
import { MidiImportButton } from "@/features/midi/MidiImport";
import { useT } from "@/i18n/useT";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import type { ThemeSetting } from "@/services/storage/settingsStorage";

const NEXT_THEME: Record<ThemeSetting, ThemeSetting> = { system: "light", light: "dark", dark: "system" };

export function StudioHeader() {
  const name = useProjectStore((s) => s.project.name);
  const resetToDemo = useProjectStore((s) => s.resetToDemo);
  const hasImport = useProjectStore((s) => Boolean(s.project.midiMeta));
  const theme = useStudioStore((s) => s.settings.theme);
  const language = useStudioStore((s) => s.settings.language);
  const t = useT();
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const setTransport = useStudioStore((s) => s.setTransport);
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <header className="studio-header">
      <div className="lockup">
        <h1 className="lockup__ja" lang="ja">
          放課後ティータイム
        </h1>
        <p className="lockup__en">{t.appSubtitle}</p>
      </div>
      <div className="studio-header__song">
        <p className="song-name" title={name}>
          {name}
        </p>
        <div className="studio-header__actions">
          <MidiImportButton />
          <IconButton
            label={t.loadDemo}
            onClick={() => {
              if (hasImport && !window.confirm(t.confirmReplaceWithDemo(name))) return;
              audioEngine.stop();
              setTransport("stopped");
              resetToDemo();
            }}
          >
            <RotateCcw size={18} />
          </IconButton>
          <IconButton label={t.theme[theme]} onClick={() => updateSettings({ theme: NEXT_THEME[theme] })}>
            <ThemeIcon size={18} />
          </IconButton>
          <IconButton
            label={t.switchLanguage}
            className="lang-btn"
            onClick={() => updateSettings({ language: language === "zh" ? "en" : "zh" })}
          >
            <span aria-hidden="true">{t.otherLanguageShort}</span>
          </IconButton>
        </div>
      </div>
    </header>
  );
}
