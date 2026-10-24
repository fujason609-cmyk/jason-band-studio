import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelineToolbar } from "@/features/timeline/TimelineToolbar";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import { audioEngine } from "@/audio/AudioEngine";
import {
  DEFAULT_OVERLAY,
  MIN_RECORD_LANE,
  recordLayout,
  safeArea,
  sanitizeOverlay,
} from "./overlay";
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
vi.mock("./Highway", () => ({ Highway: () => <div data-testid="highway" /> }));

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
    const { settings } = useStudioStore.getState();
    useStudioStore.setState({ settings: { ...settings, overlay: { ...settings.overlay, view: "scroll" } } });
    render(<RecordFrame />);
    const frame = screen.getByTestId("record-frame");
    expect(frame.style.getPropertyValue("--rw")).toBe("9");
    expect(frame.style.getPropertyValue("--rh")).toBe("16");
    expect(screen.getByTestId("record-key")).toHaveStyle({ background: "#00ff00" });
    expect(screen.getByTestId("record-key")).toBeEmptyDOMElement();
    // Reels: the key strip is 92% of the 390px width (358px), 16:9 (201px); the score gets
    // the rest less the 97px kept clear of Reels' top bar, minus the 40px ruler, over five lanes
    expect(screen.getByTestId("record-key")).toHaveStyle({ height: "201px", width: "358px" });
    expect(screen.getByTestId("timeline")).toHaveAttribute("data-lane", String(Math.floor((693 - 201 - 97 - 40) / 5)));
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

  it("can leave the key strip out, and bring it back with a colour", async () => {
    const user = userEvent.setup();
    render(<RecordFrame />);
    await user.click(screen.getByRole("radio", { name: "No key strip" }));
    expect(useStudioStore.getState().settings.overlay.keyStrip).toBe(false);
    expect(screen.queryByTestId("record-key")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "No key strip" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Green" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("radio", { name: "Blue" }));
    expect(useStudioStore.getState().settings.overlay).toMatchObject({ keyStrip: true, color: "blue" });
    expect(screen.getByTestId("record-key")).toHaveStyle({ background: "#0000ff" });
  });

  it("opens on the stage and steps through the views", async () => {
    const user = userEvent.setup();
    render(<RecordFrame />);
    const view = () => useStudioStore.getState().settings.overlay.view;
    const next = () => user.click(screen.getByRole("button", { name: /Tap for the next view/ }));
    expect(view()).toBe("stage");
    expect(screen.getByTestId("stage-view")).toBeInTheDocument();
    await next();
    expect(view()).toBe("stageRoad");
    expect(screen.getByTestId("stage-view")).toBeInTheDocument();
    await next();
    expect(view()).toBe("fall");
    expect(screen.getByTestId("highway")).toBeInTheDocument();
    await next();
    expect(view()).toBe("scroll");
    expect(screen.getByTestId("timeline")).toBeInTheDocument();
    await next();
    expect(view()).toBe("stage");
    expect(sanitizeOverlay({ view: "fall" }).view).toBe("fall");
    expect(sanitizeOverlay({ view: "sideways" }).view).toBe("stage");
  });

  it("steps through the openings, and keeps the hook text in the take settings", async () => {
    // a browser that can record (jsdom can't): the take controls show
    vi.stubGlobal("MediaRecorder", { isTypeSupported: () => true });
    HTMLCanvasElement.prototype.captureStream = vi.fn() as never;
    onTestFinished(() => {
      delete (HTMLCanvasElement.prototype as { captureStream?: unknown }).captureStream;
    });
    const user = userEvent.setup();
    render(<RecordFrame />);
    const opening = () => useStudioStore.getState().settings.overlay.opening;
    expect(opening()).toBe("cold");
    await user.click(screen.getByRole("button", { name: /Tap for the opening skit/ }));
    expect(opening()).toBe("skit");
    await user.click(screen.getByRole("button", { name: /Tap for a 3-2-1/ }));
    expect(opening()).toBe("countdown");
    await user.click(screen.getByRole("button", { name: /Tap to start straight on the music/ }));
    expect(opening()).toBe("cold");
    await user.click(screen.getByRole("button", { name: "Hook text and take settings" }));
    // (jsdom doesn't open a <dialog>: its fields count as hidden)
    await user.type(screen.getByRole("textbox", { name: /Hook text/, hidden: true }), "K-ON! plays IRIS OUT");
    expect(useStudioStore.getState().settings.overlay.hook).toBe("K-ON! plays IRIS OUT");
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
    expect(recordLayout(390, 693, 40, 5)).toEqual({ keyWidth: 390, keyHeight: 219, scoreHeight: 474, laneHeight: 86 });
    expect(recordLayout(390, 488, 40, 5)).toEqual({ keyWidth: 390, keyHeight: 219, scoreHeight: 269, laneHeight: 45 });
  });

  it("keeps a Reels score clear of Instagram's top bar and the sides cut on tall phones", () => {
    const safe = safeArea("9:16", 390, 693);
    expect(safe).toEqual({ top: 97, side: 23, keySide: 16, bottom: 0 }); // 14%, 6% and 4%
    // the key strip: 92% wide (358px), still 16:9, so the score gets a little more height
    expect(recordLayout(390, 693, 40, 5, safe)).toEqual({ keyWidth: 358, keyHeight: 201, scoreHeight: 395, laneHeight: 71 });
    // feed posts show whole: no safe area
    expect(safeArea("4:5", 390, 488)).toEqual({ top: 0, side: 0, keySide: 0, bottom: 0 });
    expect(safeArea("1:1", 390, 390)).toEqual({ top: 0, side: 0, keySide: 0, bottom: 0 });
  });

  it("without the key strip gives the score the whole frame, clear of the Reels caption", () => {
    const safe = safeArea("9:16", 390, 693, false);
    expect(safe.bottom).toBe(83); // 12%
    // 693 - 97 top - 83 bottom = 513 for the score: lanes (513 - 40) / 5 = 94, up from 71
    expect(recordLayout(390, 693, 40, 5, safe, false)).toEqual({ keyWidth: 0, keyHeight: 0, scoreHeight: 513, laneHeight: 94 });
    // a feed post shows whole: the score fills all of it
    expect(recordLayout(390, 488, 40, 5, safeArea("4:5", 390, 488, false), false).scoreHeight).toBe(488);
    expect(sanitizeOverlay({}).keyStrip).toBe(true);
    expect(sanitizeOverlay({ keyStrip: false }).keyStrip).toBe(false);
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
    // the take length setting was removed: an old stored one is dropped
    expect(sanitizeOverlay({ length: 45 })).toEqual(DEFAULT_OVERLAY);
    // a take opens on the music unless set otherwise (an old skit switch is dropped)
    expect(sanitizeOverlay({ intro: true }).opening).toBe("cold");
    expect(sanitizeOverlay({ opening: "countdown" }).opening).toBe("countdown");
    expect(sanitizeOverlay({ hook: 7 }).hook).toBe("");
    expect(sanitizeOverlay({}).introTitle).toBe("score");
    expect(sanitizeOverlay({ introTitle: "file" }).introTitle).toBe("file");
  });

});
