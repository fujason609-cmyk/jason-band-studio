import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelineToolbar } from "@/features/timeline/TimelineToolbar";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import { DEFAULT_OVERLAY, MIN_RECORD_LANE, recordLaneHeight, sanitizeOverlay } from "./overlay";
import { RecordFrame } from "./RecordFrame";

vi.mock("@/audio/AudioEngine", () => ({
  audioEngine: { isStarted: true, status: "stopped", play: vi.fn(), pause: vi.fn(), stop: vi.fn(), seek: vi.fn(), getPosition: () => 0 },
}));
// the canvas timeline needs a real browser; its sizing is checked through laneHeight
vi.mock("@/features/timeline/Timeline", () => ({
  Timeline: ({ laneHeight }: { laneHeight: number }) => <div data-testid="timeline" data-lane={laneHeight} />,
}));

class FakeResizeObserver {
  constructor(private readonly cb: () => void) {}
  observe() {
    this.cb();
  }
  disconnect() {}
}

describe("Instagram recording frame", () => {
  beforeAll(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    // jsdom has no layout: pretend the frame is 693px tall (390px wide phone, 9:16)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(693);
  });
  afterAll(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  beforeEach(() => {
    useStudioStore.setState({
      recordMode: false,
      transport: "stopped",
      settings: { ...DEFAULT_SETTINGS, language: "en", overlay: { ...DEFAULT_OVERLAY } },
    });
  });

  it("opens from the toolbar", async () => {
    const user = userEvent.setup();
    render(<TimelineToolbar />);
    await user.click(screen.getByRole("button", { name: "Instagram recording frame" }));
    expect(useStudioStore.getState().recordMode).toBe(true);
  });

  it("zooms the timeline from the toolbar", async () => {
    const user = userEvent.setup();
    render(<TimelineToolbar />);
    const before = useStudioStore.getState().settings.zoom;
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(useStudioStore.getState().settings.zoom).toBeGreaterThan(before);
  });

  it("puts the score and a flat key colour in an IG-shaped frame", () => {
    render(<RecordFrame />);
    const frame = screen.getByTestId("record-frame");
    expect(frame.style.getPropertyValue("--rw")).toBe("9");
    expect(frame.style.getPropertyValue("--rh")).toBe("16");
    expect(screen.getByTestId("record-key")).toHaveStyle({ background: "#00ff00" });
    expect(screen.getByTestId("record-key")).toBeEmptyDOMElement();
    // half of 693px for the score, minus the 40px ruler, over five lanes
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-lane", String(Math.floor((693 * 0.5 - 40) / 5)));
  });

  it("switches the key colour", async () => {
    const user = userEvent.setup();
    render(<RecordFrame />);
    await user.click(screen.getByRole("radio", { name: "Magenta" }));
    expect(screen.getByTestId("record-key")).toHaveStyle({ background: "#ff00ff" });
    expect(useStudioStore.getState().settings.overlay.color).toBe("magenta");
  });

  it("switches frame shape and score height", async () => {
    const user = userEvent.setup();
    render(<RecordFrame />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Frame" }), "4:5");
    await user.selectOptions(screen.getByRole("combobox", { name: "Score height" }), "0.6");
    expect(useStudioStore.getState().settings.overlay).toMatchObject({ frame: "4:5", split: 0.6 });
    expect(screen.getByTestId("record-frame").style.getPropertyValue("--rh")).toBe("5");
  });

  it("closes with the button or Escape", async () => {
    const user = userEvent.setup();
    useStudioStore.setState({ recordMode: true });
    const { unmount } = render(<RecordFrame />);
    await user.click(screen.getByRole("button", { name: "Leave the recording frame" }));
    expect(useStudioStore.getState().recordMode).toBe(false);
    unmount();

    useStudioStore.setState({ recordMode: true });
    render(<RecordFrame />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(useStudioStore.getState().recordMode).toBe(false);
  });
});

describe("recording frame maths and settings", () => {
  it("fits five lanes and the ruler, but never below the readable minimum", () => {
    expect(recordLaneHeight(340, 40, 5)).toBe(60);
    expect(recordLaneHeight(100, 40, 5)).toBe(MIN_RECORD_LANE);
  });

  it("repairs stored frame settings", () => {
    expect(sanitizeOverlay({ frame: "16:9", split: 0.9 })).toMatchObject({ frame: "9:16", split: 0.5 });
    expect(sanitizeOverlay({ frame: "4:5", split: 0.4 })).toMatchObject({ frame: "4:5", split: 0.4 });
    // keys left over from the old in-page overlay zone are dropped
    expect(sanitizeOverlay({ enabled: true, aspect: "16:9", size: "l", color: "blue" })).toEqual({ ...DEFAULT_OVERLAY, color: "blue" });
    expect(sanitizeOverlay(null)).toEqual(DEFAULT_OVERLAY);
  });
});
