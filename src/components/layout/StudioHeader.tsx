import { Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { audioEngine } from "@/audio/AudioEngine";
import { IconButton } from "@/components/common/IconButton";
import { MidiImportButton } from "@/features/midi/MidiImport";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import type { ThemeSetting } from "@/services/storage/settingsStorage";

const NEXT_THEME: Record<ThemeSetting, ThemeSetting> = { system: "light", light: "dark", dark: "system" };
const THEME_LABEL: Record<ThemeSetting, string> = {
  system: "Theme follows your system. Switch to light",
  light: "Light theme. Switch to dark",
  dark: "Dark theme. Switch to system",
};

export function StudioHeader() {
  const name = useProjectStore((s) => s.project.name);
  const resetToDemo = useProjectStore((s) => s.resetToDemo);
  const hasImport = useProjectStore((s) => Boolean(s.project.midiMeta));
  const theme = useStudioStore((s) => s.settings.theme);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const setTransport = useStudioStore((s) => s.setTransport);
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <header className="studio-header">
      <div className="lockup">
        <h1 className="lockup__ja" lang="ja">
          放課後ティータイム
        </h1>
        <p className="lockup__en">After School Tea Time Band Studio</p>
      </div>
      <div className="studio-header__song">
        <p className="song-name" title={name}>
          {name}
        </p>
        <div className="studio-header__actions">
          <MidiImportButton />
          <IconButton
            label="Load the demo song"
            onClick={() => {
              if (hasImport && !window.confirm(`Replace ${name} with the demo song? Your mixer settings for it will be lost.`)) return;
              audioEngine.stop();
              setTransport("stopped");
              resetToDemo();
            }}
          >
            <RotateCcw size={18} />
          </IconButton>
          <IconButton label={THEME_LABEL[theme]} onClick={() => updateSettings({ theme: NEXT_THEME[theme] })}>
            <ThemeIcon size={18} />
          </IconButton>
        </div>
      </div>
    </header>
  );
}
