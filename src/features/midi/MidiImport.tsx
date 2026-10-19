import { useEffect, useId, useRef } from "react";
import { FileMusic } from "lucide-react";
import { MEMBERS } from "@/features/band/members";
import { isMemberId } from "@/features/band/members";
import { useStudioStore } from "@/stores/useStudioStore";
import { useMidiImport } from "./useMidiImport";

/** "Import MIDI" button plus the hidden file picker. */
export function MidiImportButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { openFile } = useMidiImport();
  return (
    <>
      <button type="button" className="btn btn--primary" onClick={() => inputRef.current?.click()}>
        <FileMusic size={18} aria-hidden="true" />
        Import MIDI
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
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
            <h2 id={titleId}>Who plays what?</h2>
            <p>
              {pending.parsed.meta.fileName} has {pending.parsed.tracks.length} track
              {pending.parsed.tracks.length === 1 ? "" : "s"}. Give each one to a member, or leave it out. Several
              tracks can go to the same member.
            </p>
          </header>
          <ul className="mapping-list">
            {pending.parsed.tracks.map((track) => {
              const assignment = pending.assignments.find((a) => a.midiTrackIndex === track.index);
              const selectId = `map-${track.index}`;
              return (
                <li key={track.index} className="mapping-row">
                  <label htmlFor={selectId} className="mapping-row__track">
                    <strong>{track.name}</strong>
                    <span>
                      {track.instrumentName}, {track.notes.length} notes
                    </span>
                  </label>
                  <select
                    id={selectId}
                    value={assignment?.memberId ?? ""}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      setAssignment(track.index, isMemberId(v) ? v : null);
                    }}
                  >
                    <option value="">Leave out</option>
                    {MEMBERS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} ({m.role.toLowerCase()})
                      </option>
                    ))}
                  </select>
                </li>
              );
            })}
          </ul>
          {nothingAssigned && <p className="mapping-dialog__hint">Give at least one track to a member to load the song.</p>}
          <footer className="mapping-dialog__foot">
            <button type="button" className="btn" onClick={cancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={nothingAssigned}>
              Load song
            </button>
          </footer>
        </form>
      )}
    </dialog>
  );
}
