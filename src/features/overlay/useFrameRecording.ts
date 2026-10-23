import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { buildLanes, readPalette } from "@/features/timeline/lanes";
import { getT } from "@/i18n/useT";
import { getPlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { drawRecordFrame } from "./drawRecordFrame";
import { FrameRecorder, type Recording } from "./frameRecorder";
import { clipSeconds, loopNotes, type Highlight } from "./highlight";
import { OVERLAY_COLORS } from "./overlay";

/** Video width in pixels; the height follows the frame shape (1080 × 1920 for 9:16). */
export const VIDEO_WIDTH = 1080;
/** Keep recording this long after playback stops, so ringing notes and cymbals end naturally. */
const TAIL_MS = 800;
/**
 * The captured sound reaches the recorder a little after the audio clock says it plays
 * (measured in Chrome: 27–88 ms, about 50 on average, at a 30 fps frame resolution), so
 * the picture is drawn this much later to keep the video in sync.
 */
const PICTURE_DELAY_SECONDS = 0.04;
/** A take ends by itself after this long (with Loop on a forgotten one would fill the memory). */
export const MAX_TAKE_MINUTES = 20;

/**
 * Gets the engine ready for a highlight take: loop just the clip, and start a bar before
 * its end, so the first loop the recorder hears already has the last bar ringing into it.
 */
export function cueHighlight(clip: Highlight) {
  audioEngine.setLoopRange({ start: clip.start, end: clip.end });
  audioEngine.seek(Math.max(clip.start, clip.end - (clip.end - clip.start) / clip.bars));
}

/**
 * The stage pets in a highlight take: their paths repeat once per clip. A clip that
 * plays its stretch twice spans two loops, so it counts the loops as they come round.
 */
function clipLoop(s: { lastPos: number; wraps: number; loopPos: number }, clip: Highlight) {
  const length = clip.end - clip.start;
  if (s.lastPos < s.loopPos - length / 2) s.wraps += 1;
  s.loopPos = s.lastPos;
  return { start: clip.start, length: length * clip.repeats, at: s.lastPos + (s.wraps % clip.repeats) * length };
}

/** Stop playing the way the Pause button does, which ends the take; tell the user why. */
function pauseTake(text: string) {
  audioEngine.pause();
  const studio = useStudioStore.getState();
  studio.setTransport("paused");
  studio.notify({ kind: "info", text });
}

export interface FrameLayout {
  width: number;
  height: number;
  keyHeight: number;
  laneHeight: number;
  safeTop: number;
  safeSide: number;
  keySide: number;
  safeBottom: number;
  fallRightInset: number;
}

interface Session {
  recorder: FrameRecorder;
  /** a highlight take: the recorder waits for the loop to come round, then records one loop */
  clip: Highlight | null;
  /** highlight: the recorder is running (it starts at the loop point, not at once) */
  rolling: boolean;
  /** highlight: where the sound was when the take began (NaN until the first frame), to see it move */
  cuedAt: number;
  /** highlight: times the loop has come round, and the position on the last frame (for the turtle) */
  wraps: number;
  loopPos: number;
  timers: number[];
  canvas: HTMLCanvasElement;
  frame: number;
  /** set once playback stops: the picture holds here for the tail */
  frozenAt: number | null;
  /** the last position drawn while playing (Stop and the song's end put the clock back to 0) */
  lastPos: number;
  startedAt: number;
  /** removes the page-visibility listener */
  unlisten: () => void;
}

/**
 * Records the recording frame while it plays. The frame is repainted by the app onto an
 * off-page canvas at VIDEO_WIDTH (same drawing as the page, with the playhead following
 * the sound being heard), and the audio is the band's master output only.
 *
 * Starts when `rolling` turns on (if `armed`): that's playback, or the countdown before
 * it. Stops when it turns off, and hands back the finished video as `result` for the
 * save dialog; `discard` throws the current take away instead.
 *
 * With a `clip` (the highlight take) the caller loops that stretch and starts playing a
 * little before its end; the recorder starts when the loop comes round to its start and
 * stops exactly one loop later, so the video's end runs straight into its start (sound
 * still ringing from the last bar is in the first, as it is when Instagram loops it). The
 * picture draws the clip's notes looped too. `cueing` is true until the recorder starts.
 */
export function useFrameRecording(armed: boolean, rolling: boolean, layout: FrameLayout, clip: Highlight | null = null) {
  const [recording, setRecording] = useState(false);
  const [cueing, setCueing] = useState(false);
  const latestClip = useRef(clip);
  latestClip.current = clip;
  const [result, setResult] = useState<Recording | null>(null);
  const session = useRef<Session | null>(null);
  const discardSession = useCallback((s: Session) => {
    cancelAnimationFrame(s.frame);
    s.timers.forEach((id) => clearTimeout(id));
    s.unlisten();
    void s.recorder.stop().then((v) => URL.revokeObjectURL(v.url));
    audioEngine.stopAudioCapture();
    if (s.clip) audioEngine.setLoopRange(null);
    s.canvas.remove();
    session.current = null;
    setRecording(false);
    setCueing(false);
  }, []);
  const latestLayout = useRef(layout);
  latestLayout.current = layout;
  const wants = useRef({ armed, rolling });
  wants.current = { armed, rolling };

  /** Highlight: one loop recorded; stop the music, put the song back and hand over the video. */
  const endClip = useCallback(async (s: Session) => {
    if (session.current !== s) return;
    s.frozenAt = s.lastPos;
    s.unlisten();
    const video = await s.recorder.stop();
    cancelAnimationFrame(s.frame);
    audioEngine.stopAudioCapture();
    s.canvas.remove();
    session.current = null;
    setRecording(false);
    setResult(video);
    audioEngine.pause();
    audioEngine.setLoopRange(null);
    audioEngine.seek(s.clip!.start);
    useStudioStore.getState().setTransport("paused");
  }, []);

  /**
   * Highlight: start the recorder at the loop point, `waitMs` from now, and stop it one loop
   * later. Timed from the audio clock, not from frames: a slow frame noticed the loop come
   * round late (0.7 s in headless Chrome).
   */
  const startClip = useCallback((s: Session, waitMs: number) => {
    const clip = s.clip!;
    s.rolling = true;
    // the sound reaches the recorder ~50 ms after the clock says it plays: starting that much
    // later puts the downbeat at the start of the file. The length is what has to be exact
    // (the loop's), and both ends share the same delay.
    const { baseBpm, bpm } = getPlayedSong().project;
    const loopMs = clipSeconds(clip, baseBpm, bpm) * 1000;
    s.timers.push(
      window.setTimeout(() => {
        if (session.current !== s) return;
        s.recorder.start();
        setCueing(false);
        s.timers.push(window.setTimeout(() => void endClip(s), loopMs));
      }, waitMs + PICTURE_DELAY_SECONDS * 1000),
    );
  }, [endClip]);

  const begin = useCallback(() => {
    if (session.current || latestLayout.current.width === 0) return;
    const audio = audioEngine.captureAudio();
    if (!audio) return;
    // layout and scale are fixed for the whole take (the frame controls are locked meanwhile).
    // The video is exactly Instagram's size (1080 × 1920 / 1350 / 1080), so the scene's
    // height is derived from it rather than from the frame's rounded on-screen height.
    const [rw, rh] = useStudioStore.getState().settings.overlay.frame.split(":").map(Number) as [number, number];
    const scale = VIDEO_WIDTH / latestLayout.current.width;
    const canvas = document.createElement("canvas");
    canvas.width = VIDEO_WIDTH;
    canvas.height = Math.round((VIDEO_WIDTH * rh) / rw);
    const l = { ...latestLayout.current, height: canvas.height / scale };
    canvas.className = "record-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas); // some browsers only capture a canvas that is in the page
    const ctx = canvas.getContext("2d")!;
    const palette = readPalette();
    const ripples = !matchMedia("(prefers-reduced-motion: reduce)").matches;

    const clip = latestClip.current;
    let recorder: FrameRecorder;
    try {
      recorder = new FrameRecorder(canvas, audio, useStudioStore.getState().settings.overlay.fps);
      if (!clip) recorder.start();
    } catch {
      // the browser said it could record this type, then couldn't: no take, and say so
      canvas.remove();
      audioEngine.stopAudioCapture();
      useStudioStore.getState().notify({ kind: "error", text: getT().recordingFailed });
      return;
    }
    // pictures are only painted while the page is on screen: a hidden tab would freeze the
    // video while the sound goes on, so hiding it pauses, which ends the take
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && audioEngine.status === "playing") pauseTake(getT().recordingHidden);
    };
    document.addEventListener("visibilitychange", onVisibility);
    const s: Session = {
      recorder,
      clip,
      rolling: clip === null,
      cuedAt: NaN,
      wraps: 0,
      loopPos: 0,
      timers: [],
      canvas,
      frame: 0,
      frozenAt: null,
      lastPos: 0,
      startedAt: performance.now(),
      unlisten: () => document.removeEventListener("visibilitychange", onVisibility),
    };
    const paint = () => {
      if (audioEngine.status === "playing") s.lastPos = Math.max(0, audioEngine.getAudiblePosition() - PICTURE_DELAY_SECONDS);
      if (s.clip && !s.rolling && audioEngine.status === "playing") {
        const heard = audioEngine.getAudiblePosition();
        const { baseBpm, bpm } = getPlayedSong().project;
        if (Number.isNaN(s.cuedAt)) s.cuedAt = heard;
        // once the sound is moving (after a count-in, if any): the loop point is this far off
        else if (heard < s.cuedAt - 0.01) startClip(s, 0); // already came round
        else if (heard > s.cuedAt + 0.01) startClip(s, (((s.clip.end - heard) * baseBpm) / Math.max(1, bpm)) * 1000);
      }
      if (s.frozenAt === null && performance.now() - s.startedAt > MAX_TAKE_MINUTES * 60_000 && audioEngine.status === "playing") {
        pauseTake(getT().recordingTooLong(MAX_TAKE_MINUTES));
      }
      const { project, spots } = getPlayedSong();
      const { settings } = useStudioStore.getState();
      const lanes = buildLanes(project, palette, getT().memberName, settings.selectedMember, settings.vocals, s.clip ? [] : spots);
      const shown = s.clip
        ? lanes.map((lane) => ({ ...lane, notes: loopNotes(lane.notes, s.clip!), vocal: lane.vocal && { ...lane.vocal, notes: loopNotes(lane.vocal.notes, s.clip!) } }))
        : lanes;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawRecordFrame(ctx, {
        ...l,
        zoom: settings.zoom,
        position: s.frozenAt ?? s.lastPos,
        durationSeconds: project.durationSeconds,
        baseBpm: project.baseBpm,
        beatsPerBar: project.beatsPerBar,
        lanes: shown,
        loop: s.clip ? clipLoop(s, s.clip) : undefined,
        palette,
        keyColor: OVERLAY_COLORS[settings.overlay.color],
        ripples: ripples && audioEngine.status === "playing",
        view: settings.overlay.view,
      });
      s.frame = requestAnimationFrame(paint);
    };
    session.current = s;
    paint();
    setRecording(true);
    setCueing(clip !== null);
  }, [startClip]);

  const finish = useCallback(async () => {
    const s = session.current;
    if (!s || s.frozenAt !== null) return;
    if (s.clip) {
      // stopped before the loop was recorded whole: a part of a loop doesn't loop
      discardSession(s);
      useStudioStore.getState().notify({ kind: "info", text: getT().highlightCut });
      return;
    }
    // where the picture last was while playing: after Stop or the song's end the clock
    // already reads 0, and the video would end on the first bar
    s.frozenAt = s.lastPos;
    s.unlisten();
    await new Promise((resolve) => setTimeout(resolve, TAIL_MS));
    // thrown away meanwhile (left the frame): nothing to finish, and the audio capture may
    // already belong to a new take
    if (session.current !== s) return;
    cancelAnimationFrame(s.frame);
    const video = await s.recorder.stop();
    audioEngine.stopAudioCapture();
    s.canvas.remove();
    session.current = null;
    setRecording(false);
    setResult(video);
    // Play pressed again during the tail: that's the next take
    if (wants.current.armed && wants.current.rolling) begin();
  }, [begin, discardSession]);

  useEffect(() => {
    if (rolling && armed) begin();
    if (!rolling) void finish();
  }, [rolling, armed, begin, finish]);

  const discard = useCallback(() => {
    const s = session.current;
    if (s) discardSession(s);
  }, [discardSession]);

  // leaving the recording frame mid-take throws the take away
  useEffect(() => discard, [discard]);

  const dismiss = useCallback(() => {
    setResult((r) => {
      // later, not now: a download started from this URL a moment ago may still be reading
      // it (Safari fails blob downloads whose URL is revoked straight away)
      if (r) setTimeout(() => URL.revokeObjectURL(r.url), 60_000);
      return null;
    });
  }, []);

  return { recording, cueing, result, dismiss, discard };
}
