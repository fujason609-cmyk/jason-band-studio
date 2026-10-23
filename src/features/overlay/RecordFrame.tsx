import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Columns3, Pause, Play, Rows3, Shuffle, SkipBack, Square, Video, X, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { NoticeBar } from "@/components/layout/NoticeBar";
import { MEMBERS } from "@/features/band/members";
import { MAX_ZOOM, MIN_ZOOM, RULER_HEIGHT } from "@/features/timeline/layout";
import { Timeline } from "@/features/timeline/Timeline";
import { ensureAudio } from "@/hooks/useAudioEngine";
import { usePlaybackPosition, useSoundsLoading, useSpacebarToggle, useTransport } from "@/hooks/useTransport";
import { useT } from "@/i18n/useT";
import { usePlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { BREATH_SCALE, breathAt, energyAt } from "./energy";
import { canRecordVideo } from "./frameRecorder";
import { clipSeconds, findHighlight, highlightChoices, type Highlight } from "./highlight";
import { OVERLAY_COLORS, RECORD_CLIPS, RECORD_FPS, RECORD_FRAMES, fallRightInset, recordLayout, safeArea, type OverlayColor, type RecordClip, type RecordFrame as Frame } from "./overlay";
import { Highway } from "./Highway";
import { FALL_TOP_SHARE } from "./drawRecordFrame";
import { SaveVideoDialog } from "./SaveVideoDialog";
import { cueHighlight, useFrameRecording } from "./useFrameRecording";

const ZOOM_STEP = 1.4;
/** An info notice (a new highlight picked) goes after this long; errors stay until closed. */
const NOTICE_MS = 4000;
/** Seconds counted down on screen before a take's playback starts (the video already runs). */
const COUNTDOWN_SECONDS = 3;

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
  const safe = safeArea(overlay.frame, size.width, size.height, overlay.keyStrip);
  const { keyWidth, keyHeight, laneHeight } = recordLayout(size.width, size.height, RULER_HEIGHT, MEMBERS.length, safe, overlay.keyStrip);
  const playing = status === "playing";
  const rightInset = fallRightInset(overlay.frame, size.width, overlay.keyStrip);
  // the falling view takes the whole frame and keeps to the safe area itself (its stage runs to the bottom)
  const fall = overlay.view === "fall";

  // the score swells a little on a crash or a busy bar's downbeat, as the video does
  const { project, songEnd } = usePlayedSong();
  // the highlight take's stretch of the song (the solo round after it doesn't count)
  // "next section" walks through the other good ones; a new song starts from the best again
  const [choice, setChoice] = useState({ song: project.name, index: 0 });
  const index = choice.song === project.name ? choice.index : 0;
  const highlight = useMemo(
    () => (overlay.clip === "highlight" ? findHighlight(project, songEnd, index) : null),
    [overlay.clip, project, songEnd, index],
  );
  const choices = overlay.clip === "highlight" ? highlightChoices(project, songEnd).length : 0;
  const scoreRef = useRef<HTMLDivElement>(null);
  const [reducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  usePlaybackPosition((pos) => {
    const score = scoreRef.current;
    if (!score) return;
    let breath = 0;
    const drums = project.tracks.find((tr) => tr.instrument === "drums");
    if (playing && !reducedMotion && drums) {
      const bar = (60 / project.baseBpm) * project.beatsPerBar;
      breath = breathAt(drums.notes, bar, pos, energyAt(project.tracks.map((tr) => tr.notes), bar, pos));
    }
    score.style.transform = breath > 0 ? `scale(${1 + breath * BREATH_SCALE})` : "";
  });

  const hintFor = (h: Highlight, at: number) =>
    t.recordClipHint(
      h.firstBar + 1,
      h.firstBar + h.bars,
      Math.round(clipSeconds(h, project.baseBpm, project.bpm) * 10) / 10,
      h.repeats,
      (at % Math.max(1, choices)) + 1,
      choices,
    );
  const clipHint = highlight ? hintFor(highlight, index) : "";
  /** the shuffle button: the next good stretch, said out loud (phones hide the hint line) */
  const nextHighlight = () => {
    const next = index + 1;
    setChoice({ song: project.name, index: next });
    const h = findHighlight(project, songEnd, next);
    if (h) useStudioStore.getState().notify({ kind: "info", text: hintFor(h, next) });
  };

  // notices show here too (the main page's bar isn't on screen), and info ones go by themselves
  const notice = useStudioStore((s) => s.notice);
  useEffect(() => {
    if (notice?.kind !== "info") return;
    const id = setTimeout(() => {
      if (useStudioStore.getState().notice === notice) useStudioStore.getState().notify(null);
    }, NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  // video recording: armed by default where the browser can do it; Play starts a take
  const [supported] = useState(canRecordVideo);
  const [armed, setArmed] = useState(supported);
  // a take starts with a 3-2-1 on screen: the video is already recording the still frame,
  // so it doesn't open on the first note
  const [countdown, setCountdown] = useState<number | null>(null);
  const { recording, cueing, result, dismiss, discard } = useFrameRecording(armed && supported, playing || countdown !== null, {
    width: size.width,
    height: size.height,
    keyHeight,
    laneHeight,
    safeTop: safe.top,
    safeSide: safe.side,
    keySide: safe.keySide,
    safeBottom: safe.bottom,
    fallRightInset: rightInset,
  }, highlight);
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
    if (overlay.clip === "highlight") {
      // no countdown: the video opens on the highlight's first beat, and loops back to it
      if (!highlight) return useStudioStore.getState().notify({ kind: "info", text: t.highlightTooShort });
      cueHighlight(highlight);
      return void play();
    }
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
      <div className="record-notice">
        <NoticeBar />
      </div>
      <div
        ref={frameRef}
        className="record-frame"
        data-testid="record-frame"
        style={{ "--rw": rw, "--rh": rh } as CSSProperties}
      >
        <div
          ref={scoreRef}
          className="record-frame__score"
          style={fall ? undefined : { paddingTop: safe.top, paddingInline: safe.side, paddingBottom: safe.bottom }}
        >
          {size.height > 0 && (overlay.view === "fall" ? <Highway rightInset={rightInset} insets={{ top: safe.top * FALL_TOP_SHARE, side: safe.side, bottom: safe.bottom }} /> : <Timeline laneHeight={laneHeight} labels forceFollow showcase />)}
          {cueing && (
            <div className="record-cue" role="status">
              {t.highlightCueing}
            </div>
          )}
          {countdown !== null && countdown > 0 && (
            <div className="record-countdown" role="status" aria-label={t.countdown(countdown)}>
              <span key={countdown}>{countdown}</span>
            </div>
          )}
        </div>
        {overlay.keyStrip && (
          <div
            className="record-frame__key"
            data-testid="record-key"
            style={{ background: OVERLAY_COLORS[overlay.color], height: keyHeight, width: keyWidth }}
          />
        )}
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
          <IconButton
            label={overlay.view === "fall" ? t.fallViewOn : t.fallViewOff}
            variant="quiet"
            className="record-controls__exit"
            pressed={overlay.view === "fall"}
            disabled={recording}
            onClick={() => set({ view: overlay.view === "fall" ? "scroll" : "fall" })}
          >
            {overlay.view === "fall" ? <Columns3 size={18} /> : <Rows3 size={18} />}
          </IconButton>
          {supported && (
            <IconButton
              label={recording ? t.recordingNow : armed ? t.recordVideoOn : t.recordVideoOff}
              className={`rec-btn ${recording ? "is-recording" : ""}`}
              pressed={armed}
              disabled={recording}
              onClick={() => setArmed((a) => !a)}
            >
              <Video size={18} />
            </IconButton>
          )}
          <IconButton label={t.exitRecord} onClick={() => setRecordMode(false)}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="record-controls__row">
          <div className="swatches" role="radiogroup" aria-label={t.overlayColor}>
            <button
              type="button"
              role="radio"
              aria-checked={!overlay.keyStrip}
              aria-label={t.noKeyStrip}
              title={t.noKeyStripHint}
              className="swatch swatch--none"
              disabled={recording}
              onClick={() => set({ keyStrip: false })}
            />
            {(Object.keys(OVERLAY_COLORS) as OverlayColor[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={overlay.keyStrip && overlay.color === c}
                aria-label={t.overlayColors[c]}
                title={t.overlayColors[c]}
                className="swatch"
                style={{ "--swatch": OVERLAY_COLORS[c] } as CSSProperties}
                disabled={recording}
                onClick={() => set({ color: c, keyStrip: true })}
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
          {supported && (
            <select
              aria-label={t.recordClip}
              title={highlight ? clipHint : t.recordClip}
              value={overlay.clip}
              disabled={recording}
              onChange={(e) => set({ clip: e.currentTarget.value as RecordClip })}
            >
              {RECORD_CLIPS.map((c) => (
                <option key={c} value={c}>
                  {t.recordClips[c]}
                </option>
              ))}
            </select>
          )}
          {supported && choices > 1 && (
            <IconButton
              label={t.highlightNext}
              title={clipHint}
              variant="quiet"
              className="record-controls__shuffle"
              disabled={recording}
              onClick={nextHighlight}
            >
              <Shuffle size={16} />
              <span className="record-controls__choice">
                {(index % choices) + 1}/{choices}
              </span>
            </IconButton>
          )}
        </div>
        {supported ? (
          <p className="record-controls__hint">
            {highlight ? clipHint : t.recordHint}
          </p>
        ) : (
          <p className="record-controls__warn">{t.recordingUnsupported}</p>
        )}
      </div>
      {result && <SaveVideoDialog video={result} onClose={dismiss} />}
    </div>
  );
}
