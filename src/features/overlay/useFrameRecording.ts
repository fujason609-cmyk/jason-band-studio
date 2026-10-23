import { useCallback, useEffect, useRef, useState } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { buildLanes, readPalette } from "@/features/timeline/lanes";
import { getT } from "@/i18n/useT";
import { getPlayedSong } from "@/stores/playedSong";
import { drumsGenerated } from "@/lib/playStyle";
import { useStudioStore } from "@/stores/useStudioStore";
import type { NoteEvent } from "@/types/midi";
import { drawRecordFrame } from "./drawRecordFrame";
import { FrameRecorder, type Recording } from "./frameRecorder";
import { clipNotes, clipSeconds, loopNotes, type Highlight } from "./highlight";
import { introLength, type IntroPlan } from "./introSkit";
import { OVERLAY_COLORS } from "./overlay";

/** Video width in pixels; the height follows the frame shape (1080 × 1920 for 9:16). */
export const VIDEO_WIDTH = 1080;
/** Keep recording this long after playback stops, so ringing notes and cymbals end naturally. */
const TAIL_MS = 800;
/**
 * The captured sound reaches the recorder a little after the audio clock says it plays
 * (measured in Chrome: 27–88 ms, about 50 on average, at a 30 fps frame resolution), plus
 * the recording limiter's 5 ms look-ahead, so the picture is drawn this much later to keep
 * the video in sync.
 */
