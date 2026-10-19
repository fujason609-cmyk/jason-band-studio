import { useState, type CSSProperties } from "react";
import { NoticeBar } from "@/components/layout/NoticeBar";
import { StudioHeader } from "@/components/layout/StudioHeader";
import { TransportBar } from "@/components/transport/TransportBar";
import { InstrumentPanel } from "@/features/instruments/InstrumentPanel";
import { MidiMappingDialog } from "@/features/midi/MidiImport";
import { useMidiImport } from "@/features/midi/useMidiImport";
import { TrackMixer } from "@/features/mixer/TrackMixer";
import { LANE_HEIGHT, RULER_HEIGHT } from "@/features/timeline/layout";
import { Timeline } from "@/features/timeline/Timeline";
import { useAudioEngineBridge } from "@/hooks/useAudioEngine";
import { useT } from "@/i18n/useT";
import { PersistenceProvider } from "./providers/PersistenceProvider";
import { ThemeProvider } from "./providers/ThemeProvider";

function Studio() {
  useAudioEngineBridge();
  const t = useT();
  const { openFile } = useMidiImport();
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`app ${dragging ? "is-dragging" : ""}`}
      style={{ "--lane-h": `${LANE_HEIGHT}px`, "--ruler-h": `${RULER_HEIGHT}px` } as CSSProperties}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void openFile(file);
      }}
    >
      <StudioHeader />
      <NoticeBar />
      <TransportBar />
      <main className="studio">
        <div className="studio__tracks">
          <TrackMixer />
          <Timeline />
        </div>
        <InstrumentPanel />
      </main>
      <footer className="app-footer">
        <p>{t.footer}</p>
      </footer>
      <MidiMappingDialog />
      {dragging && (
        <div className="drop-hint" aria-hidden="true">
          {t.dropHint}
        </div>
      )}
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <PersistenceProvider>
        <Studio />
      </PersistenceProvider>
    </ThemeProvider>
  );
}
