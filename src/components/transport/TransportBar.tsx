import { useRef, useState } from "react";
import { Minus, Pause, Play, Plus, Repeat, SkipBack, Square, Timer, Volume2 } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { Fader } from "@/components/common/Fader";
import { ensureAudio } from "@/hooks/useAudioEngine";
import { useHideOnScroll } from "@/hooks/useHideOnScroll";
import { NARROW_QUERY, useMediaQuery } from "@/hooks/useMediaQuery";
import { usePlaybackPosition, useSoundsLoading, useSpacebarToggle, useTransport } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { MAX_BPM, MIN_BPM, barBeat, clampBpm, formatClock, songToRealSeconds } from "@/lib/time";
import { usePlayedSong } from "@/stores/playedSong";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";

function PositionReadout() {
  const clockRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLParagraphElement>(null);
  // the song as played: longer by the solo round when that's on
  const { baseBpm, bpm, beatsPerBar, durationSeconds } = usePlayedSong().project;
  const t = useT();

  usePlaybackPosition((pos) => {
    if (clockRef.current) clockRef.current.textContent = formatClock(songToRealSeconds(pos, baseBpm, bpm));
    if (barRef.current) {
      const { bar, beat } = barBeat(pos, baseBpm, beatsPerBar);
      barRef.current.textContent = t.barBeat(bar, beat);
    }
  });

  return (
    <div className="readout" aria-live="off">
      <p className="readout__clock">
        <span ref={clockRef}>0:00.0</span>
        <span className="readout__total"> / {formatClock(songToRealSeconds(durationSeconds, baseBpm, bpm))}</span>
      </p>
      <p className="readout__bar" ref={barRef}>
        {t.barBeat(1, 1)}
      </p>
    </div>
  );
}

/** lucide has no metronome; drawn in the same 24-unit, 2px-stroke style */
function MetronomeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 3h5l4.5 18H5z" />
      <path d="M7 15h10" />
      <path d="m12 15 5-9" />
    </svg>
  );
}

/** Count-in and metronome switches. Their clicks never go into recordings. */
function ClickControls() {
  const { countIn, metronome } = useStudioStore((s) => s.settings);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const t = useT();
  return (
    <div className="clicks">
      <IconButton label={countIn ? t.countInOn : t.countInOff} variant="quiet" pressed={countIn} onClick={() => updateSettings({ countIn: !countIn })}>
        <Timer size={18} />
      </IconButton>
      <IconButton
        label={metronome ? t.metronomeOn : t.metronomeOff}
        variant="quiet"
        pressed={metronome}
        onClick={() => updateSettings({ metronome: !metronome })}
      >
        <MetronomeIcon size={18} />
      </IconButton>
    </div>
  );
}

function BpmControl() {
  const bpm = useProjectStore((s) => s.project.bpm);
  const baseBpm = useProjectStore((s) => s.project.baseBpm);
  const setBpm = useProjectStore((s) => s.setBpm);
  // the song's own tempo, decimals and all (133.33): the button shows it rounded
  const original = clampBpm(baseBpm);
  const t = useT();
  // what's typed, while the field has focus: typing "90" over "150" passes through "9",
  // which a field bound straight to the tempo would throw away
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (text: string) => {
    const v = Number(text);
    if (text.trim() !== "" && Number.isFinite(v)) setBpm(v);
    setDraft(null);
  };

  return (
    <div className="bpm">
      <label htmlFor="bpm-input" className="bpm__label">
        {t.tempo}
      </label>
      <div className="bpm__field">
        <IconButton label={t.slower} variant="quiet" onClick={() => setBpm(Math.ceil(bpm - 1))} disabled={bpm <= MIN_BPM}>
          <Minus size={16} />
        </IconButton>
        <input
          id="bpm-input"
          className="bpm__input"
          type="number"
          inputMode="numeric"
          min={MIN_BPM}
          max={MAX_BPM}
          value={draft ?? bpm}
          onChange={(e) => {
            // the field keeps what's typed; a tempo in range applies at once (spinner, arrows)
            const text = e.currentTarget.value;
            const v = Number(text);
            setDraft(text);
            if (text.trim() !== "" && Number.isFinite(v) && v >= MIN_BPM && v <= MAX_BPM) setBpm(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit(e.currentTarget.value);
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
        <IconButton label={t.faster} variant="quiet" onClick={() => setBpm(Math.floor(bpm + 1))} disabled={bpm >= MAX_BPM}>
          <Plus size={16} />
        </IconButton>
        <span className="bpm__unit">BPM</span>
        <ClickControls />
      </div>
      {bpm !== original && (
        <button type="button" className="link-btn" onClick={() => setBpm(original)}>
          {t.backToTempo(Math.round(original))}
        </button>
      )}
    </div>
  );
}

export function TransportBar() {
  const { status, play, pause, stop, restart, toggle } = useTransport();
  useSpacebarToggle(toggle);
  const audioStarted = useStudioStore((s) => s.audioStarted);
  const loop = useStudioStore((s) => s.settings.loop);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const masterVolume = useProjectStore((s) => s.project.masterVolume);
  const setMasterVolume = useProjectStore((s) => s.setMasterVolume);
  const t = useT();
  // On phones the bar is pinned to the top; it slides away while scrolling down
  // and comes back on any scroll up, or when it gets keyboard focus.
  const [hidden, show] = useHideOnScroll(useMediaQuery(NARROW_QUERY));

  const loading = useSoundsLoading();
  const playing = status === "playing";

  return (
    <section className={`transport ${hidden ? "is-hidden" : ""}`} aria-label={t.transport} onFocus={show}>
      <div className="transport__buttons">
        {playing ? (
          <IconButton label={t.pause} variant="solid" className="transport__main" onClick={pause}>
            <Pause size={22} />
          </IconButton>
        ) : (
          <IconButton
            label={loading ? t.loadingSounds : t.play}
            variant="solid"
            className="transport__main"
            onClick={() => void play()}
            disabled={loading}
          >
            <Play size={22} />
          </IconButton>
        )}
        <IconButton label={t.restart} onClick={() => void restart()} disabled={loading}>
          <SkipBack size={18} />
        </IconButton>
        <IconButton label={t.stop} onClick={stop} disabled={status === "stopped" && !audioStarted}>
          <Square size={18} />
        </IconButton>
        <IconButton label={t.loop} pressed={loop} onClick={() => updateSettings({ loop: !loop })}>
          <Repeat size={18} />
        </IconButton>
      </div>

      <PositionReadout />
      <BpmControl />

      <div className="master">
        <Volume2 size={18} aria-hidden="true" />
        <Fader
          label={t.masterVolume}
          value={masterVolume}
          onChange={setMasterVolume}
          valueText={`${Math.round(masterVolume * 100)}%`}
        />
      </div>

      {!audioStarted && (
        <div className="audio-gate" role="status">
          <p>{t.audioGate}</p>
          <button type="button" className="btn btn--primary" onClick={() => void ensureAudio()}>
            {t.startAudio}
          </button>
        </div>
      )}
      {loading && (
        <p className="transport__loading" role="status">
          {t.loadingSounds}
        </p>
      )}
    </section>
  );
}
