import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Columns3, Drama, LayoutPanelTop, Pause, Play, Rows3, Shuffle, SkipBack, Square, Theater, Type, Video, X, ZoomIn, ZoomOut } from "lucide-react";
import { audioEngine } from "@/audio/AudioEngine";
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
import { chorusChoices, clipSeconds, highlightChoices, type Highlight } from "./highlight";
import { OPENINGS, OVERLAY_COLORS, RECORD_CLIPS, RECORD_FRAMES, RECORD_VIEWS, fallRightInset, recordLayout, safeArea, type OverlayColor, type RecordClip, type RecordFrame as Frame, type RecordView } from "./overlay";
import { Highway } from "./Highway";
import { IntroOverlay } from "./IntroOverlay";
import { INTRO_SECONDS, introTitle, planIntro } from "./introSkit";
import { FALL_TOP_SHARE } from "./drawRecordFrame";
import { hookLines, openingFrame } from "./opening";
import { OpeningOverlay } from "./OpeningOverlay";
import { StageView } from "./StageView";
import { TakeSettingsDialog } from "./TakeSettingsDialog";
import { SaveVideoDialog } from "./SaveVideoDialog";
import { cueChorus, cueHighlight, useFrameRecording, type IntroTake } from "./useFrameRecording";

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
  // the highlight's or chorus's stretch of the song (the solo round after it doesn't count);
  // "next" walks through the other good ones; a new song or mode starts from the best again
  const [choice, setChoice] = useState({ song: project.name, clip: overlay.clip, index: 0 });
  const index = choice.song === project.name && choice.clip === overlay.clip ? choice.index : 0;
  const clipList = useMemo(
    () =>
      overlay.clip === "highlight"
        ? highlightChoices(project, songEnd)
        : overlay.clip === "chorus"
          ? chorusChoices(project, songEnd)
          : [],
    [overlay.clip, project, songEnd],
  );
  const choices = clipList.length;
  const highlight: Highlight | null = choices ? clipList[index % choices]! : null;
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
    (overlay.clip === "chorus" ? t.chorusHint : t.recordClipHint)(
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
    setChoice({ song: project.name, clip: overlay.clip, index: next });
    const h = clipList[next % choices];
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
  // a take that opens with the skit: when it plays, for the recorder and the screen
  const [introTake, setIntroTake] = useState<IntroTake | null>(null);
  // the looping highlight opens on its music, whatever the setting: its end runs back into its start
  const opening = overlay.clip === "highlight" ? "cold" : overlay.opening;
  const withIntro = opening === "skit";
  const hook = useMemo(() => hookLines(overlay.hook), [overlay.hook]);
  const signTitle = introTitle(project, overlay.introTitle);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { recording, cueing, result, dismiss, discard, openedAt } = useFrameRecording(armed && supported, playing || countdown !== null, {
    width: size.width,
    height: size.height,
    keyHeight,
    laneHeight,
    safeTop: safe.top,
    safeSide: safe.side,
    keySide: safe.keySide,
    safeBottom: safe.bottom,
    fallRightInset: rightInset,
  }, highlight, introTake);
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
    if (overlay.clip !== "full") {
      if (!highlight) return useStudioStore.getState().notify({ kind: "info", text: t.highlightTooShort });
      if (withIntro) {
        // the chorus, straight after the skit and count-in (no run-up bar)
        audioEngine.setLoopRange({ start: highlight.start, end: highlight.end });
        audioEngine.seek(highlight.start);
        return startIntro(highlight.start, highlight.end);
      }
      // no countdown: the video opens on the clip's first beat (and a highlight loops back to it)
      if (overlay.clip === "chorus") cueChorus(highlight, (60 / project.baseBpm) * project.beatsPerBar);
      else cueHighlight(highlight);
      return void play();
    }
    if (fromTop) stop();
    if (withIntro) {
      const at = audioEngine.getPosition();
      return startIntro(at >= project.durationSeconds - 0.01 ? 0 : at, songEnd);
    }
    // straight on the music: the recorder starts with it
    if (opening === "cold") return void play();
    setCountdown(COUNTDOWN_SECONDS);
  };
  const openingLabel =
    overlay.clip === "highlight"
      ? t.openingLoops
      : opening === "cold"
        ? t.openingCold
        : opening === "skit"
          ? t.openingSkit
          : t.openingCountdown;
  /** The skit for this stretch of the song, Ritsu's count-in, then the music. */
  const startIntro = (from: number, to: number) => {
    const plan = planIntro(project, from, to, overlay.introTitle);
    // with hook text at the top, the skit's own sign stays away
    if (hook.length) plan.title = "";
    const timing = audioEngine.playAfterIntro(INTRO_SECONDS, plan.beats);
    if (!timing) return;
    setIntroTake({ plan, from, ...timing });
    useStudioStore.getState().setTransport("playing");
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
          style={overlay.view === "scroll" ? { paddingTop: safe.top, paddingInline: safe.side, paddingBottom: safe.bottom } : undefined}
        >
          {size.height > 0 &&
            (overlay.view === "stage" || overlay.view === "stageRoad" ? (
              <StageView
                mode={overlay.view === "stage" ? "stage" : "split"}
                insets={{ top: safe.top, side: safe.side, bottom: safe.bottom }}
                rightInset={rightInset}
                sign={() => {
                  const f = openingFrame(openedAt === null ? null : Math.max(0, audioEngine.audioTime() - openedAt), hook.length > 0, withIntro);
                  return { title: signTitle, alpha: f.stageSign, since: f.signSince };
                }}
              />
            ) : fall ? (
              <Highway rightInset={rightInset} insets={{ top: safe.top * FALL_TOP_SHARE, side: safe.side, bottom: safe.bottom }} />
            ) : (
              <Timeline laneHeight={laneHeight} labels forceFollow showcase />
            ))}
          {size.height > 0 && (openedAt !== null || (!playing && !recording && countdown === null)) && (
            <OpeningOverlay
              openedAt={openedAt}
              hook={hook}
              title={signTitle}
              skit={withIntro}
              stage={overlay.view === "stage" || overlay.view === "stageRoad"}
              width={size.width}
              height={size.height - keyHeight}
              safeTop={safe.top}
              safeSide={safe.side}
            />
          )}
          {introTake && playing && (
            <IntroOverlay
              take={introTake}
              width={size.width}
              height={size.height - keyHeight}
              safeTop={safe.top}
              safeSide={safe.side}
              safeBottom={safe.bottom}
            />
          )}
          {cueing && (
            <div className="record-cue" role="status">
              {overlay.clip === "chorus" ? t.chorusCueing : t.highlightCueing}
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
            label={t.viewNow(t.recordViews[overlay.view])}
            variant="quiet"
            className="record-controls__exit"
            disabled={recording}
            onClick={() => {
              // stage → stage over the road → falling notes → scrolling score → stage
              const next: RecordView = RECORD_VIEWS[(RECORD_VIEWS.indexOf(overlay.view) + 1) % RECORD_VIEWS.length]!;
              set({ view: next });
              useStudioStore.getState().notify({ kind: "info", text: t.viewNow(t.recordViews[next]) });
            }}
          >
            {overlay.view === "stage" ? (
              <Theater size={18} />
            ) : overlay.view === "stageRoad" ? (
              <LayoutPanelTop size={18} />
            ) : overlay.view === "fall" ? (
              <Columns3 size={18} />
            ) : (
              <Rows3 size={18} />
            )}
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
          {supported && (
            // how the take opens: on the music → the skit → a 3-2-1; each tap says which
            <IconButton
              label={openingLabel}
              variant="quiet"
              pressed={opening !== "cold"}
              disabled={recording || overlay.clip === "highlight"}
              onClick={() => {
                const next = OPENINGS[(OPENINGS.indexOf(overlay.opening) + 1) % OPENINGS.length]!;
                set({ opening: next });
                const label = next === "cold" ? t.openingCold : next === "skit" ? t.openingSkit : t.openingCountdown;
                useStudioStore.getState().notify({ kind: "info", text: label });
              }}
            >
              <Drama size={16} />
            </IconButton>
          )}
          {supported && (
            <IconButton label={t.takeSettings} variant="quiet" disabled={recording} onClick={() => setSettingsOpen(true)}>
              <Type size={16} />
            </IconButton>
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
      {settingsOpen && <TakeSettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
