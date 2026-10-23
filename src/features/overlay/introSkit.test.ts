import type { MemberId } from "@/features/band/types";
import type { NoteEvent } from "@/types/midi";
import type { StudioProject } from "@/types/project";
import {
  INTRO_SECONDS,
  introTitle,
  countInBeats,
  introLength,
  planIntro,
  skitFrame,
  type IntroPlan,
} from "./introSkit";

const note = (start: number, pitch: number, duration = 0.4): NoteEvent => ({
  pitch,
  start,
  duration,
  velocity: 0.8,
});
// a C major scale, or A minor (its tonic and fifth held longest)
const MAJOR = [60, 64, 67, 72, 62, 65, 69, 71];
const MINOR = [57, 60, 64, 69, 57, 64, 59, 62];

function project(
  bpm: number,
  parts: Partial<Record<MemberId, { notes?: NoteEvent[]; vocal?: NoteEvent[] }>>,
): StudioProject {
  const instruments: Record<MemberId, string> = {
    yui: "lead-guitar",
    azusa: "rhythm-guitar",
    mio: "bass",
    ritsu: "drums",
    tsumugi: "keys",
  };
  return {
    name: "Fuwa Fuwa Time",
    baseBpm: bpm,
    bpm,
    beatsPerBar: 4,
    durationSeconds: 16,
    tracks: (Object.keys(instruments) as MemberId[]).map((memberId) => ({
      memberId,
      instrument: instruments[memberId],
      notes: parts[memberId]?.notes ?? [],
      vocal: parts[memberId]?.vocal,
    })),
  } as unknown as StudioProject;
}
const line = (pitches: number[], from = 0, step = 0.5) =>
  pitches.map((p, i) => note(from + i * step, p, step * (i % 4 === 0 ? 3 : 1)));

describe("intro skit", () => {
  it("counts one bar in, halved when a slow bar would drag", () => {
    expect(countInBeats(4, 60 / 180)).toBe(4);
    expect(countInBeats(4, 60 / 80)).toBe(2);
    expect(countInBeats(3, 60 / 60)).toBe(3); // odd: can't halve
  });

  it("picks the skit from the song", () => {
    // slow: a spotlight on whoever carries the tune
    expect(planIntro(project(80, { azusa: { notes: line(MAJOR) } }))).toMatchObject({
      kind: "spotlight",
      star: "azusa",
    });
    // minor and not fast: the spotlight too
    expect(planIntro(project(120, { mio: { notes: line(MINOR) } })).kind).toBe("spotlight");
    // sung: the singer steps up
    expect(
      planIntro(project(140, { yui: { notes: line(MAJOR), vocal: line(MAJOR) } })),
    ).toMatchObject({ kind: "singer", star: "yui" });
    // fast: the band hyped, Ritsu first
    expect(planIntro(project(170, { yui: { notes: line(MAJOR) } }))).toMatchObject({
      kind: "hype",
      star: "ritsu",
    });
    // otherwise: whoever plays first
    const opener = project(130, {
      tsumugi: { notes: line(MAJOR, 0) },
      yui: { notes: line(MAJOR, 2) },
    });
    expect(planIntro(opener)).toMatchObject({ kind: "opener", star: "tsumugi" });
  });

  it("puts the song's name on the sign", () => {
    expect(planIntro(project(130, { yui: { notes: line(MAJOR) } })).title).toBe("Fuwa Fuwa Time");
  });

  it("can name the song by its file instead of the score's title", () => {
    const p = {
      ...project(130, {}),
      midiMeta: { fileName: "k-on-fuwa_fuwa_time.gp5" },
    } as StudioProject;
    expect(introTitle(p, "score")).toBe("Fuwa Fuwa Time");
    expect(introTitle(p, "file")).toBe("k-on-fuwa_fuwa_time");
    expect(planIntro(p, 0, 16, "file").title).toBe("k-on-fuwa_fuwa_time");
    // a song with no file (the demo) has only its name
    expect(introTitle(project(130, {}), "file")).toBe("Fuwa Fuwa Time");
  });

  it("only looks at the stretch being recorded", () => {
    const p = project(130, { tsumugi: { notes: line(MAJOR, 0) }, yui: { notes: line(MAJOR, 8) } });
    expect(planIntro(p, 6).star).toBe("yui");
  });

  it("opens the curtain, counts in, and is gone on the downbeat", () => {
    const plan: IntroPlan = {
      kind: "opener",
      star: "yui",
      beats: 4,
      secondsPerBeat: 0.5,
      title: "Song",
    };
    expect(skitFrame(plan, 0)).toMatchObject({ curtain: 0, fade: 1, beat: null });
    expect(skitFrame(plan, 0.5).curtain).toBe(1);
    expect(skitFrame(plan, INTRO_SECONDS + 0.05).beat).toEqual({
      index: 0,
      age: expect.closeTo(0.05),
    });
    expect(skitFrame(plan, INTRO_SECONDS + 1.6).beat?.index).toBe(3);
    expect(skitFrame(plan, INTRO_SECONDS + 1.6).fade).toBeGreaterThan(0);
    expect(introLength(plan)).toBe(INTRO_SECONDS + 2);
    expect(skitFrame(plan, introLength(plan)).fade).toBe(0);
  });

  it("gives every skit someone to watch", () => {
    for (const kind of ["hype", "spotlight", "singer", "opener"] as const) {
      const plan: IntroPlan = { kind, star: "mio", beats: 4, secondsPerBeat: 0.4, title: "Song" };
      let moved = false;
      for (let t = 0; t < INTRO_SECONDS; t += 0.05) {
        const f = skitFrame(plan, t);
        if (
          Object.values(f.actors).some((a) => a.bubble || a.y !== 0 || a.x !== 0) ||
          f.spot !== null
        )
          moved = true;
      }
      expect(moved).toBe(true);
    }
  });
});
