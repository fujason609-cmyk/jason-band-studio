import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelineToolbar } from "@/features/timeline/TimelineToolbar";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import { audioEngine } from "@/audio/AudioEngine";
import { DEFAULT_OVERLAY, MIN_RECORD_LANE, recordLayout, safeArea, sanitizeOverlay } from "./overlay";
import { RecordFrame } from "./RecordFrame";

vi.mock("@/audio/AudioEngine", () => ({
  audioEngine: {
    isStarted: true,
    status: "stopped",
    start: vi.fn().mockResolvedValue(true),
    setLoop: vi.fn(),
    setFeel: vi.fn(),
    setCountIn: vi.fn(),
    setMetronome: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
    getPosition: () => 0,
  },
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
    // jsdom has no layout: pretend the frame is 390 × 693 (a 390px wide phone, 9:16)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(390);
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
    // key strip is 16:9 of the 390px width (219px); the score gets the other 474px, less
    // the 97px kept clear of Reels' top bar, minus the 40px ruler, over five lanes
    expect(screen.getByTestId("record-key")).toHaveStyle({ height: "219px" });
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-lane", String(Math.floor((693 - 219 - 97 - 40) / 5)));
  });

  it("restarts from the beginning", async () => {
    const user = userEvent.setup();
    useStudioStore.setState({ transport: "paused" });
    render(<RecordFrame />);
    await user.click(screen.getByRole("button", { name: "Play again from the start" }));
    expect(audioEngine.stop).toHaveBeenCalled();
    expect(audioEngine.play).toHaveBeenCalled();
    expect(vi.mocked(audioEngine.stop).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(audioEngine.play).mock.invocationCallOrder[0]!);
    expect(useStudioStore.getState().transport).toBe("playing");
  });

  it("switches the key colour", async () => {
    const user = userEvent.setup();
    render(<RecordFrame />);
    await user.click(screen.getByRole("radio", { name: "Magenta" }));
    expect(screen.getByTestId("record-key")).toHaveStyle({ background: "#ff00ff" });
    expect(useStudioStore.getState().settings.overlay.color).toBe("magenta");
  });

  it("switches the frame shape", async () => {
    const user = userEvent.setup();
    render(<RecordFrame />);
    await user.selectOptions(screen.getByRole("combobox", { name: "Frame" }), "4:5");
    expect(useStudioStore.getState().settings.overlay).toMatchObject({ frame: "4:5" });
    expect(screen.getByTestId("record-frame").style.getPropertyValue("--rh")).toBe("5");
  });

  it("explains instead of offering video recording where the browser can't record", () => {
    // jsdom has no MediaRecorder or canvas capture
    render(<RecordFrame />);
    expect(screen.queryByRole("button", { name: /Video recording/ })).not.toBeInTheDocument();
    expect(screen.getByText(/can't record video/)).toBeInTheDocument();
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
  it("gives the key colour a 16:9 strip and the score the rest", () => {
    expect(recordLayout(390, 693, 40, 5)).toEqual({ keyHeight: 219, scoreHeight: 474, laneHeight: 86 });
    expect(recordLayout(390, 488, 40, 5)).toEqual({ keyHeight: 219, scoreHeight: 269, laneHeight: 45 });
  });

  it("keeps a Reels score clear of Instagram's top bar and the sides cut on tall phones", () => {
    const safe = safeArea("9:16", 390, 693);
    expect(safe).toEqual({ top: 97, side: 23 }); // 14% and 6%
    expect(recordLayout(390, 693, 40, 5, safe)).toEqual({ keyHeight: 219, scoreHeight: 377, laneHeight: 67 });
    // feed posts show whole: no safe area
    expect(safeArea("4:5", 390, 488)).toEqual({ top: 0, side: 0 });
    expect(safeArea("1:1", 390, 390)).toEqual({ top: 0, side: 0 });
  });

  it("never shrinks lanes below the readable minimum", () => {
    expect(recordLayout(390, 300, 40, 5).laneHeight).toBe(MIN_RECORD_LANE);
  });

  it("repairs stored frame settings", () => {
    expect(sanitizeOverlay({ frame: "16:9" })).toEqual({ ...DEFAULT_OVERLAY, frame: "9:16" });
    expect(sanitizeOverlay({ frame: "4:5" })).toEqual({ ...DEFAULT_OVERLAY, frame: "4:5" });
    // keys left over from older versions (in-page overlay zone, score split) are dropped
    expect(sanitizeOverlay({ enabled: true, aspect: "16:9", size: "l", split: 0.6, color: "blue" })).toEqual({ ...DEFAULT_OVERLAY, color: "blue" });
    expect(sanitizeOverlay(null)).toEqual(DEFAULT_OVERLAY);
    expect(sanitizeOverlay({ fps: 60 }).fps).toBe(60);
    expect(sanitizeOverlay({ fps: 24 }).fps).toBe(30);
  });
});
