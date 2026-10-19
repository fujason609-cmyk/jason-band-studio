import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelineToolbar } from "@/features/timeline/TimelineToolbar";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import { DEFAULT_OVERLAY, sanitizeOverlay } from "./overlay";
import { VideoOverlayZone } from "./VideoOverlayZone";

const Both = () => (
  <>
    <TimelineToolbar />
    <VideoOverlayZone />
  </>
);

const enable = () =>
  useStudioStore.setState({
    transport: "stopped",
    settings: { ...DEFAULT_SETTINGS, language: "en", overlay: { ...DEFAULT_OVERLAY, enabled: true } },
  });

describe("video overlay zone", () => {
  beforeEach(enable);

  it("shows nothing but the toolbar while turned off", () => {
    useStudioStore.getState().updateSettings({ overlay: DEFAULT_OVERLAY });
    render(<Both />);
    expect(screen.queryByTestId("overlay-key")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Key colour" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
  });

  it("shows a flat key colour box in the chosen shape", async () => {
    const user = userEvent.setup();
    render(<Both />);
    const key = screen.getByTestId("overlay-key");
    expect(key).toHaveStyle({ background: "#00ff00" });
    expect(key).toBeEmptyDOMElement();

    await user.click(screen.getByRole("radio", { name: "Blue" }));
    expect(screen.getByTestId("overlay-key")).toHaveStyle({ background: "#0000ff" });
    await user.selectOptions(screen.getByRole("combobox", { name: "Shape" }), "9:16");
    expect(useStudioStore.getState().settings.overlay).toMatchObject({ color: "blue", aspect: "9:16", enabled: true });
  });

  it("hides its options while playing but keeps the box and the zoom tools", () => {
    useStudioStore.setState({ transport: "playing" });
    render(<Both />);
    expect(screen.getByRole("group", { name: "Video overlay zone" })).toHaveClass("is-hidden");
    expect(screen.getByTestId("overlay-key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom in" })).toBeInTheDocument();
  });

  it("is switched on and off from the toolbar", async () => {
    const user = userEvent.setup();
    render(<Both />);
    await user.click(screen.getByRole("button", { name: "Hide the video overlay zone" }));
    expect(useStudioStore.getState().settings.overlay.enabled).toBe(false);
    expect(screen.queryByTestId("overlay-key")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show the video overlay zone" }));
    expect(screen.getByTestId("overlay-key")).toBeInTheDocument();
  });

  it("zooms from the toolbar within limits", async () => {
    const user = userEvent.setup();
    render(<Both />);
    const before = useStudioStore.getState().settings.zoom;
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(useStudioStore.getState().settings.zoom).toBeGreaterThan(before);
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
