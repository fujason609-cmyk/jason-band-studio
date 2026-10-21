import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Fader } from "./Fader";

function Volume() {
  const [v, setV] = useState(0.8);
  return <Fader label="Volume" value={v} onChange={setV} />;
}

describe("Fader", () => {
  it("shows the level in percent while it moves, then hides it", () => {
    vi.useFakeTimers();
    const { container } = render(<Volume />);
    const bubble = container.querySelector(".fader__bubble")!;
    expect(bubble).not.toHaveClass("is-shown");

    const slider = screen.getByRole("slider", { name: "Volume" });
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: "0.37" } });
    expect(bubble).toHaveClass("is-shown");
    expect(bubble).toHaveTextContent("37%");

    // held: stays up; let go: gone a moment later
    act(() => vi.advanceTimersByTime(2000));
    expect(bubble).toHaveClass("is-shown");
    fireEvent.pointerUp(slider);
    act(() => vi.advanceTimersByTime(1000));
    expect(bubble).not.toHaveClass("is-shown");
    vi.useRealTimers();
  });
});
