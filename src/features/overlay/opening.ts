import { FONT } from "@/features/timeline/drawTimeline";
import { drawSign } from "./introSkit";

/**
 * What a take opens with, over its first seconds. The Reels said it: skipped by most within
 * 4 s when the music only started after 3 (the skit's closed curtains, then the count-in),
 * and the one with hook text was skipped least. So by default a take starts on the music
 * ("cold"), with the hook text, if any, big at the top for HOOK_SECONDS, and the song's name
 * on the theatre marquee: hung over the stage in the stage views (once the hook has gone),
 * a card that lifts away after a moment in the others.
 */
export const HOOK_SECONDS = 3;
const HOOK_FADE = 0.4;
/** Without hook text, the name card shows this long in the score views, then lifts away. */
const CARD_SECONDS = 2.4;
const CARD_LIFT = 0.4;

/** The hook text as lines: at most two (the English one first), each kept short. */
export function hookLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((l) => (l.length > 60 ? l.slice(0, 59).trimEnd() + "…" : l));
}

export interface OpeningFrame {
  /** the hook text's opacity, and how far it has popped in (0 → 1) */
  hook: number;
  pop: number;
  /** the name card over a score view: 0 not shown; else how far it has lifted away (1 = gone) */
  card: boolean;
  lift: number;
  /** the marquee over the stage: its opacity, and how long it has hung (it drops in) */
  stageSign: number;
  signSince: number;
}

/**
 * The opening `t` seconds into the take (null: not recording, a preview of its first frame).
 * With the skit, the skit shows the name itself.
 */
export function openingFrame(t: number | null, hasHook: boolean, skit: boolean): OpeningFrame {
  const at = t ?? 0;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const hook = !hasHook ? 0 : t === null ? 1 : 1 - clamp((at - (HOOK_SECONDS - HOOK_FADE)) / HOOK_FADE);
  const card = !hasHook && !skit && (t === null || at < CARD_SECONDS + CARD_LIFT);
  return {
    hook,
    pop: t === null ? 1 : clamp(at / 0.15),
    card,
    lift: t === null ? 0 : clamp((at - CARD_SECONDS) / CARD_LIFT),
    stageSign: hasHook ? (t === null ? 0 : clamp((at - HOOK_SECONDS) / 0.3)) : 1,
    signSince: hasHook ? Math.max(0, at - HOOK_SECONDS) : t === null ? 1 : at,
  };
}

export interface OpeningArea {
  width: number;
  height: number;
  safeTop: number;
  safeSide: number;
}

/**
 * Paint the opening over the frame: the hook text big and outlined at the top (just below
 * Reels' bar), and, in the score views, the name card under where the hook would be.
 */
export function drawOpening(
  ctx: CanvasRenderingContext2D,
  area: OpeningArea,
  f: OpeningFrame,
  hook: readonly string[],
  title: string,
  ink: string,
) {
  const { width, safeTop, safeSide } = area;
  const contentW = width - 2 * safeSide;
  if (f.hook > 0 && hook.length) {
    ctx.save();
    ctx.globalAlpha *= f.hook;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineJoin = "round";
    let y = safeTop + 6;
    hook.forEach((line, i) => {
      // the first line (English) bigger; each shrinks to fit the safe width
      let size = width * (i === 0 ? 0.08 : 0.062);
      ctx.font = `900 ${size}px ${FONT}`;
      while (ctx.measureText(line).width > contentW * 0.94 && size > 10) {
        size -= 1;
        ctx.font = `900 ${size}px ${FONT}`;
      }
      const s = 0.85 + 0.15 * f.pop;
      ctx.save();
      ctx.translate(width / 2, y);
      ctx.scale(s, s);
      ctx.lineWidth = Math.max(3, size * 0.22);
      ctx.strokeStyle = "#1b1630";
      ctx.strokeText(line, 0, 0);
      ctx.fillStyle = i === 0 ? "#ffffff" : "#ffe9a8";
      ctx.fillText(line, 0, 0);
      ctx.restore();
      y += size * 1.25;
    });
    ctx.restore();
  }
  if (f.card && f.lift < 1 && title) {
    const fw = contentW / 3.3;
    const top = safeTop + 4 - f.lift * f.lift * (safeTop + fw * 1.2);
    drawSign(ctx, title, width / 2, 0, top, contentW * 0.9, fw, 0.3 + f.lift, ink);
  }
}
