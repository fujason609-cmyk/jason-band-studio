import { useEffect, useId, useRef } from "react";
import { FileMusic } from "lucide-react";
import { MEMBERS, isMemberId } from "@/features/band/members";
import { useT } from "@/i18n/useT";
import { SONG_FILE_ACCEPT } from "@/services/file/midiFileService";
import { useStudioStore } from "@/stores/useStudioStore";
import { useMidiImport } from "./useMidiImport";

/** "Import MIDI" button plus the hidden file picker. */
export function MidiImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { openFile } = useMidiImport();
  const t = useT();
  return (
    <>
      <button
        type="button"
        className="btn btn--primary btn--import"
        aria-label={t.importMidi}
        title={t.importHint}
        onClick={() => inputRef.current?.click()}
      >
        <FileMusic size={18} aria-hidden="true" />
        <span className="btn__text">{t.importMidi}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={SONG_FILE_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void openFile(file);
        }}
      />
    </>
  );
}

/** Lets the user decide which MIDI track each member plays. */
export function MidiMappingDialog() {
  const pending = useStudioStore((s) => s.pendingImport);
  const setAssignment = useStudioStore((s) => s.setAssignment);
  const { confirm, cancel } = useMidiImport();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const t = useT();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (pending && !dialog.open) dialog.showModal?.();
    if (!pending && dialog.open) dialog.close();
  }, [pending]);

  const nothingAssigned = pending ? pending.assignments.every((a) => a.memberId === null) : true;

  return (
    <dialog ref={dialogRef} className="mapping-dialog" aria-labelledby={titleId} onCancel={cancel}>
      {pending && (
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nothingAssigned) void confirm();
          }}
        >
          <header className="mapping-dialog__head">
            <h2 id={titleId}>{t.whoPlaysWhat}</h2>
            <p>{t.mappingIntro(pending.parsed.meta.fileName, pending.parsed.tracks.length)}</p>
          </header>
          <ul className="mapping-list">
            {pending.parsed.tracks.map((track) => {
              const assignment = pending.assignments.find((a) => a.midiTrackIndex === track.index);
              const selectId = `map-${track.index}`;
              return (
                <li key={track.index} className="mapping-row">
                  <label htmlFor={selectId} className="mapping-row__track">
                    <strong>{track.name}</strong>
                    <span>{t.trackInfo(track.isPercussion ? t.drumKit : track.instrumentName, track.notes.length)}</span>
                  </label>
                  <select
                    id={selectId}
                    value={assignment?.memberId ?? ""}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setAssignment(track.index, isMemberId(v) ? v : null);
                    }}
                  >
                    <option value="">{t.leaveOut}</option>
                    {MEMBERS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {t.memberOption(t.memberName[m.id], t.memberRole[m.id])}
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          {nothingAssigned && <p className="mapping-dialog__hint">{t.nothingAssigned}</p>}
          <footer className="mapping-dialog__foot">
            <button type="button" className="btn" onClick={cancel}>
              {t.cancel}
            </button>
            <button type="submit" className="btn btn--primary" disabled={nothingAssigned}>
              {t.loadSong}
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
