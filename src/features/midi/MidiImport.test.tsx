import { render, screen } from "@testing-library/react";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import type { ParsedMidi } from "@/types/midi";
import { MidiMappingDialog } from "./MidiImport";

vi.mock("@/audio/AudioEngine", () => ({ audioEngine: { stop: vi.fn() } }));

const parsed = {
  meta: { fileName: "k-on-fuwa_fuwa_time.gp5", ppq: 480, tempos: [], timeSignatures: [], durationSeconds: 10 },
  tracks: [{ index: 1, name: "Guitar: Yui Hirasawa", instrumentName: "overdriven guitar", isPercussion: false, notes: [] }],
} as unknown as ParsedMidi;

describe("track mapping dialog", () => {
  beforeEach(() => useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, language: "en" } }));

  it("shows the score's title and its tracks", () => {
    useStudioStore.setState({
      pendingImport: { parsed, assignments: [{ midiTrackIndex: 1, memberId: "yui" }], data: new ArrayBuffer(0), title: "Fuwa Fuwa Time" },
    });
    render(<MidiMappingDialog />);
    expect(screen.getByText("Score title: Fuwa Fuwa Time")).toBeInTheDocument();
    expect(screen.getByText("Guitar: Yui Hirasawa")).toBeInTheDocument();
  });

  it("leaves the title out for a file without one", () => {
    useStudioStore.setState({ pendingImport: { parsed, assignments: [], data: new ArrayBuffer(0) } });
    render(<MidiMappingDialog />);
    expect(screen.queryByText(/Score title/)).not.toBeInTheDocument();
  });
});
