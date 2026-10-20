import { createDemoProject } from "@/stores/useProjectStore";
import { resetDbConnection } from "./idb";
import { clearCurrentProject, loadCurrentProject, loadMidiBlob, saveCurrentProject, saveMidiBlob } from "./projectStorage";
import { validateProject } from "./projectValidation";
import { DEFAULT_SETTINGS, loadSettings, sanitizeSettings, saveSettings } from "./settingsStorage";

describe("project validation", () => {
  it("accepts a saved demo project", () => {
    const demo = JSON.parse(JSON.stringify(createDemoProject()));
    const project = validateProject(demo);
    expect(project?.tracks).toHaveLength(5);
    expect(project?.tracks[0]?.notes.length).toBeGreaterThan(0);
  });

  it("rejects other versions and broken shapes", () => {
    expect(validateProject(null)).toBeNull();
    expect(validateProject({ ...createDemoProject(), version: 2 })).toBeNull();
    expect(validateProject({ ...createDemoProject(), tracks: "nope" })).toBeNull();
    const missing = createDemoProject();
    missing.tracks = missing.tracks.slice(1);
    expect(validateProject(missing)).toBeNull();
  });

  it("repairs out-of-range values and drops bad notes", () => {
    const raw = createDemoProject() as unknown as Record<string, unknown>;
    const tracks = (raw.tracks as Array<Record<string, unknown>>).map((t) => ({ ...t }));
    tracks[0]!.volume = 9;
    tracks[0]!.instrument = "theremin";
    tracks[0]!.notes = [{ pitch: 300, start: 0, duration: 1, velocity: 1 }, { pitch: 60, start: 1, duration: 0.5, velocity: 2 }];
    const project = validateProject({ ...raw, tracks, bpm: 999 })!;
    expect(project.bpm).toBe(240);
    expect(project.tracks[0]).toMatchObject({ volume: 1, instrument: "lead-guitar" });
    expect(project.tracks[0]!.notes).toEqual([{ pitch: 60, start: 1, duration: 0.5, velocity: 1 }]);
  });
});

describe("settings", () => {
  beforeEach(() => localStorage.clear());

  it("falls back to defaults for junk", () => {
    expect(sanitizeSettings("x")).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ language: "zh" }).language).toBe("zh");
    expect(sanitizeSettings({ keysPatch: "strings" }).keysPatch).toBe("strings");
    expect(sanitizeSettings({ keysPatch: "theremin" }).keysPatch).toBe("piano");
    expect(sanitizeSettings({ playStyle: "punk" }).playStyle).toBe("punk");
    expect(sanitizeSettings({ playStyle: "metal" }).playStyle).toBe("original");
    expect(sanitizeSettings({}).autoDrums).toBe(true);
    expect(sanitizeSettings({ countIn: true, metronome: true })).toMatchObject({ countIn: true, metronome: true });
    expect(sanitizeSettings({ countIn: "yes" }).countIn).toBe(false);
    expect(sanitizeSettings({ theme: "neon", zoom: 9000, selectedMember: "sawako", language: "fr" })).toMatchObject({
      theme: "system",
      language: DEFAULT_SETTINGS.language,
      zoom: 240,
      selectedMember: "yui",
    });
  });

  it("round-trips through localStorage", () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: "dark", selectedMember: "mio", loop: true });
    expect(loadSettings()).toMatchObject({ theme: "dark", selectedMember: "mio", loop: true });
  });

  it("survives corrupted JSON", () => {
    localStorage.setItem("kon-band-studio:settings:v1", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("IndexedDB project storage", () => {
  beforeEach(async () => {
    resetDbConnection();
    await clearCurrentProject();
  });

  it("reports an empty store, then restores what was saved", async () => {
    expect(await loadCurrentProject()).toEqual({ kind: "empty" });
    const project = { ...createDemoProject(), name: "Practice", bpm: 132 };
    await saveCurrentProject(project);
    const result = await loadCurrentProject();
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.project).toMatchObject({ name: "Practice", bpm: 132 });
  });

  it("flags a corrupted project", async () => {
    await saveCurrentProject({ version: 99 } as never);
    expect(await loadCurrentProject()).toEqual({ kind: "corrupt" });
  });

  it("stores the original MIDI as a blob", async () => {
    await saveMidiBlob("midi-1", new Uint8Array([77, 84, 104, 100]).buffer);
    const blob = await loadMidiBlob("midi-1");
    expect(blob).toBeDefined();
  });
});
