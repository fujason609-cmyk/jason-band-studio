import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import { DEFAULT_OVERLAY, sanitizeOverlay } from "./overlay";
import { VideoOverlayZone } from "./VideoOverlayZone";

const enable = () =>
  useStudioStore.setState({
    transport: "stopped",
    settings: { ...DEFAULT_SETTINGS, language: "en", overlay: { ...DEFAULT_OVERLAY, enabled: true } },
  });

describe("VideoOverlayZone", () => {
  beforeEach(enable);

  it("renders nothing while turned off", () => {
    useStudioStore.getState().updateSettings({ overlay: DEFAULT_OVERLAY });
    const { container } = render(<VideoOverlayZone />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a flat key colour box in the chosen shape", async () => {
    const user = userEvent.setup();
    render(<VideoOverlayZone />);
    const key = screen.getByTestId("overlay-key");
    expect(key).toHaveStyle({ background: "#00ff00" });
    expect(key).toBeEmptyDOMElement();

    await user.click(screen.getByRole("radio", { name: "Blue" }));
    expect(screen.getByTestId("overlay-key")).toHaveStyle({ background: "#0000ff" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Shape" }), "9:16");
    expect(useStudioStore.getState().settings.overlay).toMatchObject({ color: "blue", aspect: "9:16", enabled: true });
  });

  it("hides its controls while playing but keeps the box", () => {
    useStudioStore.setState({ transport: "playing" });
    const { container } = render(<VideoOverlayZone />);
    expect(container.querySelector(".overlay-zone__controls")).toHaveClass("is-hidden");
    expect(screen.getByTestId("overlay-key")).toBeInTheDocument();
  });

  it("can be closed", async () => {
    const user = userEvent.setup();
    render(<VideoOverlayZone />);
    await user.click(screen.getByRole("button", { name: "Hide the video overlay zone" }));
    expect(useStudioStore.getState().settings.overlay.enabled).toBe(false);
  });

  it("repairs stored overlay settings", () => {
    expect(sanitizeOverlay(null)).toEqual(DEFAULT_OVERLAY);
    expect(sanitizeOverlay({ enabled: true, color: "pink", aspect: "21:9", size: "l" })).toEqual({
      enabled: true,
      color: "green",
      aspect: "16:9",
      size: "l",
    });
  });
});
