import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDemoProject, useProjectStore } from "@/stores/useProjectStore";
import { useStudioStore } from "@/stores/useStudioStore";
import { TrackMixer } from "./TrackMixer";

vi.mock("@/audio/AudioEngine", () => ({ audioEngine: { retryInstrument: vi.fn() } }));

describe("TrackMixer", () => {
  beforeEach(() => {
    useProjectStore.setState({ project: createDemoProject() });
    useStudioStore.setState({ instrumentStates: {} });
  });

  it("shows all five members", () => {
    render(<TrackMixer />);
    for (const name of ["Yui", "Mio", "Ritsu", "Mugi", "Azusa"]) {
      expect(screen.getByRole("button", { name: `Mute ${name}` })).toBeInTheDocument();
    }
  });

  it("mutes and solos through the store", async () => {
    const user = userEvent.setup();
    render(<TrackMixer />);
    await user.click(screen.getByRole("button", { name: "Mute Mio" }));
    expect(screen.getByRole("button", { name: "Mute Mio" })).toHaveAttribute("aria-pressed", "true");
    expect(useProjectStore.getState().project.tracks.find((t) => t.memberId === "mio")!.muted).toBe(true);

    await user.click(screen.getByRole("button", { name: "Solo Yui" }));
    expect(screen.getByRole("button", { name: "Clear solo" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear solo" }));
    expect(useProjectStore.getState().project.tracks.some((t) => t.solo)).toBe(false);
  });

  it("changes a member's instrument", async () => {
    const user = userEvent.setup();
    render(<TrackMixer />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Ritsu's instrument" }), "keys");
    expect(useProjectStore.getState().project.tracks.find((t) => t.memberId === "ritsu")!.instrument).toBe("keys");
  });

  it("shows sample loading and failures", () => {
    useStudioStore.setState({
      instrumentStates: { bass: { status: "loading", progress: 0.4 }, drums: { status: "error", progress: 0, error: "x" } },
    });
    render(<TrackMixer />);
    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