const PICTURE_DELAY_SECONDS = 0.045;
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
 * Gets the engine ready for a chorus take without the skit: a bar of the song before the
 * chorus as the run-up (what really leads into it; the highlight's run-up, the clip's own
 * last bar, rang its ending into the chorus's first beat), the recorder starting on the
 * chorus's first beat. The range keeps the song's own end out of the way.
 */
export function cueChorus(clip: Highlight, barSeconds: number) {
  audioEngine.setLoopRange({ start: clip.start, end: clip.end });
  audioEngine.seek(Math.max(0, clip.start - barSeconds));
}

/** A chorus take (it ends, letting the last notes ring), not the looping highlight. */
const isChorus = (clip: Highlight) => clip.ring !== undefined;

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

/** A take that opens with the intro skit: when it plays (audio clock) and from where. */
export interface IntroTake {
  plan: IntroPlan;
  /** song seconds the music starts from */
  from: number;
  /** audio-clock seconds the skit starts, and the music */
  introAt: number;
  songAt: number;
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
  /** the opening skit and count-in, when the take has one */
  intro: IntroTake | null;
  /** highlight: the recorder is running (it starts at the loop point, not at once) */
  rolling: boolean;
  /** audio-clock time the clip ends (NaN until known): a stop after it keeps the take */
  endAt: number;
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
export function useFrameRecording(
  armed: boolean,
  rolling: boolean,
  layout: FrameLayout,
  clip: Highlight | null = null,
  intro: IntroTake | null = null,
) {
  const [recording, setRecording] = useState(false);
  const [cueing, setCueing] = useState(false);
  const latestClip = useRef(clip);
  latestClip.current = clip;
  const latestIntro = useRef(intro);
  latestIntro.current = intro;
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
   * A clip ends at audio-clock `endAt` (one loop for the highlight, the chorus's end). A
   * chorus stops playing new notes there and lets the ones sounding ring on for its `ring`
   * (cut at the bar line, a held chord or the last word stopped dead), then the take ends.
   */
  const finishClipAt = useCallback((s: Session, endAt: number) => {
    const clip = s.clip!;
    const { baseBpm, bpm } = getPlayedSong().project;
    const ring = ((clip.ring ?? 0) * baseBpm) / Math.max(1, bpm);
    s.endAt = endAt;
    if (isChorus(clip)) {
      // a moment early: a note on the next downbeat (the loop's start) mustn't sneak in
      const at = endAt - 0.005;
      s.timers.push(
        window.setTimeout(() => {
          if (session.current === s) audioEngine.ringOutAt(at);
        }, Math.max(0, (at - audioEngine.audioTime() - 0.25) * 1000)),
      );
    }
    s.timers.push(
      window.setTimeout(() => void endClip(s), (endAt - audioEngine.audioTime() + ring + PICTURE_DELAY_SECONDS) * 1000),
    );
  }, [endClip]);

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
    finishClipAt(s, audioEngine.audioTime() + waitMs / 1000 + clipSeconds(clip, baseBpm, bpm));
    s.timers.push(
      window.setTimeout(() => {
        if (session.current !== s) return;
        s.recorder.start();
        setCueing(false);
      }, waitMs + PICTURE_DELAY_SECONDS * 1000),
    );
  }, [finishClipAt]);

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
    // a take with the skit records from the skit's first frame, a chorus one included
    const intro = latestIntro.current;
    let recorder: FrameRecorder;
    try {
      recorder = new FrameRecorder(canvas, audio, useStudioStore.getState().settings.overlay.fps);
      if (!clip || intro) recorder.start();
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
      intro,
      rolling: clip === null || intro !== null,
      cuedAt: NaN,
      endAt: NaN,
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
      const heardAt = audioEngine.audioTime() - PICTURE_DELAY_SECONDS;
      const { baseBpm, bpm } = getPlayedSong().project;
      if (s.intro && heardAt < s.intro.songAt) {
        // before the music: the notes already come down towards where it starts
        if (audioEngine.status === "playing") s.lastPos = s.intro.from - ((s.intro.songAt - heardAt) * bpm) / baseBpm;
      } else if (audioEngine.status === "playing") {
        s.lastPos = Math.max(0, audioEngine.getAudiblePosition() - PICTURE_DELAY_SECONDS);
      }
      if (s.clip && !s.rolling && audioEngine.status === "playing") {
        const heard = audioEngine.getAudiblePosition();
        if (Number.isNaN(s.cuedAt)) s.cuedAt = heard;
        // once the sound is moving (after a count-in, if any): the loop point is this far off
        else if (heard < s.cuedAt - 0.01) startClip(s, 0); // already came round
        else if (heard > s.cuedAt + 0.01) {
          // a chorus starts after its run-up, a highlight at the loop point
          const target = isChorus(s.clip) ? s.clip.start : s.clip.end;
          startClip(s, Math.max(0, ((target - heard) * baseBpm) / Math.max(1, bpm)) * 1000);
        }
      }
      if (s.frozenAt === null && performance.now() - s.startedAt > MAX_TAKE_MINUTES * 60_000 && audioEngine.status === "playing") {
        pauseTake(getT().recordingTooLong(MAX_TAKE_MINUTES));
      }
      const { project, spots } = getPlayedSong();
      const { settings } = useStudioStore.getState();
      const lanes = buildLanes(project, palette, getT().memberName, settings.selectedMember, settings.vocals, s.clip ? [] : spots, drumsGenerated(settings.playStyle, settings.autoDrums));
      // a highlight's notes looped; a chorus's up to its end (after the skit, from its start:
      // nothing before it comes down in the count-in)
      const clip = s.clip;
      const take = !clip
        ? null
        : isChorus(clip)
          ? (notes: readonly NoteEvent[]) => clipNotes(notes, clip, s.intro ? clip.start : -Infinity)
          : (notes: readonly NoteEvent[]) => loopNotes(notes, clip);
      const shown = take
        ? lanes.map((lane) => ({ ...lane, notes: take(lane.notes), vocal: lane.vocal && { ...lane.vocal, notes: take(lane.vocal.notes) } }))
        : lanes;
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawRecordFrame(ctx, {
        ...l,
        zoom: settings.zoom,
        position: s.frozenAt ?? s.lastPos,
        durationSeconds: project.durationSeconds,
        baseBpm: project.baseBpm,
        beatsPerBar: project.beatsPerBar,
        tempos: project.midiMeta?.tempos,
        lanes: shown,
        loop: s.clip && !isChorus(s.clip) ? clipLoop(s, s.clip) : undefined,
        intro: s.intro && heardAt < s.intro.introAt + introLength(s.intro.plan) ? { plan: s.intro.plan, t: Math.max(0, heardAt - s.intro.introAt) } : undefined,
        palette,
        keyColor: OVERLAY_COLORS[settings.overlay.color],
        ripples: ripples && audioEngine.status === "playing",
        view: settings.overlay.view,
      });
      s.frame = requestAnimationFrame(paint);
    };
    session.current = s;
    if (intro && clip) {
      // the chorus ends the take: timed from the audio clock, like the highlight's
      const { baseBpm, bpm } = getPlayedSong().project;
      finishClipAt(s, intro.songAt + clipSeconds(clip, baseBpm, bpm));
    }
    paint();
    setRecording(true);
    setCueing(clip !== null && intro === null);
  }, [startClip, finishClipAt]);

  const finish = useCallback(async () => {
    const s = session.current;
    if (!s || s.frozenAt !== null) return;
    if (s.intro && audioEngine.audioTime() < s.intro.songAt) {
      // stopped during the skit: no song in it, nothing to keep (as with the 3-2-1)
      discardSession(s);
      return;
    }
    if (s.clip && audioEngine.audioTime() >= s.endAt - 0.01) {
      // stopped while the chorus's last notes rang on: the chorus is whole, keep it
      void endClip(s);
      return;
    }
    if (s.clip) {
      // stopped before the clip was recorded whole: a part of a loop doesn't loop, and a
      // chorus cut short isn't the chorus
      const text = isChorus(s.clip) ? getT().chorusCut : getT().highlightCut;
      discardSession(s);
      useStudioStore.getState().notify({ kind: "info", text });
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
  }, [begin, discardSession, endClip]);

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
