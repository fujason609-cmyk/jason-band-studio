import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { PkLab } from "./PkLab";
import { PkPage } from "./PkPage";

vi.mock("@/audio/AudioEngine", () => ({
  audioEngine: {
    status: "stopped",
    stop: vi.fn(),
    pause: vi.fn(),
    play: vi.fn(),
    seek: vi.fn(),
    setLoopRange: vi.fn(),
    setCountIn: vi.fn(),
    getAudiblePosition: () => 0,
    audioTime: () => 0,
  },
}));

describe("PK page", () => {
  it("fights the members picked, and the picker finds the best fights", async () => {
    const user = userEvent.setup();
    render(<PkPage />);
    expect(screen.getByRole("heading", { name: "PK mode" })).toBeInTheDocument();
    // Mio vs Azusa by default; the fight's outcome is shown
    expect(screen.getByText(/This fight:/)).toBeInTheDocument();
    const left = screen.getByRole("group", { name: "Left" });
    await user.click(left.querySelectorAll("button")[0]!); // Yui
    expect(screen.getByDisplayValue("Yui vs Azusa — who wins?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Find the best fights/ }));
    expect(await screen.findAllByRole("button", { name: /Seed \d+/ })).toHaveLength(5);
  });

  it("names the song by the score's title or the file, as chosen", async () => {
    const user = userEvent.setup();
    const p = useProjectStore.getState().project;
    useProjectStore.setState({ project: { ...p, name: "ふわふわ時間", midiMeta: { fileName: "k-on-fuwa_fuwa_time.gp5", ppq: 480, tempos: [], timeSignatures: [], durationSeconds: 10 } } });
    render(<PkPage />);
    expect(screen.getByLabelText("The score's title: ふわふわ時間")).toBeInTheDocument();
    await user.click(screen.getByLabelText("The file name: k-on-fuwa_fuwa_time"));
    expect(useStudioStore.getState().settings.overlay.introTitle).toBe("file");
    useProjectStore.setState({ project: p });
  });

  it("asks for two different members", async () => {
    const user = userEvent.setup();
    render(<PkPage />);
    const right = screen.getByRole("group", { name: "Right" });
    await user.click(right.querySelectorAll("button")[1]!); // Mio, as on the left
    expect(screen.getByText("Pick two different members.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Record the video/ })).toBeDisabled();
  });
});

describe("PK lab", () => {
  it("runs every pair and shows the win rates", async () => {
    const user = userEvent.setup();
    render(<PkLab />);
    const seeds = screen.getByRole("spinbutton");
    await user.clear(seeds);
    await user.type(seeds, "10");
    await act(async () => {
      await user.click(screen.getByRole("button", { name: /Run \d+ fights/ }));
    });
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByText("KO in 80–95% of the clip")).toBeInTheDocument();
  });
});
