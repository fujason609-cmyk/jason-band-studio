/** The voices the engine knows how to build. */
export type InstrumentId = "lead-guitar" | "rhythm-guitar" | "bass" | "drums" | "keys";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

export interface InstrumentLoadState {
  status: LoadStatus;
  /** 0..1 */
  progress: number;
  error?: string;
}

export type TransportStatus = "stopped" | "playing" | "paused";
