import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, SkipBack, Square, Video, X, ZoomIn, ZoomOut } from "lucide-react";
import { audioEngine } from "@/audio/AudioEngine";
import { IconButton } from "@/components/common/IconButton";
import { MEMBERS } from "@/features/band/members";
import { MAX_ZOOM, MIN_ZOOM, RULER_HEIGHT } from "@/features/timeline/layout";
import { Timeline } from "@/features/timeline/Timeline";
import { ensureAudio } from "@/hooks/useAudioEngine";
import { usePlaybackPosition, useSoundsLoading, useSpacebarToggle, useTransport } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { usePlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { canRecordVideo } from "./frameRecorder";
import {
  MAX_TAKE_SECONDS,
  MIN_TAKE_SECONDS,
  OVERLAY_COLORS,
  RECORD_FPS,
  RECORD_FRAMES,
  TAKE_PRESETS,
  advanceTake,
  clampTakeSeconds,
  recordLayout,
  safeArea,
  startTake,
  takeProgress,
  type OverlayColor,
  type RecordFrame as Frame,
  type TakeLength,
} from "./overlay";
import { SaveVideoDialog } from "./SaveVideoDialog";
import { useFrameRecording } from "./useFrameRecording";

const ZOOM_STEP = 1.4;
/** Seconds counted down on screen before a take's playback starts (the video already runs). */
const COUNTDOWN_SECONDS = 3;

/** Reels: the song's name over a five-colour progress bar, in the safe area's top band. */
function RecordBanner({ height, progress }: { height: number; progress: () => number }) {
  const { project } = usePlayedSong();
  const rest = useRef<HTMLDivElement>(null);
  usePlaybackPosition(() => {
    if (rest.current) rest.current.style.width = `${(1 - progress()) * 100}%`;
  });
  return (
    <div className="record-banner" style={{ height }} aria-hidden="true">
      <p className="record-banner__title">{project.name}</p>
      <div className="record-banner__bar">
        <div ref={rest} className="record-banner__rest" />
      </div>
    </div>
  );
}

/** The take length: the whole song, a preset, or a number of seconds typed in. */
function TakeLengthPicker({ length, disabled, onChange }: { length: TakeLength; disabled: boolean; onChange: (l: TakeLength) => void }) {
  const t = useT();
  const preset = length === "song" || (TAKE_PRESETS as readonly number[]).includes(length);
  const [custom, setCustom] = useState(!preset);
  // what's typed, until it's a length (5 s and up) or the field is left
  const [draft, setDraft] = useState<string | null>(null);
  const seconds = typeof length === "number" ? length : 60;
  const commit = (text: string) => {
    const v = Number(text);
    if (text.trim() !== "" && Number.isFinite(v)) onChange(clampTakeSeconds(v));
    setDraft(null);
  };
  return (
    <span className="take-length" title={t.recordLengthHint}>
      <span className="take-length__label" aria-hidden="true">
        {t.recordLength}
      </span>
      <select
        aria-label={t.recordLength}
        value={custom ? "custom" : String(length)}
        disabled={disabled}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setCustom(v === "custom");
          if (v === "song") onChange("song");
          else if (v === "custom") onChange(seconds);
          else onChange(Number(v));
        }}
      >
        <option value="song">{t.recordLengths.song}</option>
        {TAKE_PRESETS.map((n) => (
          <option key={n} value={n}>
            {t.recordSeconds(n)}
          </option>
        ))}
        <option value="custom">{t.recordLengths.custom}</option>
      </select>
      {custom && (
        <label className="take-length__custom">
          <input
            type="number"
            inputMode="numeric"
            aria-label={t.recordCustomSeconds}
            min={MIN_TAKE_SECONDS}
            max={MAX_TAKE_SECONDS}
            value={draft ?? seconds}
            disabled={disabled}
            onChange={(e) => {
              const text = e.currentTarget.value;
              const v = Number(text);
              setDraft(text);
              if (text.trim() !== "" && Number.isInteger(v) && v >= MIN_TAKE_SECONDS && v <= MAX_TAKE_SECONDS) onChange(v);
            }}
            onKeyDown={(e) => e.key === "Enter" && commit(e.currentTarget.value)}
            onBlur={(e) => commit(e.currentTarget.value)}
          />
          <span aria-hidden="true">{t.secondsUnit}</span>
        </label>
      )}
    </span>
  );
}

