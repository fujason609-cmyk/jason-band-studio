import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Circle, Dices, FlaskConical, Play, Search, Square } from "lucide-react";
import { IconButton } from "@/components/common/IconButton";
import { NoticeBar } from "@/components/layout/NoticeBar";
import { MEMBER_IDS } from "@/features/band/members";
import { introTitle } from "@/features/overlay/introSkit";
import type { IntroTitle } from "@/features/overlay/overlay";
import { SaveVideoDialog } from "@/features/overlay/SaveVideoDialog";
import { readPalette } from "@/features/timeline/lanes";
import { useT } from "@/i18n/useT";
import { beatNow } from "@/lib/time";
import { usePlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { usePkTake } from "./export/recorder";
import { usePicker } from "./picker/usePicker";
import type { PickedFight } from "./picker/score";
import { drawBattle } from "./render/canvas";
import { VIDEO_H, VIDEO_W } from "./render/layout";
import { defaultCaption, defaultHook, fighterLooks, nextTeaser } from "./render/look";
import { goTo } from "./route";
import { pairs } from "./picker/lab";
import { simulate } from "./sim/simulate";
import { battleClip, battleInput, fighterPart } from "./sim/songInput";
import type { MemberId, Side } from "./types";

/** Fights the picker runs. */
const PICK_COUNT = 500;

/**
 * The PK page: pick two members, a stretch and a seed (or let the picker find the best
 * fights), watch it, record it. The fight is simulated once per choice; the picture is a
 * function of it and the audio clock, drawn every frame on a canvas (no React re-renders).
 */
export function PkPage() {
  const t = useT();
  const { project, songEnd } = usePlayedSong();
  const theme = useStudioStore((s) => s.settings.theme);
  // the same choice as the recording frame's sign: the score's title or the file's name
  const titleFrom = useStudioStore((s) => s.settings.overlay.introTitle);
  const updateSettings = useStudioStore((s) => s.updateSettings);
  const songTitle = introTitle(project, titleFrom);
  const [left, setLeft] = useState<MemberId>("mio");
  const [right, setRight] = useState<MemberId>("azusa");
  const [choice, setChoice] = useState(0);
  const [seed, setSeed] = useState(1);
  const [winner, setWinner] = useState<Side | null>(null);
  const [picks, setPicks] = useState<PickedFight[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [hook, setHook] = useState<string | null>(null);
  const [next, setNext] = useState("");
  const [copied, setCopied] = useState(false);
  const { pick } = usePicker();

  const clip = useMemo(() => battleClip(project, songEnd, choice), [project, songEnd, choice]);
  const chorusCount = Math.max(1, clip.choruses.length);
  const same = left === right;
  const input = useMemo(() => battleInput(project, left, right, seed, clip), [project, left, right, seed, clip]);
  const result = useMemo(() => (same ? null : simulate(input)), [input, same]);
  const realBar = ((60 / project.baseBpm) * project.beatsPerBar * project.baseBpm) / Math.max(1, project.bpm);
  const tune = (["L", "R"] as const).filter((s) => fighterPart(project, s === "L" ? left : right, clip).substitute);
  const empty = result !== null && result.input.notes.length === 0;
  const hookText = hook ?? defaultHook(left, right);
  const caption = defaultCaption(left, right);
  // a new match: the old picks don't apply
  useEffect(() => setPicks(null), [left, right, choice, project]);

  const palette = useMemo(() => readPalette(), [theme]); // eslint-disable-line react-hooks/exhaustive-deps
  const scene = useRef<((ctx: CanvasRenderingContext2D, now: number, live: boolean) => void) | null>(null);
  scene.current = result
    ? (ctx, now, live) => {
        const real = project.baseBpm / Math.max(1, project.bpm);
        const beat = live ? beatNow(now / real, project.midiMeta?.tempos, project.baseBpm) : undefined;
        drawBattle(ctx, {
          result,
          now,
          beat: beat && { ...beat, seconds: beat.seconds * real },
          fighters: fighterLooks(result, project, palette.members),
          hook: hookText,
          song: songTitle,
          next: next || undefined,
          ink: "#1b1530",
        });
      }
    : null;
  const take = usePkTake(clip, (ctx, now) => scene.current?.(ctx, now, true));
  const busy = take.phase !== "idle";

  // the screen: redrawn every frame (it's the only thing on this page that moves)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const paint = () => {
      const w = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      // not laid out (a hidden tab, tests): nothing to paint
      const ctx = w > 0 ? canvas.getContext("2d") : null;
      if (ctx) {
        if (canvas.width !== Math.round(w * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(((w * VIDEO_H) / VIDEO_W) * dpr);
        }
        const s = canvas.width / VIDEO_W;
        ctx.setTransform(s, 0, 0, s, 0, 0);
        if (scene.current) scene.current(ctx, take.now(), take.phase !== "idle");
        else {
          ctx.fillStyle = "#1d1238";
          ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
        }
      }
      raf = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(raf);
  }, [take]);

  const find = async () => {
    if (same) return;
    setFinding(true);
    const { seed: _drop, ...rest } = input;
    void _drop;
    const found = await pick(rest, Math.floor(Math.random() * 1e6), PICK_COUNT, winner);
    setFinding(false);
    setPicks(found);
    if (found[0]) setSeed(found[0].seed);
  };

  const ending = (w: Side | null, ko: number | null) =>
    t.pkThisFight(
      w ? t.pkWins(t.memberName[w === "L" ? left : right]) : t.pkDraw,
      ko === null ? t.pkTimeUp : t.pkKoAt((ko - result!.input.clip.start).toFixed(1)),
    );

  const member = (side: Side, value: MemberId, set: (m: MemberId) => void) => (
    <fieldset className="pk-members" disabled={busy}>
      <legend>{t.pkSide[side]}</legend>
      {MEMBER_IDS.map((m) => (
        <button
          key={m}
          type="button"
          className="pk-member"
          aria-pressed={value === m}
          style={{ "--member": `var(--member-${m})` } as React.CSSProperties}
          onClick={() => set(m)}
        >
          {t.memberName[m]}
        </button>
      ))}
      <p className="pk-hint">{t.pkSkill[value]}</p>
    </fieldset>
  );

  return (
    <div className="pk" role="region" aria-label={t.pkTitle}>
      <header className="pk__head">
        <IconButton label={t.pkBack} variant="quiet" onClick={() => goTo(null)} disabled={busy}>
          <ArrowLeft size={18} />
        </IconButton>
        <h1>{t.pkTitle}</h1>
        <IconButton label={t.pkLab} variant="quiet" onClick={() => goTo("lab")} disabled={busy}>
          <FlaskConical size={18} />
        </IconButton>
      </header>
      <NoticeBar />
      <div className="pk__body">
        <div className="pk__screen">
          <canvas ref={canvasRef} className="pk__canvas" data-testid="pk-canvas" aria-hidden="true" />
          <div className="pk__transport">
            {busy ? (
              <button type="button" className="pk-btn" onClick={take.stop}>
                <Square size={16} aria-hidden /> {take.phase === "recording" ? t.pkRecording : t.pkStop}
              </button>
            ) : (
              <>
                <button type="button" className="pk-btn" onClick={() => void take.start(false)} disabled={!result || empty}>
                  <Play size={16} aria-hidden /> {t.pkPlay}
                </button>
                <button type="button" className="pk-btn pk-btn--rec" onClick={() => void take.start(true)} disabled={!result || empty}>
                  <Circle size={16} aria-hidden /> {t.pkRecord}
                </button>
              </>
            )}
          </div>
          {result && <p className="pk-hint">{ending(result.winner, result.koTime)}</p>}
        </div>
        <div className="pk__panel">
          <p className="pk-intro">{t.pkIntro}</p>
          <fieldset className="pk-title" disabled={busy}>
            <legend>{t.pkTitleFrom}</legend>
            {(["score", "file"] as IntroTitle[]).map((source) => (
              <label key={source}>
                <input
                  type="radio"
                  name="pk-title"
                  checked={titleFrom === source}
                  onChange={() =>
                    updateSettings({ overlay: { ...useStudioStore.getState().settings.overlay, introTitle: source } })
                  }
                />
                {source === "score" ? t.signFromScore(introTitle(project, "score")) : t.signFromFile(introTitle(project, "file"))}
              </label>
            ))}
          </fieldset>
          <div className="pk-pair">
            {member("L", left, setLeft)}
            {member("R", right, setRight)}
          </div>
          {same && <p className="pk-warn">{t.pkSame}</p>}
          {tune.map((s) => (
            <p key={s} className="pk-hint">
              {t.pkTune(t.memberName[s === "L" ? left : right])}
            </p>
          ))}
          {empty && <p className="pk-warn">{t.pkNoNotes}</p>}
          <label className="pk-row">
            <span>{t.pkClip}</span>
            <select value={choice % chorusCount} onChange={(e) => setChoice(Number(e.currentTarget.value))} disabled={busy}>
              {Array.from({ length: chorusCount }, (_, i) => (
                <option key={i} value={i}>
                  {t.pkClipChoice(i + 1, clip.bars, Math.round(clip.bars * realBar))}
                </option>
              ))}
            </select>
          </label>
          <div className="pk-row">
            <label>
              <span>{t.pkSeed}</span>
              <input
                type="number"
                min={0}
                value={seed}
                onChange={(e) => setSeed(Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))}
                disabled={busy}
              />
            </label>
            <IconButton label={t.pkRandomSeed} onClick={() => setSeed(Math.floor(Math.random() * 1e6))} disabled={busy}>
              <Dices size={18} />
            </IconButton>
          </div>
          <div className="pk-row">
            <label>
              <span>{t.pkWinner}</span>
              <select
                value={winner ?? ""}
                onChange={(e) => setWinner(e.currentTarget.value === "L" || e.currentTarget.value === "R" ? e.currentTarget.value : null)}
                disabled={busy}
              >
                <option value="">{t.pkAnyone}</option>
                <option value="L">{t.memberName[left]}</option>
                <option value="R">{t.memberName[right]}</option>
              </select>
            </label>
            <button type="button" className="pk-btn" onClick={() => void find()} disabled={busy || same || finding}>
              <Search size={16} aria-hidden /> {finding ? t.pkFinding(PICK_COUNT) : t.pkFind}
            </button>
          </div>
          {picks && (
            <ol className="pk-picks">
              {picks.map((p) => (
                <li key={p.seed}>
                  <button type="button" aria-pressed={p.seed === seed} onClick={() => setSeed(p.seed)} disabled={busy}>
                    <strong>{t.pkPick(p.seed)}</strong>
                    <span>{p.winner ? t.pkWins(t.memberName[p.winner === "L" ? left : right]) : t.pkDraw}</span>
                    <span>{p.koTime === null ? t.pkTimeUp : t.pkKoAt((p.koTime - input.clip.start).toFixed(1))}</span>
                    <span>{t.pkScore(Math.round(p.score.total * 100))}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
          <label className="pk-field">
            <span>{t.pkHook}</span>
            <input type="text" value={hookText} maxLength={60} onChange={(e) => setHook(e.currentTarget.value)} disabled={busy} />
          </label>
          <label className="pk-field">
            <span>{t.pkNext}</span>
            <select value={next} onChange={(e) => setNext(e.currentTarget.value)} disabled={busy}>
              <option value="">{t.pkNoNext}</option>
              {pairs()
                .filter(([a, b]) => !(a === left && b === right) && !(a === right && b === left))
                .map(([a, b]) => (
                  <option key={`${a}-${b}`} value={nextTeaser(a, b)}>
                    {nextTeaser(a, b)}
                  </option>
                ))}
            </select>
          </label>
          <div className="pk-field">
            <span>{t.pkCaption}</span>
            <textarea readOnly rows={3} value={caption} />
            <button
              type="button"
              className="pk-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(caption).then(() => setCopied(true));
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? t.pkCopied : t.pkCopy}
            </button>
          </div>
        </div>
      </div>
      {take.video && <SaveVideoDialog video={take.video} onClose={take.dismiss} frame="9:16" />}
    </div>
  );
}
