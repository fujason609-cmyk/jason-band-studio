import { drumVoiceFor, type DrumVoice } from "@/lib/drums";
import type { NoteEvent } from "@/types/midi";
import { LANE_HEIGHT, RULER_HEIGHT, TIMELINE_GUTTER } from "./layout";

export interface LaneInput {
  label: string;
  color: string;
  notes: readonly NoteEvent[];
  audible: boolean;
  isDrums: boolean;
  selected: boolean;
}

export interface Palette {
  paper: string;
  surface: string;
  rule: string;
  ruleStrong: string;
  ink: string;
  inkSoft: string;
  selected: string;
}

export interface DrawInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  scrollLeft: number;
  zoom: number;
  lanes: LaneInput[];
  baseBpm: number;
  beatsPerBar: number;
  durationSeconds: number;
  palette: Palette;
  showLabels: boolean;
}

const DRUM_ROWS: DrumVoice[] = ["crash", "ride", "open-hat", "closed-hat", "tom", "snare", "clap", "kick"];
const NOTE_H = 7;

/** Index of the first note that could be visible, assuming notes are sorted by start. */
function firstVisible(notes: readonly NoteEvent[], fromSeconds: number): number {
  let lo = 0;
  let hi = notes.length;
  const target = fromSeconds - 8; // generous: long notes may start well before the view
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (notes[mid]!.start < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(h / 2, w / 2);
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
  ctx.fill();
}

/**
 * Draws the visible window of the timeline: a ruler, then one staff-paper lane
 * per member with its notes as coloured stickers. Only what's on screen is drawn.
 */
export function drawTimeline(input: DrawInput) {
  const { ctx, width, height, scrollLeft, zoom, lanes, baseBpm, beatsPerBar, durationSeconds, palette } = input;
  const xOf = (t: number) => TIMELINE_GUTTER + t * zoom - scrollLeft;
  const tStart = Math.max(0, (scrollLeft - TIMELINE_GUTTER) / zoom);
  const tEnd = (scrollLeft + width) / zoom;

  ctx.clearRect(0, 0, width, height);

  // Lane backgrounds and staff lines
  lanes.forEach((lane, i) => {
    const top = RULER_HEIGHT + i * LANE_HEIGHT;
    ctx.fillStyle = lane.selected ? palette.selected : palette.surface;
    ctx.fillRect(0, top, width, LANE_HEIGHT);
    ctx.strokeStyle = palette.rule;
    ctx.lineWidth = 1;
    const staffTop = top + LANE_HEIGHT / 2 - 16;
    for (let s = 0; s < 5; s++) {
      const y = Math.round(staffTop + s * 8) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.strokeStyle = palette.ruleStrong;
    ctx.beginPath();
    ctx.moveTo(0, top + LANE_HEIGHT - 0.5);
    ctx.lineTo(width, top + LANE_HEIGHT - 0.5);
    ctx.stroke();
  });

  // Bar and beat lines plus ruler numbers
  const beatSec = 60 / baseBpm;
  const barSec = beatSec * beatsPerBar;
  const showBeats = beatSec * zoom >= 14;
  const labelEvery = Math.max(1, Math.ceil(36 / (barSec * zoom)));
  ctx.fillStyle = palette.paper;
  ctx.fillRect(0, 0, width, RULER_HEIGHT);
  ctx.font = "600 12px 'M PLUS Rounded 1c', system-ui, sans-serif";
  ctx.textBaseline = "middle";

  const firstBeat = Math.floor(tStart / beatSec);
  const lastBeat = Math.ceil(Math.min(tEnd, durationSeconds) / beatSec);
  for (let b = firstBeat; b <= lastBeat; b++) {
    const isBar = b % beatsPerBar === 0;
    if (!isBar && !showBeats) continue;
    const x = Math.round(xOf(b * beatSec)) + 0.5;
    ctx.strokeStyle = isBar ? palette.ruleStrong : palette.rule;
    ctx.beginPath();
    ctx.moveTo(x, isBar ? RULER_HEIGHT - 12 : RULER_HEIGHT - 5);
    ctx.lineTo(x, height);
    ctx.stroke();
    const barNo = b / beatsPerBar;
    if (isBar && barNo % labelEvery === 0) {
      ctx.fillStyle = palette.inkSoft;
      ctx.fillText(String(barNo + 1), x + 4, RULER_HEIGHT / 2 - 2);
    }
  }

  // End of song
  const endX = xOf(durationSeconds);
  if (endX < width) {
    ctx.fillStyle = palette.paper;
    ctx.globalAlpha = 0.6;
    ctx.fillRect(endX, RULER_HEIGHT, width - endX, height - RULER_HEIGHT);
    ctx.globalAlpha = 1;
  }

  // Notes
  lanes.forEach((lane, i) => {
    const top = RULER_HEIGHT + i * LANE_HEIGHT;
    const inner = LANE_HEIGHT - 20 - NOTE_H;
    ctx.fillStyle = lane.color;

    let yOf: (n: NoteEvent) => number;
    if (lane.isDrums) {
      yOf = (n) => top + 10 + (DRUM_ROWS.indexOf(drumVoiceFor(n.pitch)) / (DRUM_ROWS.length - 1)) * inner;
    } else {
      let lo = 127;
      let hi = 0;
      for (const n of lane.notes) {
        if (n.pitch < lo) lo = n.pitch;
        if (n.pitch > hi) hi = n.pitch;
      }
      const span = Math.max(12, hi - lo);
      const mid = (lo + hi) / 2;
      const bottom = mid - span / 2;
      yOf = (n) => top + 10 + (1 - (n.pitch - bottom) / span) * inner;
    }

    for (let k = firstVisible(lane.notes, tStart); k < lane.notes.length; k++) {
      const n = lane.notes[k]!;
      const x = xOf(n.start);
      if (x > width) break;
      const w = lane.isDrums ? 6 : Math.max(4, n.duration * zoom - 1);
      if (x + w < 0) continue;
      ctx.globalAlpha = (lane.audible ? 1 : 0.22) * (0.5 + 0.5 * n.velocity);
      pill(ctx, x, yOf(n), w, NOTE_H);
    }
    ctx.globalAlpha = 1;

    if (input.showLabels) {
      ctx.font = "700 12px 'M PLUS Rounded 1c', system-ui, sans-serif";
      const textW = ctx.measureText(lane.label).width;
      ctx.fillStyle = palette.surface;
      ctx.globalAlpha = 0.9;
      pill(ctx, 6, top + 6, textW + 16, 20);
      ctx.globalAlpha = 1;
      ctx.fillStyle = lane.color;
      ctx.fillText(lane.label, 14, top + 16);
    }
  });
}