/**
 * Full-screen Instagram recording frame: the timeline on top and a 16:9 strip of
 * key colour below (room for landscape anime footage), inside one box of the
 * chosen IG shape. The score gets all the height the key strip doesn't need. Controls sit under the box, so a
 * screen recording cropped to the box shows only the score and the key colour.
 */
export function RecordFrame() {
  const overlay = useStudioStore((s) => s.settings.overlay);
  const zoom = useStudioStore((s) => s.settings.zoom);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const setRecordMode = useStudioStore((s) => s.setRecordMode);
  const { status, play, pause, stop, restart } = useTransport();
  const t = useT();

  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => setSize({ width: frame.clientWidth, height: frame.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    measure();
    return () => ro.disconnect();
  }, []);

  // Esc leaves the frame, except while the save dialog is up: there it only closes the dialog
  const saving = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving.current) setRecordMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setRecordMode]);

  const set = (patch: Partial<typeof overlay>) => updateSettings({ overlay: { ...overlay, ...patch } });
  const setZoom = (next: number) => updateSettings({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)) });
  const [rw, rh] = overlay.frame.split(":").map(Number) as [number, number];
  // Reels: the score keeps clear of Instagram's top bar and the sides cut off on tall phones
  const safe = safeArea(overlay.frame, size.width, size.height);
  const { keyWidth, keyHeight, laneHeight } = recordLayout(size.width, size.height, RULER_HEIGHT, MEMBERS.length, safe);
  const playing = status === "playing";

  // the take clock: how much has been played since Play, for the progress bar and to stop
  // the take at its length
  const { project } = usePlayedSong();
  const loop = useStudioStore((s) => s.settings.loop);
  const take = useRef(startTake(0));
  const progress = useRef(0);
  useEffect(() => {
    if (playing) take.current = startTake(audioEngine.getPosition());
  }, [playing]);
  usePlaybackPosition((pos) => {
    if (playing) advanceTake(take.current, pos, project.durationSeconds);
    const now = takeProgress(take.current, overlay.length, pos, { ...project, loop });
    progress.current = now.progress;
    if (now.done && playing) pause();
  });

  // video recording: armed by default where the browser can do it; Play starts a take
  const [supported] = useState(canRecordVideo);
  const [armed, setArmed] = useState(supported);
  // a take starts with a 3-2-1 on screen: the video is already recording the still frame,
  // so it doesn't open on the first note
  const [countdown, setCountdown] = useState<number | null>(null);
  const { recording, result, dismiss, discard } = useFrameRecording(armed && supported, playing || countdown !== null, {
    width: size.width,
    height: size.height,
    keyHeight,
    laneHeight,
    safeTop: safe.top,
    safeSide: safe.side,
    keySide: safe.keySide,
    progress: () => progress.current,
  });
  saving.current = result !== null;
  const loading = useSoundsLoading();
  // the 800 ms tail after a take: the picture is frozen and the video still being written
  const finishing = recording && !playing && countdown === null;
  // counts countdowns, so one cancelled as it reaches 0 doesn't play anyway
  const countdownRun = useRef(0);
  // leaving the frame cancels a countdown still starting playback (or the song would start
  // on the main page after you left)
  useEffect(
    () => () => {
      countdownRun.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (countdown === null || countdown === 0) return;
    const id = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown]);
  useEffect(() => {
    if (countdown !== 0) return;
    // keep counting as "rolling" until the transport says playing, so the take isn't cut
    const run = countdownRun.current;
    void play()
      .then(() => {
        if (run !== countdownRun.current) pause(); // cancelled while play() was starting
      })
      .finally(() => setCountdown(null));
  }, [countdown, play, pause]);

  /** Play, through the countdown when this starts a new take. */
  const start = async (fromTop: boolean) => {
    if (countdown !== null || finishing || loading) return;
    if (!armed || !supported || recording) return void (fromTop ? restart() : play());
    // unlock audio now, inside the tap: the countdown's timer isn't a user gesture
    if (!(await ensureAudio())) return;
    if (fromTop) stop();
    setCountdown(COUNTDOWN_SECONDS);
  };
  const cancelCountdown = () => {
    countdownRun.current += 1;
    setCountdown(null);
    discard();
  };
  const halt = (action: () => void) => () => (countdown !== null ? cancelCountdown() : action());
  useSpacebarToggle(() => (playing || countdown !== null ? halt(pause)() : void start(false)));

  return (
    <div className="record-view" role="region" aria-label={t.recordMode}>
      <div
        ref={frameRef}
        className="record-frame"
        data-testid="record-frame"
        style={{ "--rw": rw, "--rh": rh } as CSSProperties}
      >
        <div className="record-frame__score" style={{ paddingTop: safe.top, paddingInline: safe.side }}>
          {safe.top > 0 && <RecordBanner height={safe.top} progress={() => progress.current} />}
          {size.height > 0 && <Timeline laneHeight={laneHeight} labels forceFollow showcase />}
          {countdown !== null && countdown > 0 && (
            <div className="record-countdown" role="status" aria-label={t.countdown(countdown)}>
              <span key={countdown}>{countdown}</span>
            </div>
          )}
        </div>
        <div
          className="record-frame__key"
          data-testid="record-key"
          style={{ background: OVERLAY_COLORS[overlay.color], height: keyHeight, width: keyWidth }}
        />
      </div>

      <div className="record-controls">
        <div className="record-controls__row">
          {playing || countdown !== null ? (
            <IconButton label={t.pause} variant="solid" className="transport__main" onClick={halt(pause)}>
              <Pause size={22} />
            </IconButton>
          ) : (
            <IconButton
              label={loading ? t.loadingSounds : t.play}
              variant="solid"
              className="transport__main"
              onClick={() => void start(false)}
              disabled={loading || finishing}
            >
              <Play size={22} />
            </IconButton>
          )}
          <IconButton label={t.restart} onClick={() => void start(true)} disabled={loading || finishing}>
            <SkipBack size={18} />
          </IconButton>
          <IconButton label={t.stop} onClick={halt(stop)}>
            <Square size={18} />
          </IconButton>
          <IconButton label={t.zoomOut} variant="quiet" onClick={() => setZoom(zoom / ZOOM_STEP)} disabled={zoom <= MIN_ZOOM}>
            <ZoomOut size={16} />
          </IconButton>
          <IconButton label={t.zoomIn} variant="quiet" onClick={() => setZoom(zoom * ZOOM_STEP)} disabled={zoom >= MAX_ZOOM}>
            <ZoomIn size={16} />
          </IconButton>
          {supported && (
            <IconButton
              label={recording ? t.recordingNow : armed ? t.recordVideoOn : t.recordVideoOff}
              className={`rec-btn record-controls__exit ${recording ? "is-recording" : ""}`}
              pressed={armed}
              disabled={recording}
              onClick={() => setArmed((a) => !a)}
            >
              <Video size={18} />
            </IconButton>
          )}
          <IconButton label={t.exitRecord} className={supported ? "" : "record-controls__exit"} onClick={() => setRecordMode(false)}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="record-controls__row">
          <div className="swatches" role="radiogroup" aria-label={t.overlayColor}>
            {(Object.keys(OVERLAY_COLORS) as OverlayColor[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={overlay.color === c}
                aria-label={t.overlayColors[c]}
                title={t.overlayColors[c]}
                className="swatch"
                style={{ "--swatch": OVERLAY_COLORS[c] } as CSSProperties}
                disabled={recording}
                onClick={() => set({ color: c })}
              />
            ))}
          </div>
          <select
            aria-label={t.recordFrame}
            value={overlay.frame}
            disabled={recording}
            onChange={(e) => set({ frame: e.currentTarget.value as Frame })}
          >
            {RECORD_FRAMES.map((f) => (
              <option key={f} value={f}>
                {t.recordFrames[f]}
              </option>
            ))}
          </select>
          {supported && (
            <select
              aria-label={t.recordFps}
              title={t.recordFpsHint}
              value={overlay.fps}
              disabled={recording}
              onChange={(e) => set({ fps: Number(e.currentTarget.value) === 60 ? 60 : 30 })}
            >
              {RECORD_FPS.map((fps) => (
                <option key={fps} value={fps}>
                  {t.recordFpsOptions[fps]}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="record-controls__row">
          <TakeLengthPicker length={overlay.length} disabled={recording} onChange={(length) => set({ length })} />
        </div>
        {supported ? (
          <p className="record-controls__hint">{t.recordHint}</p>
        ) : (
          <p className="record-controls__warn">{t.recordingUnsupported}</p>
        )}
      </div>
      {result && <SaveVideoDialog video={result} onClose={dismiss} />}
    </div>
  );
}
