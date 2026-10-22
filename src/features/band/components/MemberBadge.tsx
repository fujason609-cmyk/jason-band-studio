import { useEffect, useRef } from "react";
import { audioEngine } from "@/audio/AudioEngine";
import { usePlayedSong } from "@/stores/playedSong";
import { useStudioStore } from "@/stores/useStudioStore";
import { IDLE_POSE, drawPixelInstrument, gearFor, poseAt, poseKey, type InstrumentPose } from "../pixelInstruments";
import type { BandMember } from "../types";

const BADGE_PX = { sm: 28, md: 38, lg: 52 } as const;

/**
 * A round badge in the member's colour with her instrument as a little pixel drawing
 * (pixelInstruments.ts; no character artwork), which plays along with her part: strums,
 * stick hits, keys going down. Animates only while the song plays.
 */
export function MemberBadge({ member, size = "md" }: { member: BandMember; size?: "sm" | "md" | "lg" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { project } = usePlayedSong();
  const track = project.tracks.find((t) => t.memberId === member.id);
  const instrument = track?.instrument ?? member.defaultInstrument;
  const notes = track?.notes;
  const playing = useStudioStore((s) => s.transport === "playing");
  const theme = useStudioStore((s) => s.settings.theme);
  const px = BADGE_PX[size];

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(px * dpr);
    canvas.height = Math.round(px * dpr);
    const color = getComputedStyle(document.documentElement).getPropertyValue(member.colorVar).trim() || "#888";
    const sprite = Math.round(px * 0.72);
    let last = "";
    const paint = (pose: InstrumentPose) => {
      const key = poseKey(pose);
      if (key === last) return;
      last = key;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, px, px);
      drawPixelInstrument(ctx, instrument, pose, (px - sprite) / 2, (px - sprite) / 2, sprite, color, member.leftHanded, gearFor(member.id, instrument));
    };
    paint(IDLE_POSE);
    if (!playing || !notes) return;
    let raf = 0;
    const tick = () => {
      paint(poseAt(notes, audioEngine.getPosition(), instrument));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [px, instrument, notes, playing, member, theme]);

  return (
    <span className={`member-badge member-badge--${size}`} style={{ "--member": `var(${member.colorVar})` } as React.CSSProperties} aria-hidden="true">
      <canvas ref={canvasRef} style={{ width: px, height: px }} />
    </span>
  );
}
