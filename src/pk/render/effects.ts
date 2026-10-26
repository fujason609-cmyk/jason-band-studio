import { drawBubble, type Bubble } from "@/features/overlay/introSkit";
import type { SkillId, Side, StatusEffect } from "../types";
import { FEET_Y, FIGHTER_H, FIGHTER_W, FIGHTER_X, HIT_X, MIDDLE, TRACK, VIDEO_H, VIDEO_W, ZONES } from "./layout";
import { BOLT_SECONDS, KO_SLOWMO, NUMBER_SECONDS, SPECIAL_SECONDS, type BattleState } from "./state";

/** The big words on screen: the same in every language, like a fighting game's. */
export const SKILL_TEXT: Record<SkillId, string> = {
  gitah: "GITAH!",
  resonance: "BASS SHIELD!",
  storm: "DRUM STORM!",
  teaTime: "TEA TIME!",
  perfectBeat: "PERFECT BEAT!",
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;

/** Big outlined text, centred on (x, y). */
export function bigText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string, ink = "#1b1530", maxWidth = RIGHT_TEXT) {
  ctx.save();
  ctx.font = `900 ${size}px "Baloo 2", "M PLUS Rounded 1c", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width;
  if (w > maxWidth) {
    ctx.translate(x, y);
    ctx.scale(maxWidth / w, maxWidth / w);
    ctx.translate(-x, -y);
  }
  ctx.lineJoin = "round";
  ctx.lineWidth = size * 0.18;
  ctx.strokeStyle = ink;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
  ctx.restore();
}
const RIGHT_TEXT = 880;

/** Where a fighter's body is (for bolts, numbers and bubbles). */
export function bodyOf(side: Side) {
  const x = FIGHTER_X[side];
  return { x, chest: FEET_Y - FIGHTER_H * 0.5, head: FEET_Y - FIGHTER_H * 0.95 };
}

/** Light bolts from a hitter's ring to her opponent, landing in BOLT_SECONDS. */
export function drawBolts(ctx: CanvasRenderingContext2D, st: BattleState, colors: Record<Side, string>) {
  for (const b of st.bolts) {
    const to: Side = b.from === "L" ? "R" : "L";
    const k = clamp01(b.age / BOLT_SECONDS);
    // a special's hits fly from her, a note's from her hit ring
    const sx = b.special ? bodyOf(b.from).x : HIT_X[b.from];
    const sy = b.special ? bodyOf(b.from).chest : (TRACK.top + TRACK.bottom) / 2;
    const ex = bodyOf(to).x;
    const ey = bodyOf(to).chest;
    const x = sx + (ex - sx) * k;
    const y = sy + (ey - sy) * k - Math.sin(k * Math.PI) * 120;
    const r = b.crit ? 26 : 18;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, colors[b.from]);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

/** Damage (red) and heal (green +) numbers rising off a fighter; crits bigger. */
export function drawNumbers(ctx: CanvasRenderingContext2D, st: BattleState) {
  for (const n of st.numbers) {
    const body = bodyOf(n.side);
    const k = n.age / NUMBER_SECONDS;
    const pop = n.age < 0.1 ? 0.6 + 4 * n.age : 1;
    const size = (n.crit ? 96 : n.heal ? 64 : 70) * pop;
    const x = body.x + (n.side === "L" ? -40 : 40) + Math.sin(n.age * 9) * 6;
    const y = body.head + 40 - easeOut(k) * 110;
    ctx.save();
    ctx.globalAlpha = 1 - clamp01((k - 0.6) / 0.4);
    const text = n.absorbed ? "BLOCK" : n.heal ? `+${Math.round(n.amount)}` : `${Math.max(1, Math.round(n.amount))}`;
    bigText(ctx, text, x, y, size, n.absorbed ? "#9fd8ff" : n.heal ? "#5ff08a" : n.crit ? "#ffd23f" : "#ff5a5a");
    if (n.crit && !n.heal) bigText(ctx, "CRIT!", x, y - size * 0.75, size * 0.42, "#ffffff");
    ctx.restore();
  }
}

/** Status icons over a fighter's head (a daydream ?, panic sweat, a storm's stars, …). */
const STATUS_BUBBLE: Partial<Record<StatusEffect, Bubble>> = {
  daydream: "?",
  panic: "drop",
  stunned: "star",
  teaTime: "heart",
  perfect: "note",
};

export function drawStatus(ctx: CanvasRenderingContext2D, side: Side, status: Map<StatusEffect, number>, now: number, ink: string) {
  const body = bodyOf(side);
  const icons = [...status.entries()].filter(([e]) => STATUS_BUBBLE[e]);
  icons.forEach(([effect, since], i) => {
    const x = body.x + (i - (icons.length - 1) / 2) * 92 + (side === "L" ? 30 : -30);
    drawBubble(ctx, x, body.head - 6, 76, STATUS_BUBBLE[effect]!, now - since, ink);
  });
  if (status.has("shield")) {
    // Mio's bass shield: a blue bubble around her, shimmering
    const t = now - status.get("shield")!;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 10);
    ctx.strokeStyle = "#7fd0ff";
    ctx.lineWidth = 10;
    ctx.fillStyle = "rgba(90, 170, 255, 0.18)";
    ctx.beginPath();
    ctx.ellipse(body.x, FEET_Y - FIGHTER_H * 0.48, FIGHTER_W * 0.72, FIGHTER_H * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (status.has("perfect")) {
    // Azusa's perfect beat: gold stars circling her
    const t = now - status.get("perfect")!;
    ctx.save();
    ctx.fillStyle = "#ffd23f";
    for (let k = 0; k < 5; k++) {
      const a = t * 3 + (k * Math.PI * 2) / 5;
      star(ctx, body.x + Math.cos(a) * FIGHTER_W * 0.6, body.chest + Math.sin(a) * FIGHTER_H * 0.18, 16);
    }
    ctx.restore();
  }
}

/** Azusa's cat ears (with low HP): two black ears with pink insides on her head. */
export function drawCatEars(ctx: CanvasRenderingContext2D, x: number, headTop: number, w: number) {
  const ear = (cx: number) => {
    ctx.fillStyle = "#1b1530";
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.09, headTop + w * 0.06);
    ctx.lineTo(cx, headTop - w * 0.12);
    ctx.lineTo(cx + w * 0.09, headTop + w * 0.06);
    ctx.fill();
    ctx.fillStyle = "#ff9fc4";
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.045, headTop + w * 0.04);
    ctx.lineTo(cx, headTop - w * 0.06);
    ctx.lineTo(cx + w * 0.045, headTop + w * 0.04);
    ctx.fill();
  };
  ear(x - w * 0.2);
  ear(x + w * 0.2);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * A special: the screen dims for a moment, her skill's name slams in big, and her own
 * animation plays (Yui's notes streaming over, Ritsu's lightning, Mugi's tea, …).
 */
export function drawSpecials(ctx: CanvasRenderingContext2D, st: BattleState, colors: Record<Side, string>) {
  for (const s of st.specials) {
    const dim = s.age < 0.3 ? 0.55 : 0.55 * (1 - clamp01((s.age - 0.3) / 0.3));
    if (dim > 0) {
      ctx.fillStyle = `rgba(10, 6, 25, ${dim})`;
      ctx.fillRect(0, ZONES.stage.top, VIDEO_W, ZONES.tracks.bottom - ZONES.stage.top);
    }
    const body = bodyOf(s.side);
    const to = bodyOf(s.side === "L" ? "R" : "L");
    ctx.save();
    switch (s.skill) {
      case "gitah": {
        // notes streaming from her guitar to the opponent
        ctx.fillStyle = "#ffd23f";
        for (let k = 0; k < 8; k++) {
          const p = (s.age * 2.2 + k / 8) % 1;
          const x = body.x + (to.x - body.x) * p;
          const y = body.chest - 60 + Math.sin(p * Math.PI * 3 + k) * 50;
          ctx.globalAlpha = clamp01(1 - s.age / SPECIAL_SECONDS);
          noteGlyph(ctx, x, y, 22);
        }
        break;
      }
      case "storm": {
        // lightning over the opponent's track
        ctx.strokeStyle = "#ffe76a";
        ctx.lineWidth = 8;
        ctx.globalAlpha = Math.floor(s.age * 14) % 2 ? 0.9 : 0.4;
        const x0 = s.side === "L" ? MIDDLE : HIT_X.L;
        const x1 = s.side === "L" ? HIT_X.R : MIDDLE;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          let x = x0 + ((x1 - x0) * (k + 0.5)) / 3;
          ctx.moveTo(x, TRACK.top);
          for (let y = TRACK.top; y < TRACK.bottom; y += 50) {
            x += ((((y * 7 + k * 31) % 13) / 13) - 0.5) * 60;
            ctx.lineTo(x, y + 50);
          }
          ctx.stroke();
        }
        break;
      }
      case "teaTime": {
        // a teacup over her, steam, and green sparkles rising
        teacup(ctx, body.x, body.head - 120 - easeOut(s.age / 0.4) * 20, 70);
        ctx.fillStyle = "#5ff08a";
        for (let k = 0; k < 10; k++) {
          const p = (s.age * 0.9 + k / 10) % 1;
          ctx.globalAlpha = 1 - p;
          star(ctx, body.x + Math.sin(k * 2.4) * FIGHTER_W * 0.5, FEET_Y - p * FIGHTER_H, 12);
        }
        break;
      }
      case "resonance": {
        // rings going out from her bass
        ctx.strokeStyle = "#7fd0ff";
        ctx.lineWidth = 8;
        for (let k = 0; k < 3; k++) {
          const p = (s.age * 1.5 + k / 3) % 1;
          ctx.globalAlpha = 1 - p;
          ctx.beginPath();
          ctx.arc(body.x, body.chest, 60 + p * 260, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case "perfectBeat": {
        // a gold flash ring
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 12;
        ctx.globalAlpha = clamp01(1 - s.age / 0.8);
        ctx.beginPath();
        ctx.arc(body.x, body.chest, 80 + s.age * 400, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
    }
    ctx.restore();
    // the name, slammed in over the stage
    const pop = s.age < 0.15 ? 1.8 - (s.age / 0.15) * 0.8 : 1;
    ctx.save();
    ctx.globalAlpha = clamp01((SPECIAL_SECONDS - s.age) / 0.3);
    bigText(ctx, SKILL_TEXT[s.skill], MIDDLE, ZONES.stage.top + 70, 104 * pop, colors[s.side]);
    ctx.restore();
  }
}

function noteGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, r, r * 0.75, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + r * 0.7, y - r * 3, r * 0.3, r * 3);
}

function teacup(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#1b1530";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y - s * 0.3);
  ctx.lineTo(x + s * 0.6, y - s * 0.3);
  ctx.quadraticCurveTo(x + s * 0.55, y + s * 0.45, x, y + s * 0.45);
  ctx.quadraticCurveTo(x - s * 0.55, y + s * 0.45, x - s * 0.6, y - s * 0.3);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + s * 0.68, y, s * 0.2, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = "#c97a3a";
  ctx.fillRect(x - s * 0.5, y - s * 0.28, s, s * 0.12);
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 5;
  for (let k = -1; k <= 1; k++) {
    ctx.beginPath();
    ctx.moveTo(x + k * s * 0.25, y - s * 0.45);
    ctx.quadraticCurveTo(x + k * s * 0.25 + 12, y - s * 0.7, x + k * s * 0.25, y - s * 0.95);
    ctx.stroke();
  }
  ctx.restore();
}

/** The end: K.O. slammed in (with a white flash), or TIME UP; then who won. */
export function drawEnd(ctx: CanvasRenderingContext2D, st: BattleState, names: Record<Side, string>, colors: Record<Side, string>) {
  const end = st.end;
  if (!end || end.age < 0) return;
  if (end.kind === "ko" && end.age < 0.25) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - end.age / 0.25)})`;
    ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);
  }
  const word = end.kind === "ko" ? "K.O." : "TIME UP!";
  const pop = end.age < 0.2 ? 2 - end.age * 5 : 1;
  bigText(ctx, word, MIDDLE, ZONES.stage.top + 150, 190 * pop, end.kind === "ko" ? "#ff4d6d" : "#ffd23f");
  if (end.age > KO_SLOWMO && end.winner) {
    const k = easeOut((end.age - KO_SLOWMO) / 0.3);
    ctx.save();
    ctx.globalAlpha = k;
    bigText(ctx, `${names[end.winner]} WINS!`, MIDDLE, ZONES.stage.top + 290, 96, colors[end.winner]);
    ctx.restore();
  }
}
