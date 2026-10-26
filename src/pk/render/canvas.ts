import { poseAt, type Gear } from "@/features/band/pixelInstruments";
import {
  IDLE_MEMBER,
  cheerPoseAt,
  drawMemberCheering,
  drawMemberPlaying,
  memberPoseAt,
  type BeatNow,
} from "@/features/band/pixelMembers";
import { paintCurtains } from "@/features/overlay/stageScene";
import { drumVoiceFor } from "@/lib/drums";
import type { InstrumentId } from "@/types/audio";
import type { NoteEvent } from "@/types/midi";
import type { BattleResult, MemberId, NoteColor, Side } from "../types";
import { bigText, bodyOf, drawBolts, drawCatEars, drawEnd, drawNumbers, drawSpecials, drawStatus } from "./effects";
import {
  BAR,
  FEET_Y,
  FIGHTER_H,
  FIGHTER_W,
  FIGHTER_X,
  HIT_X,
  LANES_Y,
  MIDDLE,
  NAME_Y,
  PORTRAIT,
  SONG_Y,
  TIMER,
  TRACK,
  TRACK_X,
  VIDEO_H,
  VIDEO_W,
  ZONES,
  barSpan,
  portraitX,
} from "./layout";
import { KO_SLOWMO, battleStateAt, type BattleState } from "./state";

export interface FighterLook {
  id: MemberId;
  /** for the HUD and the banners ("MIO") */
  name: string;
  color: string;
  instrument: InstrumentId;
  leftHanded: boolean;
  gear?: Gear;
  /** her part in real seconds (for her playing pose) */
  notes: readonly NoteEvent[];
  isDrums: boolean;
}

export interface BattleScene {
  result: BattleResult;
  /** real song seconds now */
  now: number;
  /** the song's beat now; undefined while still */
  beat?: BeatNow & { index: number };
  fighters: Record<Side, FighterLook>;
  /** the hook line under the VS splash ("Mio vs Azusa — who wins?") */
  hook: string;
  song: string;
  /** the end card's teaser ("Next: Yui vs Ritsu"), if any */
  next?: string;
  ink: string;
}

/**
 * The VS splash opens the video (it is the title: no title bar under Instagram's). Short:
 * at 3 s it held the fight back too long.
 */
export const SPLASH_SECONDS = 1.6;
/** The next match is teased over the last this-many seconds of the clip. */
const NEXT_SECONDS = 2;
const INK = "#1b1530";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - (1 - clamp01(v)) ** 3;

/**
 * Paints the PK picture at 1080 × 1920 (scale the context first for other sizes): a pure
 * function of the fight's events and the time, so the screen and the video show the same.
 */
