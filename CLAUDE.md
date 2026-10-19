# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static, backend-free browser DAW (React 19 + TypeScript + Vite + Tone.js + Zustand + SCSS) for a five-member fan-made "K-ON!" band. Deployed to GitHub Pages. All sound is synthesized in-browser; the repo must not ship character artwork, official recordings or scores. Any sample pack added must be redistributable (record its `license` in `src/audio/audioConfig.ts`).

## Commands

Package manager is **pnpm 9** (`corepack enable`).

```bash
pnpm dev                 # dev server, http://localhost:5173
pnpm build               # tsc -b + vite build → dist/
pnpm typecheck           # tsc -b only
pnpm lint                # eslint .
pnpm test                # vitest run (jsdom, fake-indexeddb)
pnpm test:watch
pnpm vitest run src/lib/time.test.ts          # single file
pnpm vitest run -t "<test name>"              # single test by name
pnpm format              # prettier (printWidth 100, double quotes, trailing commas)
pnpm demo:midi           # regenerate public/demo/after-school-jam.mid from src/features/band/demoSong.ts
```

CI (`.github/workflows/deploy.yml`) runs lint → test → build on push to `main`, with `BASE_PATH=/<repo-name>/`. Asset URLs must go through `import.meta.env.BASE_URL` (see `samplePackUrl`) so they work under that sub-path.

TS is strict with `noUncheckedIndexedAccess`, `noUnusedLocals/Parameters` and `verbatimModuleSyntax` (use `import type`). Import via the `@/` alias for `src/`.

## Architecture

**React owns state and UI; `AudioEngine` owns sound and time.** Components never import Tone.js.

- `src/audio/AudioEngine.ts` exports a singleton `audioEngine`. `start()` must be called from a user gesture (`ensureAudio()` in `src/hooks/useAudioEngine.ts`). Before start, `sync()` only remembers the last project and replays it once started.
- `useAudioEngineBridge` (mounted once) subscribes to `useProjectStore` and calls `audioEngine.sync(project)` whenever the `project` reference changes. `sync` is a diff: `AudioTrack.setNotes` is a no-op when given the **same notes array reference**, so store updates must keep untouched arrays referentially identical and must create new objects (immutable updates) for things that changed. Engine events (instrument load state, transport end, errors) flow back into `useStudioStore`.
- Two Zustand stores:
  - `useProjectStore`: the persisted `StudioProject` (song, tracks, mix). Always exactly five tracks, one per `MEMBERS` entry in `src/features/band/members.ts`, keyed by `memberId`.
  - `useStudioStore`: ephemeral UI/runtime state (transport status, audio-started, instrument load states, pending MIDI import, notices) plus `settings` (persisted to localStorage).
- `PersistenceProvider` hydrates settings (localStorage) and the project (IndexedDB, key `"current"`), then debounce-saves the project (400 ms). Audio objects are never stored. Loaded projects go through `validateProject` (`src/services/storage/projectValidation.ts`), which repairs fields and drops bad notes, but returns `null` (fall back to the demo) on wrong `version` or a missing member track. **If you change `StudioProject`'s shape, bump `PROJECT_VERSION` in `src/types/project.ts` and update the validator.** Original MIDI files are stored as Blobs in a separate IndexedDB store, referenced by `midiBlobKey`.
- The playhead and position readout use `usePlaybackPosition` (requestAnimationFrame polling `audioEngine.getPosition()`) and write to the DOM/canvas directly. Playback must not cause React re-renders; don't put position into a store.

### Time model (`src/lib/time.ts`)

Notes are stored in **song seconds** (seconds at the song's own tempo map, resolved by `@tonejs/midi`). The engine converts them to Transport ticks against `project.baseBpm` at `PPQ = 192`; note durations are also scheduled in ticks. The user's playback tempo (`project.bpm`) only changes `Transport.bpm`, so tick positions, playhead and audio never drift. All positions crossing the engine API (`seek`, `getPosition`) are in song seconds. `durationSeconds` is rounded up to a whole bar (`songLength`) so loops land on the downbeat. Song end is detected by a Transport-scheduled event plus `setTimeout` (not `Tone.Draw`, which is dropped in background tabs).

### Audio track details

Each `AudioTrack` has two voices: a sequenced voice behind a `Tone.Channel` (volume + mute/solo) and a separate **live** voice for keyboard playing that ignores mute/solo and transport stops. Mute/solo rules live in `src/lib/mix.ts` (mute always wins; with any solo, only soloed tracks play). Going inaudible, pausing, stopping or seeking calls `releaseAll()` to cut ringing notes.

`SampleManager` loads instruments lazily and shares buffers across tracks. Instruments without an entry in `SAMPLE_PACKS` use synth voices (`src/audio/voices.ts`) and are ready immediately. Notes stay silent until an instrument's voice exists. Instrument IDs: `lead-guitar`, `rhythm-guitar`, `bass`, `drums`, `keys`. Drum samples are keyed by GM note name (`C2` = kick 36, `D2` = snare 38).

### MIDI import flow

`useMidiImport.openFile` → `readMidiFile` (file checks) → `parseMidi` (`@tonejs/midi` → `NoteEvent`s) → `suggestMapping` (GM program family → member: drums→ritsu, bass→mio, guitar/keys/lead → yui/azusa/tsumugi) → stored as `pendingImport` for the user to edit. `confirm` → `buildTracksFromMapping` (merges tracks assigned to the same member; unassigned members keep existing tracks) → saves the MIDI blob → `engine.stop()` → `projectStore.loadSong`. The timeline grid uses only the first time signature.

### Tests

Tests sit next to their source files (`*.test.ts(x)`). `src/test/setup.ts` loads jest-dom and `fake-indexeddb/auto`. Tone/Web Audio is not available under jsdom, so component tests mock `@/audio/AudioEngine` (see `TrackControls.test.tsx`). Keep logic that needs testing in pure modules (`src/lib`, mapper, validation, stores).
