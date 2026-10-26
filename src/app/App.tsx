import { useState, type CSSProperties } from "react";
import { NoticeBar } from "@/components/layout/NoticeBar";
import { StudioHeader } from "@/components/layout/StudioHeader";
import { TransportBar } from "@/components/transport/TransportBar";
import { InstrumentPanel } from "@/features/instruments/InstrumentPanel";
import { MidiMappingDialog } from "@/features/midi/MidiImport";
import { useMidiImport } from "@/features/midi/useMidiImport";
import { TrackMixer } from "@/features/mixer/TrackMixer";
import { RecordFrame } from "@/features/overlay/RecordFrame";
import { LANE_HEIGHT, RULER_HEIGHT } from "@/features/timeline/layout";
import { Timeline } from "@/features/timeline/Timeline";
import { TimelineToolbar } from "@/features/timeline/TimelineToolbar";
import { useAudioEngineBridge } from "@/hooks/useAudioEngine";
import { useT } from "@/i18n/useT";
import { PkLab } from "@/pk/PkLab";
import { PkPage } from "@/pk/PkPage";
import { usePkRoute } from "@/pk/route";
import { useStudioStore } from "@/stores/useStudioStore";
import { PersistenceProvider } from "./providers/PersistenceProvider";
import { ThemeProvider } from "./providers/ThemeProvider";

function Studio() {
  useAudioEngineBridge();
  const t = useT();
  const { openFile } = useMidiImport();
  const [dragging, setDragging] = useState(false);
  const recordMode = useStudioStore((s) => s.recordMode);
  const pk = usePkRoute();
  const layoutVars = { "--lane-h": `${LANE_HEIGHT}px`, "--ruler-h": `${RULER_HEIGHT}px` } as CSSProperties;

  // PK mode (#/pk): the engine bridge above stays mounted, so the song plays as in the studio
  if (pk) return pk === "lab" ? <PkLab /> : <PkPage />;

  if (recordMode) {
    return (
      <div style={layoutVars}>
        <RecordFrame />
      </div>
    );
  }

  return (
    <div
      className={`app ${dragging ? "is-dragging" : ""}`}
      style={layoutVars}
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
          <TimelineToolbar />
          <TrackMixer />
          <Timeline />
        </div>
        <InstrumentPanel />
      </main>
      <footer className="app-footer">
        <section className="formats" aria-labelledby="formats-title">
          <h2 id="formats-title" className="formats__title">
            {t.importFormatsTitle}
          </h2>
          <ul className="formats__list">
            {t.importFormats.map((f) => (
              <li key={f.name} className="formats__item">
                <strong>{f.name}</strong> <code>{f.ext}</code>
                <span className="formats__note">{f.note}</span>
              </li>
            ))}
          </ul>
          <p className="formats__how">{t.importFormatsHow}</p>
        </section>
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