export function drawBattle(ctx: CanvasRenderingContext2D, scene: BattleScene) {
  const { result, now, fighters } = scene;
  const st = battleStateAt(result, now);
  const since = now - result.input.clip.start;
  // the big words in a lighter tint of each colour: a dark one (Azusa's green) read poorly on the night stage
  const colors = { L: lighten(fighters.L.color), R: lighten(fighters.R.color) };
  const names = { L: fighters.L.name, R: fighters.R.name };

  paintBackdrop(ctx, scene, st);

  // the stage shakes on crits, specials and the KO
  const shake = st.shake * 14;
  ctx.save();
  if (shake > 0) ctx.translate(Math.sin(now * 91) * shake, Math.cos(now * 77) * shake * 0.6);
  for (const side of ["L", "R"] as const) paintFighter(ctx, scene, st, side);
  paintTracks(ctx, scene, st);
  drawBolts(ctx, st, { L: fighters.L.color, R: fighters.R.color });
  drawNumbers(ctx, st);
  for (const side of ["L", "R"] as const) {
    // the one knocked out has nothing left to show
    const out = st.end?.kind === "ko" && st.end.winner !== side;
    if (!out) drawStatus(ctx, side, st.sides[side].status, now, scene.ink);
  }
  ctx.restore();

  paintHud(ctx, scene, st);
  drawSpecials(ctx, st, colors);
  drawEnd(ctx, st, names, colors);
  paintSplash(ctx, scene, since);
  const left = result.input.clip.end - now;
  if (scene.next && st.end && left < NEXT_SECONDS) {
    const k = easeOut((NEXT_SECONDS - left) / 0.35);
    ctx.save();
    ctx.globalAlpha = k;
    plate(ctx, MIDDLE - 330, LANES_Y[1] - 56, 660, 112, "#ffd23f", 0);
    bigText(ctx, scene.next, MIDDLE, LANES_Y[1], 64 * (0.8 + 0.2 * k), "#ffffff", INK, 600);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the set

function paintBackdrop(ctx: CanvasRenderingContext2D, scene: BattleScene, st: BattleState) {
  const { L, R } = scene.fighters;
  const now = scene.now;
  const sky = ctx.createLinearGradient(0, 0, 0, VIDEO_H);
  sky.addColorStop(0, "#150c2b");
  sky.addColorStop(0.45, "#2b1650");
  sky.addColorStop(0.62, "#1a0f33");
  sky.addColorStop(1, "#0c0618");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);

  // each fighter's half washed in her colour, brighter as she lands hits
  for (const side of ["L", "R"] as const) {
    const x = FIGHTER_X[side];
    const glow = 0.35 + 0.25 * Math.max(0, 1 - st.sides[side].attackAge / 0.25);
    const g = ctx.createRadialGradient(x, FEET_Y - FIGHTER_H * 0.5, 30, x, FEET_Y - FIGHTER_H * 0.5, 560);
    g.addColorStop(0, withAlpha(scene.fighters[side].color, glow));
    g.addColorStop(1, withAlpha(scene.fighters[side].color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, ZONES.topClear - 60, VIDEO_W, ZONES.stage.bottom - ZONES.topClear + 60);
  }

  // stage lights: a beam from above onto each, swaying slowly
  for (const side of ["L", "R"] as const) {
    const sway = Math.sin(now * 0.9 + (side === "L" ? 0 : 2)) * 40;
    const x = FIGHTER_X[side];
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, ZONES.topClear, 0, FEET_Y);
    g.addColorStop(0, "rgba(255,255,255,0)");
    g.addColorStop(1, withAlpha(scene.fighters[side].color, 0.28));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + sway - 40, ZONES.topClear);
    ctx.lineTo(x + sway + 40, ZONES.topClear);
    ctx.lineTo(x + FIGHTER_W * 0.6, FEET_Y);
    ctx.lineTo(x - FIGHTER_W * 0.6, FEET_Y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // twinkling lights in the dark, always in the same places
  ctx.save();
  for (let k = 0; k < 46; k++) {
    const x = (k * 233.7) % VIDEO_W;
    const y = ZONES.topClear - 120 + ((k * 151.3) % (ZONES.stage.bottom - ZONES.topClear));
    const tw = 0.5 + 0.5 * Math.sin(now * (1.3 + (k % 5) * 0.4) + k);
    ctx.globalAlpha = 0.12 + 0.35 * tw;
    ctx.fillStyle = k % 3 === 0 ? L.color : k % 3 === 1 ? R.color : "#fff6d8";
    ctx.beginPath();
    ctx.arc(x, y, 2 + (k % 4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // drapes at the sides (mostly in the part Instagram crops) and a valance up top
  paintCurtains(ctx, VIDEO_W, ZONES.stage.bottom + 10, 120, 1, ZONES.stage.bottom + 10);

  // the stage the two stand on
  const ledge = ctx.createLinearGradient(0, FEET_Y, 0, ZONES.stage.bottom + 20);
  ledge.addColorStop(0, "#4a2a5e");
  ledge.addColorStop(1, "#24133a");
  ctx.fillStyle = ledge;
  ctx.fillRect(0, FEET_Y - 4, VIDEO_W, ZONES.stage.bottom + 20 - FEET_Y);
  ctx.fillStyle = "#f3c25a";
  ctx.fillRect(0, FEET_Y - 6, VIDEO_W, 5);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, FEET_Y + 2, VIDEO_W, 3);

  // the crowd down at the bottom (under the caption): heads and penlights in both colours
  const floor = ctx.createLinearGradient(0, ZONES.tracks.bottom, 0, VIDEO_H);
  floor.addColorStop(0, "#120a22");
  floor.addColorStop(1, "#06030d");
  ctx.fillStyle = floor;
  ctx.fillRect(0, ZONES.tracks.bottom + 10, VIDEO_W, VIDEO_H - ZONES.tracks.bottom);
  const beat = scene.beat ? scene.beat.index + scene.beat.phase : now * 2;
  for (let row = 0; row < 3; row++) {
    const y = ZONES.crowd + 70 + row * 100;
    for (let k = 0; k < 9; k++) {
      const x = ((k + (row % 2) * 0.5) * VIDEO_W) / 8.5 - 20;
      const bob = Math.abs(Math.sin((beat + k * 0.37 + row * 0.5) * Math.PI)) * 8;
      // a penlight, waved in time
      const lean = Math.sin((beat + k * 0.21) * Math.PI) * 0.45;
      const color = (k + row) % 2 ? L.color : R.color;
      ctx.save();
      ctx.translate(x + 28, y - 40 - bob);
      ctx.rotate(lean);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = withAlpha(color, 0.35);
      ctx.beginPath();
      ctx.ellipse(0, -42, 16, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = color;
      ctx.fillRect(-5, -70, 10, 60);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(-3, -70, 6, 14);
      ctx.restore();
      ctx.fillStyle = row === 0 ? "#22143a" : row === 1 ? "#1a0f2e" : "#120a22";
      ctx.beginPath();
      ctx.arc(x, y - bob, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y + 60 - bob, 62, 46, 0, Math.PI, 0);
      ctx.fill();
    }
  }
}

// ---------------------------------------------------------------- the HUD

function paintHud(ctx: CanvasRenderingContext2D, scene: BattleScene, st: BattleState) {
  // a dark band behind it, so it reads over anything
  const band = ctx.createLinearGradient(0, ZONES.hud.top - 20, 0, ZONES.hud.bottom + 20);
  band.addColorStop(0, "rgba(8,4,18,0)");
  band.addColorStop(0.25, "rgba(8,4,18,0.55)");
  band.addColorStop(0.8, "rgba(8,4,18,0.55)");
  band.addColorStop(1, "rgba(8,4,18,0)");
  ctx.fillStyle = band;
  ctx.fillRect(0, ZONES.hud.top - 20, VIDEO_W, ZONES.hud.bottom - ZONES.hud.top + 40);

  for (const side of ["L", "R"] as const) {
    const s = st.sides[side];
    const f = scene.fighters[side];
    const { x0, x1 } = barSpan(side);
    const w = x1 - x0;
    const skew = 18;
    // the HP bar, a slanted plate: it drains towards her portrait
    const shape = (top: number, h: number, pad = 0): number[][] =>
      side === "L"
        ? [[x0 - pad, top], [x1 + pad, top], [x1 + pad - skew, top + h], [x0 - pad, top + h]]
        : [[x0 - pad, top], [x1 + pad, top], [x1 + pad, top + h], [x0 - pad + skew, top + h]];
    const fill = (share: number) => (side === "L" ? { x: x0, w: w * share } : { x: x1 - w * share, w: w * share });
    path(ctx, shape(BAR.top - 5, BAR.height + 10, 5));
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.save();
    path(ctx, shape(BAR.top, BAR.height));
    ctx.clip();
    ctx.fillStyle = "#3a2650";
    ctx.fillRect(x0 - skew, BAR.top, w + 2 * skew, BAR.height);
    const lag = fill(Math.max(s.hpLag, s.hp) / s.maxHp);
    ctx.fillStyle = "#fff3c4";
    ctx.fillRect(lag.x, BAR.top, lag.w, BAR.height);
    const share = s.hp / s.maxHp;
    const hp = fill(share);
    const low = share < 0.3;
    const g = ctx.createLinearGradient(0, BAR.top, 0, BAR.top + BAR.height);
    const [c0, c1] = low ? ["#ff7a8a", "#d81b45"] : share < 0.6 ? ["#ffe066", "#f29e0c"] : ["#8dfcb0", "#1fbf62"];
    g.addColorStop(0, c0);
    g.addColorStop(1, c1);
    ctx.fillStyle = g;
    ctx.fillRect(hp.x, BAR.top, hp.w, BAR.height);
    if (low && Math.floor(scene.now * 6) % 2) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(hp.x, BAR.top, hp.w, BAR.height);
    }
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.fillRect(x0 - skew, BAR.top + 5, w + 2 * skew, 7);
    ctx.restore();

    // energy (SP), gold, glowing once it's nearly full
    const ew = w * 0.82;
    const ex0 = side === "L" ? x0 : x1 - ew;
    ctx.fillStyle = INK;
    roundRect(ctx, ex0 - 3, BAR.energyTop - 3, ew + 6, BAR.energyHeight + 6, 8);
    ctx.fillStyle = "#2b1a3d";
    roundRect(ctx, ex0, BAR.energyTop, ew, BAR.energyHeight, 6);
    const en = Math.min(1, s.energy / 100);
    const ready = s.energy > 85;
    ctx.fillStyle = ready && Math.floor(scene.now * 10) % 2 ? "#fff6b0" : "#ffb627";
    if (en > 0) roundRect(ctx, side === "L" ? ex0 : ex0 + ew * (1 - en), BAR.energyTop, ew * en, BAR.energyHeight, 6);
    ctx.save();
    ctx.font = '900 18px "Baloo 2", system-ui, sans-serif';
    ctx.textBaseline = "middle";
    ctx.textAlign = side === "L" ? "left" : "right";
    ctx.fillStyle = "#ffd23f";
    ctx.fillText("SP", side === "L" ? ex0 + ew + 10 : ex0 - 10, BAR.energyTop + BAR.energyHeight / 2 + 1);
    ctx.restore();

    // her name under it, and her combo under her portrait
    ctx.save();
    ctx.font = '900 36px "Baloo 2", system-ui, sans-serif';
    ctx.textBaseline = "middle";
    ctx.textAlign = side === "L" ? "left" : "right";
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    const nx = side === "L" ? x0 : x1;
    ctx.strokeText(f.name, nx, NAME_Y);
    ctx.fillStyle = lighten(f.color);
    ctx.fillText(f.name, nx, NAME_Y);
    if (s.combo >= 5) {
      // under her portrait: the count, popping on each hit, and "COMBO"
      const pop = s.attackAge < 0.12 ? 1.25 - s.attackAge * 2 : 1;
      const cx = portraitX(side) + PORTRAIT.size / 2;
      const cy = PORTRAIT.top + PORTRAIT.size + 28;
      ctx.textAlign = "center";
      ctx.font = `900 ${34 * pop}px "Baloo 2", system-ui, sans-serif`;
      ctx.lineWidth = 6;
      ctx.strokeText(String(s.combo), cx, cy);
      ctx.fillStyle = "#ffd23f";
      ctx.fillText(String(s.combo), cx, cy);
      ctx.font = '900 16px "Baloo 2", system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeText("COMBO", cx, cy + 24);
      ctx.fillStyle = "#fff6d8";
      ctx.fillText("COMBO", cx, cy + 24);
    }
    ctx.restore();

    paintPortrait(ctx, scene, st, side);
  }

  // the round timer: the seconds left
  const left = Math.max(0, Math.ceil(scene.result.input.clip.end - scene.now));
  const hurry = left <= 5 && !st.end;
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(TIMER.x, TIMER.y, TIMER.r + 6, 0, Math.PI * 2);
  ctx.fill();
  const tg = ctx.createRadialGradient(TIMER.x, TIMER.y - 20, 10, TIMER.x, TIMER.y, TIMER.r);
  tg.addColorStop(0, "#4b2f75");
  tg.addColorStop(1, "#22123a");
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.arc(TIMER.x, TIMER.y, TIMER.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f3c25a";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.restore();
  // under five seconds it beats red, once a second
  const into = (((scene.result.input.clip.end - scene.now) % 1) + 1) % 1;
  const pulse = hurry ? 1 + 0.15 * clamp01((into - 0.7) / 0.3) : 1;
  const label = st.end ? (st.end.kind === "ko" ? "KO" : "0") : String(left);
  bigText(ctx, label, TIMER.x, TIMER.y + 3, 62 * pulse, hurry || st.end ? "#ff6b81" : "#ffffff", INK, 96);

  // the song, in a pill under the timer
  ctx.save();
  ctx.font = '800 24px "Baloo 2", "M PLUS Rounded 1c", system-ui, sans-serif';
  const text = `♪ ${scene.song}`;
  const maxW = 300;
  const tw = Math.min(maxW, ctx.measureText(text).width);
  ctx.fillStyle = "rgba(8,4,18,0.8)";
  roundRect(ctx, TIMER.x - tw / 2 - 16, SONG_Y - 18, tw + 32, 36, 18);
  ctx.fillStyle = "#fff6d8";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, TIMER.x, SONG_Y + 1, maxW);
  ctx.restore();
}

/** Her face in a frame at the end of her bar, flashing red when hit, dark when she's out. */
function paintPortrait(ctx: CanvasRenderingContext2D, scene: BattleScene, st: BattleState, side: Side) {
  const f = scene.fighters[side];
  const s = st.sides[side];
  const x = portraitX(side);
  const y = PORTRAIT.top;
  const size = PORTRAIT.size;
  ctx.save();
  ctx.fillStyle = INK;
  roundRect(ctx, x - 5, y - 5, size + 10, size + 10, 22);
  const bg = ctx.createLinearGradient(0, y, 0, y + size);
  bg.addColorStop(0, lighten(f.color));
  bg.addColorStop(1, f.color);
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, size, size, 18);
  ctx.beginPath();
  ctx.roundRect(x, y, size, size, 18);
  ctx.clip();
  // the head: the figure drawn big enough that cells 3–21 across, rows 1–19 down fill the frame
  const cell = size / 18;
  const pose = { ...IDLE_MEMBER, blink: memberPoseAt(f.id, [], undefined, scene.now, false).blink };
  drawMemberPlaying(ctx, f.id, f.instrument, pose, poseAt([], 0, f.instrument), x - 3 * cell, y - 1 * cell, 24 * cell, f.color, false, f.gear, scene.ink);
  if (s.hurtAge < 0.25) {
    ctx.fillStyle = `rgba(255,40,60,${0.55 * (1 - s.hurtAge / 0.25)})`;
    ctx.fillRect(x, y, size, size);
  }
  const out = st.end?.kind === "ko" && st.end.winner !== side && st.end.age > 0;
  if (out) {
    ctx.fillStyle = "rgba(10,6,25,0.6)";
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
  ctx.save();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, size - 4, size - 4, 16);
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- the fighters

function paintFighter(ctx: CanvasRenderingContext2D, scene: BattleScene, st: BattleState, side: Side) {
  const f = scene.fighters[side];
  const s = st.sides[side];
  const toward = side === "L" ? 1 : -1;
  const end = st.end;
  const lost = end && end.winner !== null && end.winner !== side && end.kind === "ko";
  const won = end && end.winner === side && end.age > KO_SLOWMO;
  // a lunge on her hits, a knock back and a shake when hit
  let dx = 0;
  if (s.attackAge < 0.15) dx += toward * 16 * (1 - s.attackAge / 0.15);
  if (s.hurtAge < 0.3) dx += -toward * 18 * (1 - s.hurtAge / 0.3) + Math.sin(s.hurtAge * 80) * 8 * (1 - s.hurtAge / 0.3);
  const x = FIGHTER_X[side] - FIGHTER_W / 2 + dx;
  const y = FEET_Y - FIGHTER_H;
  // her spot: a ring of light in her colour, flaring as she lands a hit
  const flare = Math.max(0, 1 - s.attackAge / 0.25);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const spot = ctx.createRadialGradient(FIGHTER_X[side], FEET_Y, 10, FIGHTER_X[side], FEET_Y, FIGHTER_W * 0.62);
  spot.addColorStop(0, withAlpha(f.color, 0.55 + 0.4 * flare));
  spot.addColorStop(1, withAlpha(f.color, 0));
  ctx.fillStyle = spot;
  ctx.beginPath();
  ctx.ellipse(FIGHTER_X[side], FEET_Y, FIGHTER_W * 0.62, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = lighten(f.color);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(FIGHTER_X[side], FEET_Y, FIGHTER_W * 0.42 * (1 + 0.15 * flare), 18 * (1 + 0.15 * flare), 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.save();
  if (lost && end) {
    // she falls over backwards, slowly (the KO's slow motion), sliding in so she lies on
    // the stage, not off its edge, and fades a little
    const k = Math.min(1, end.age / KO_SLOWMO);
    const fx = FIGHTER_X[side] + dx;
    ctx.translate(toward * FIGHTER_H * 0.45 * k * k, 0);
    ctx.translate(fx, FEET_Y);
    ctx.rotate(-toward * (Math.PI / 2) * k * k);
    ctx.translate(-fx, -FEET_Y);
    ctx.globalAlpha = 1 - 0.35 * k;
  }
  if (won) {
    drawMemberCheering(ctx, f.id, cheerPoseAt(f.id, scene.now, scene.beat), x, y, FIGHTER_W, f.color, scene.ink);
  } else {
    const live = scene.beat !== undefined && !lost;
    const pose = live ? memberPoseAt(f.id, f.notes, undefined, scene.now, f.isDrums, scene.beat) : IDLE_MEMBER;
    // the right one faces left: mirror her instrument (a left-handed player the other way)
    const mirror = side === "R" ? !f.leftHanded : f.leftHanded;
    drawMemberPlaying(ctx, f.id, f.instrument, pose, poseAt(f.notes, scene.now, f.instrument), x, y, FIGHTER_W, f.color, mirror, f.gear, scene.ink);
  }
  if (s.status.has("catEars")) drawCatEars(ctx, x + FIGHTER_W / 2, y + FIGHTER_H * 0.08, FIGHTER_W);
  ctx.restore();
  // hurt: a red flash over her
  if (s.hurtAge < 0.18 && !lost) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.5 * (1 - s.hurtAge / 0.18);
    const b = bodyOf(side);
    const g = ctx.createRadialGradient(b.x + dx, b.chest, 10, b.x + dx, b.chest, FIGHTER_W * 0.7);
    g.addColorStop(0, "#ff3b3b");
    g.addColorStop(1, "rgba(255,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 40, y, FIGHTER_W + 80, FIGHTER_H);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- the opening

/**
 * The VS splash, the video's first seconds: each name on a slanted plate in her colour
 * sliding in from her side, "VS" slamming down between them, the hook line under it; it
 * slides away and leaves the fight.
 */
function paintSplash(ctx: CanvasRenderingContext2D, scene: BattleScene, since: number) {
  if (since >= SPLASH_SECONDS || since < -0.5) return;
  const t = Math.max(0, since);
  const out = clamp01((t - (SPLASH_SECONDS - 0.3)) / 0.3);
  const cy = ZONES.stage.top + 300;
  ctx.save();
  ctx.globalAlpha = 1 - out;
  ctx.fillStyle = "rgba(8,4,18,0.55)";
  ctx.fillRect(0, ZONES.stage.top, VIDEO_W, ZONES.stage.bottom - ZONES.stage.top);
  // nearly in place from the first frame (it is the Reel's cover, and the title): a short, quick slide
  const slide = (start: number) => 1 - easeOut((t - start) / 0.12);
  const { L, R } = scene.fighters;
  // left plate, from the left
  const lx = -160 * slide(0) - 700 * out;
  plate(ctx, lx + 20, cy - 190, 640, 150, L.color, 26);
  bigText(ctx, L.name, lx + 320, cy - 115, 112, "#ffffff", INK, 560);
  // right plate, from the right
  const rx = 160 * slide(0) + 700 * out;
  plate(ctx, rx + 420, cy + 40, 640, 150, R.color, 26);
  bigText(ctx, R.name, rx + 740, cy + 115, 112, "#ffffff", INK, 560);
  // VS: slams in, with rays
  if (t > 0.12) {
    const a = t - 0.12;
    const scale = a < 0.12 ? 2.4 - (a / 0.12) * 1.4 : 1;
    ctx.save();
    ctx.translate(MIDDLE, cy - 8);
    ctx.rotate(a * 0.6);
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 14; k++) {
      ctx.rotate((Math.PI * 2) / 14);
      ctx.fillStyle = k % 2 ? "rgba(255,210,63,0.22)" : "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-40, -420);
      ctx.lineTo(40, -420);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    bigText(ctx, "VS", MIDDLE, cy - 8, 190 * scale, "#ffd23f", INK);
  }
  // the hook line
  if (scene.hook && t > 0.15) {
    ctx.globalAlpha = (1 - out) * clamp01((t - 0.15) / 0.15);
    bigText(ctx, scene.hook, MIDDLE, cy + 270, 50, "#fff6d8", INK, 900);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- the tracks

/** Per result: each note's outcome, and each side's pitch range. */
const outcomes = new WeakMap<BattleResult, { hit: Map<number, NoteColor>; missed: Set<number>; cuts: Record<Side, [number, number]> }>();

function outcomeOf(r: BattleResult) {
  let o = outcomes.get(r);
  if (o) return o;
  const hit = new Map<number, NoteColor>();
  const missed = new Set<number>();
  for (const e of r.events) {
    if (e.type === "noteHit") hit.set(e.noteIdx, e.color);
    if (e.type === "noteMiss") missed.add(e.noteIdx);
  }
  // the pitches a third and two thirds of the way up her notes: the lanes get a fair share
  // each (by the lowest and highest note, a few outliers put nearly everything in one)
  const cutsOf = (member: MemberId): [number, number] => {
    const p = r.input.notes.filter((n) => n.lane === member).map((n) => n.pitch).sort((a, b) => a - b);
    return p.length ? [p[Math.floor(p.length / 3)]!, p[Math.floor((2 * p.length) / 3)]!] : [0, 0];
  };
  o = { hit, missed, cuts: { L: cutsOf(r.input.left), R: cutsOf(r.input.right) } };
  outcomes.set(r, o);
  return o;
}

/**
 * Which of the three lanes a note runs in: high notes on top, split at her part's thirds
 * (`cuts`); drums by sound: cymbals, then snare and toms, then the kick.
 */
export function laneOf(pitch: number, cuts: readonly [number, number], drums: boolean): number {
  if (drums) {
    const v = drumVoiceFor(pitch);
    return v === "kick" ? 2 : v === "snare" || v === "tom" || v === "clap" ? 1 : 0;
  }
  if (cuts[0] === cuts[1]) return pitch > cuts[1] ? 0 : pitch < cuts[0] ? 2 : 1;
  return pitch >= cuts[1] ? 0 : pitch >= cuts[0] ? 1 : 2;
}

/**
 * The two tracks: each fighter's notes appear in the middle and fly out to her hit rings,
 * red (attack) or green (heal) gems for the notes that count, faint dots for the rest, in
 * three lanes by pitch. A hit bursts at the ring; a miss flies on past it, grey.
 */
function paintTracks(ctx: CanvasRenderingContext2D, scene: BattleScene, st: BattleState) {
  const r = scene.result;
  const o = outcomeOf(r);
  const now = scene.now;
  for (const side of ["L", "R"] as const) {
    const f = scene.fighters[side];
    const { outer, inner } = TRACK_X[side];
    const x0 = Math.min(outer, inner);
    const w = Math.abs(outer - inner);
    const stunned = st.sides[side].status.has("stunned");
    ctx.save();
    ctx.fillStyle = INK;
    roundRect(ctx, x0 - 5, TRACK.top - 5, w + 10, TRACK.bottom - TRACK.top + 10, 30);
    const g = ctx.createLinearGradient(inner, 0, outer, 0);
    g.addColorStop(0, "rgba(20,10,40,0.92)");
    g.addColorStop(1, withAlpha(f.color, stunned ? 0.18 : 0.5));
    ctx.fillStyle = g;
    roundRect(ctx, x0, TRACK.top, w, TRACK.bottom - TRACK.top, 26);
    // lane guides
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 3;
    ctx.setLineDash([14, 14]);
    for (const y of LANES_Y) {
      ctx.beginPath();
      ctx.moveTo(x0 + 20, y);
      ctx.lineTo(x0 + w - 20, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // the hit rings, one per lane
    const hx = HIT_X[side];
    for (const y of LANES_Y) {
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(hx, y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = lighten(f.color);
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hx, y, 30, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  // the middle, where notes come from: a gold seam with a glint on each lane
  ctx.save();
  const seam = ctx.createLinearGradient(0, TRACK.top, 0, TRACK.bottom);
  seam.addColorStop(0, "rgba(243,194,90,0)");
  seam.addColorStop(0.5, "rgba(243,194,90,0.9)");
  seam.addColorStop(1, "rgba(243,194,90,0)");
  ctx.fillStyle = seam;
  ctx.fillRect(MIDDLE - 2, TRACK.top + 10, 4, TRACK.bottom - TRACK.top - 20);
  ctx.globalCompositeOperation = "lighter";
  for (const y of LANES_Y) {
    const glint = ctx.createRadialGradient(MIDDLE, y, 2, MIDDLE, y, 34);
    glint.addColorStop(0, "rgba(255,230,160,0.45)");
    glint.addColorStop(1, "rgba(255,230,160,0)");
    ctx.fillStyle = glint;
    ctx.fillRect(MIDDLE - 34, y - 34, 68, 68);
  }
  ctx.restore();

  const over = st.end !== null;
  for (const e of r.events) {
    if (e.type !== "noteSpawn") continue;
    const ahead = e.t - now;
    if (ahead > TRACK.lead) break;
    if (ahead < -0.45) continue;
    // after the end no more notes come
    if (over && ahead > 0) continue;
    const n = r.input.notes[e.noteIdx]!;
    const y = LANES_Y[laneOf(n.pitch, o.cuts[e.side], scene.fighters[e.side].isDrums)]!;
    const hx = HIT_X[e.side];
    const x = hx + (MIDDLE - hx) * (ahead / TRACK.lead);
    const color = e.color === "green" ? "#3ff08a" : "#ff4d6d";
    if (ahead >= 0) {
      ctx.globalAlpha = Math.min(1, (TRACK.lead - ahead) / 0.25);
      if (e.counted) gem(ctx, x, y, 26 * (0.8 + 0.4 * n.velocity), color);
      else {
        ctx.fillStyle = withAlpha(color, 0.3);
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (e.counted) {
      const age = -ahead;
      if (o.missed.has(e.noteIdx)) {
        // flies on past the ring, grey, and fades
        ctx.globalAlpha = Math.max(0, 1 - age / 0.45);
        gem(ctx, x, y, 22, "#8a8399");
        ctx.globalAlpha = 1;
      } else if (o.hit.has(e.noteIdx) && age < 0.3) {
        // a burst at the ring
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const k = age / 0.3;
        ctx.globalAlpha = 1 - k;
        const burst = ctx.createRadialGradient(hx, y, 0, hx, y, 70);
        burst.addColorStop(0, "#ffffff");
        burst.addColorStop(0.4, color);
        burst.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = burst;
        ctx.beginPath();
        ctx.arc(hx, y, 70, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 8 * (1 - k);
        ctx.beginPath();
        ctx.arc(hx, y, 36 + k * 70, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}

function gem(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.save();
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(x, y - r - 5);
  ctx.lineTo(x + r + 5, y);
  ctx.lineTo(x, y + r + 5);
  ctx.lineTo(x - r - 5, y);
  ctx.closePath();
  ctx.fill();
  const g = ctx.createLinearGradient(x, y - r, x, y + r);
  g.addColorStop(0, lighten(color));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.65);
  ctx.lineTo(x + r * 0.35, y - r * 0.15);
  ctx.lineTo(x - r * 0.25, y - r * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- helpers

/** A slanted plate in `color` with an ink edge (the splash's name plates, the teaser). */
function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, skew: number) {
  ctx.save();
  path(ctx, [[x + skew - 6, y - 6], [x + w + 6, y - 6], [x + w - skew + 6, y + h + 6], [x - 6, y + h + 6]]);
  ctx.fillStyle = INK;
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, lighten(color));
  g.addColorStop(1, color);
  path(ctx, [[x + skew, y], [x + w, y], [x + w - skew, y + h], [x, y + h]]);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  path(ctx, [[x + skew, y], [x + w, y], [x + w - skew * 0.2, y + h * 0.2], [x + skew * 0.8, y + h * 0.2]]);
  ctx.fill();
  ctx.restore();
}

function path(ctx: CanvasRenderingContext2D, points: number[][]) {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x!, y!) : ctx.moveTo(x!, y!)));
  ctx.closePath();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  ctx.fill();
}

const parseHex = (color: string) => {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return null;
  const v = parseInt(m[1]!, 16);
  return [v >> 16, (v >> 8) & 255, v & 255] as const;
};

/** "#rrggbb" with an alpha. */
function withAlpha(color: string, alpha: number): string {
  const c = parseHex(color);
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})` : color;
}

/** A lighter tint of "#rrggbb" (a third of the way to white). */
function lighten(color: string): string {
  const c = parseHex(color);
  return c ? `rgb(${c.map((v) => Math.round(v + (255 - v) * 0.35)).join(", ")})` : color;
}
