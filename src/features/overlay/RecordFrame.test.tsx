import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimelineToolbar } from "@/features/timeline/TimelineToolbar";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import { audioEngine } from "@/audio/AudioEngine";
import {
  DEFAULT_OVERLAY,
  MAX_TAKE_SECONDS,
  MIN_RECORD_LANE,
  MIN_TAKE_SECONDS,
  advanceTake,
  recordLayout,
  safeArea,
  sanitizeOverlay,
  startTake,
  takeProgress,
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

  it("offers preset lengths and a custom one typed in seconds", async () => {
    const user = userEvent.setup();
    render(<RecordFrame />);
    const pick = screen.getByRole("combobox", { name: "Take length" });
    await user.selectOptions(pick, "30");
    expect(useStudioStore.getState().settings.overlay.length).toBe(30);
    await user.selectOptions(pick, "custom");
    const seconds = screen.getByRole("spinbutton", { name: "Take length in seconds" });
    await user.clear(seconds);
    await user.type(seconds, "45");
    await user.tab();
    expect(useStudioStore.getState().settings.overlay.length).toBe(45);
    await user.selectOptions(pick, "song");
    expect(useStudioStore.getState().settings.overlay.length).toBe("song");
    expect(screen.queryByRole("spinbutton", { name: "Take length in seconds" })).not.toBeInTheDocument();
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
    expect(safe).toEqual({ top: 97, side: 23, keySide: 16 }); // 14%, 6% and 4%
    // the key strip: 92% wide (358px), still 16:9, so the score gets a little more height
    expect(recordLayout(390, 693, 40, 5, safe)).toEqual({ keyWidth: 358, keyHeight: 201, scoreHeight: 395, laneHeight: 71 });
    // feed posts show whole: no safe area
    expect(safeArea("4:5", 390, 488)).toEqual({ top: 0, side: 0, keySide: 0 });
    expect(safeArea("1:1", 390, 390)).toEqual({ top: 0, side: 0, keySide: 0 });
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
    expect(sanitizeOverlay({}).length).toBe("song");
    expect(sanitizeOverlay({ length: 45 }).length).toBe(45);
    expect(sanitizeOverlay({ length: 1 }).length).toBe(MIN_TAKE_SECONDS);
    expect(sanitizeOverlay({ length: 99999 }).length).toBe(MAX_TAKE_SECONDS);
    expect(sanitizeOverlay({ length: "long" }).length).toBe("song");
  });

  it("fills the progress bar over the chosen take length and says when the take is over", () => {
    const song = { durationSeconds: 200, baseBpm: 120, bpm: 120, loop: false };
    const clock = startTake(30);
    advanceTake(clock, 60, 200); // 30 s played of a 60 s take
    expect(takeProgress(clock, 60, 60, song)).toEqual({ progress: 0.5, done: false });
    advanceTake(clock, 90, 200);
    expect(takeProgress(clock, 60, 90, song)).toEqual({ progress: 1, done: true });
    // the whole song: the position in the song
    expect(takeProgress(clock, "song", 50, song).progress).toBe(0.25);
  });

  it("counts real seconds: slower playback takes longer, a count-in doesn't count", () => {
    const half = { durationSeconds: 200, baseBpm: 120, bpm: 60, loop: false };
    const clock = startTake(0);
    advanceTake(clock, 0, 200); // counting in: the position doesn't move
    advanceTake(clock, 15, 200); // 15 song seconds at half speed: 30 real seconds
    expect(takeProgress(clock, 60, 15, half)).toEqual({ progress: 0.5, done: false });
  });

  it("fills by the song's end when that comes first, and keeps counting through a loop", () => {
    const song = { durationSeconds: 100, baseBpm: 120, bpm: 120, loop: false };
    const near = startTake(80);
    advanceTake(near, 90, 100);
    expect(takeProgress(near, 60, 90, song).progress).toBeCloseTo(0.5); // 20 s left of the song
    const looping = startTake(80);
    advanceTake(looping, 99, 100);
    advanceTake(looping, 4, 100); // back to the top: 19 + 1 + 4 played
    expect(takeProgress(looping, 60, 4, { ...song, loop: true }).progress).toBeCloseTo(24 / 60);
  });
});
