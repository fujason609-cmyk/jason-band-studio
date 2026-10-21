import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createDemoProject, useProjectStore } from "@/stores/useProjectStore";
import { TransportBar } from "./TransportBar";

vi.mock("@/audio/AudioEngine", () => ({
  audioEngine: { getPosition: () => 0, status: "stopped", isStarted: false },
}));

describe("TransportBar tempo field", () => {
  beforeEach(() => useProjectStore.setState({ project: { ...createDemoProject(), bpm: 150 } }));

  it("takes a typed tempo, even one that passes through an out-of-range number", async () => {
    const user = userEvent.setup();
    render(<TransportBar />);
    const field = screen.getByRole("spinbutton");
    await user.clear(field);
    await user.type(field, "90");
    expect(field).toHaveValue(90);
    expect(useProjectStore.getState().project.bpm).toBe(90);
  });

  it("clamps what's left in the field when it loses focus", async () => {
    const user = userEvent.setup();
    render(<TransportBar />);
    const field = screen.getByRole("spinbutton");
    await user.clear(field);
    await user.type(field, "500");
    await user.tab();
    expect(useProjectStore.getState().project.bpm).toBe(300);
    expect(field).toHaveValue(300);
  });
});
