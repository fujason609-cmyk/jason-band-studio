import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { audioEngine } from "@/audio/AudioEngine";
import { CHORDS } from "@/lib/fretboard";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { createDemoProject, useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { InstrumentPanel } from "./InstrumentPanel";

vi.mock("@/audio/AudioEngine", () => ({
  audioEngine: { isStarted: true, noteOn: vi.fn(), noteOff: vi.fn(), allNotesOff: vi.fn() },
}));

const select = (member: "yui" | "mio" | "ritsu" | "tsumugi" | "azusa") =>
  useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, language: "en", selectedMember: member } });

describe("InstrumentPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: createDemoProject() });
  });

  it("shows a different instrument for each member", () => {
    select("yui");
    const { unmount } = render(<InstrumentPanel />);
    expect(screen.getAllByRole("button", { name: /string 6/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /^E2, string 6 open$/ })).toHaveLength(1);
    unmount();

    select("mio");
    const bass = render(<InstrumentPanel />);
    expect(screen.queryAllByRole("button", { name: /string 5/ })).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /string 4/ }).length).toBeGreaterThan(0);
    bass.unmount();

    select("azusa");
    const rhythm = render(<InstrumentPanel />);
    expect(screen.getAllByRole("button", { name: /^Strum / })).toHaveLength(CHORDS.length);
    rhythm.unmount();

    select("ritsu");
    render(<InstrumentPanel />);
    expect(screen.getByRole("button", { name: /Kick/ })).toBeInTheDocument();
  });

  it("plays the fret that is tapped", () => {
    select("yui");
    render(<InstrumentPanel />);
    fireEvent.pointerDown(screen.getByRole("button", { name: "G2, string 6, fret 3" }), { pointerId: 1 });
    expect(audioEngine.noteOn).toHaveBeenCalledWith("yui", 43);
  });

  it("strums every string of a chord from the computer keyboard and stops on release", async () => {
    select("azusa");
    render(<InstrumentPanel />);
    const c = CHORDS.find((x) => x.key === "a")!;
    fireEvent.keyDown(window, { key: "a" });
    await waitFor(() => expect(audioEngine.noteOn).toHaveBeenCalledTimes(c.pitches.length));
    expect(vi.mocked(audioEngine.noteOn).mock.calls.map(([, p]) => p)).toEqual(c.pitches);
    expect(screen.getByRole("button", { name: `Strum ${c.name}` })).toHaveClass("is-down");

    fireEvent.keyUp(window, { key: "a" });
    expect(audioEngine.noteOff).toHaveBeenCalledTimes(c.pitches.length);
    expect(screen.getByRole("button", { name: `Strum ${c.name}` })).not.toHaveClass("is-down");
  });
});
