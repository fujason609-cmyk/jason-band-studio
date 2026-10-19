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

### UI language (en / zh)

All user-visible text lives in `src/i18n/strings.ts`: an `en` object whose type (`Strings`) the `zh` object must satisfy, so a missing translation is a type error (`strings.test.ts` also checks key parity). Components call `useT()`; code outside React (store callbacks, async handlers, notices) calls `getT()`. The language is `settings.language`, persisted with the other settings and defaulted by `detectLanguage()`. Member display names and roles come from `t.memberName` / `t.memberRole`, not from `MEMBERS`. Errors thrown by the MIDI file and parse layers carry a `code` plus `fileName` and are translated where they are shown (`useMidiImport`), so keep their English `message` only for logs and tests. Tests render in English (jsdom reports `en-US`).

### Responsive layout

One breakpoint, `$narrow: 760px` in `studio.scss`, mirrored by `NARROW_QUERY` in `useMediaQuery.ts` for JS (one-octave keyboard, lane labels drawn on the timeline canvas). `TOUCH_QUERY` (no hover, coarse pointer) swaps keyboard hints for tap hints and enlarges controls in CSS. On narrow screens the transport bar is `position: sticky` and `useHideOnScroll` slides it away while scrolling down (the pure rule is `scrollVisibility`).

### Live instrument panel

`liveLayoutFor(instrument)` in `src/lib/fretboard.ts` picks the on-screen instrument: `fretboard` (lead guitar, bass, with tunings in the same file), `chords` (rhythm guitar strum pads, `CHORDS`), `piano` (keys) or `drums` (kit laid out by `DrumPad.area` grid areas). All of them feed `useKeyboardInput`, which tracks every sounding note by *source* (`key:a`, `ptr:<id>`). A strum is one source with a sub-source per string (`src|0`, `src|1`, ...), started `STRUM_MS` apart; `release(src)` stops the whole group and cancels strings that haven't started yet. On the fretboard the octave control only moves the computer-keyboard notes, so it is hidden on touch screens.

### Video overlay zone

`src/features/overlay/` draws a chroma-key box under the timeline, stored in `settings.overlay`. `TimelineToolbar` is the first row of the `.studio__tracks` card (full width on desktop; on narrow screens CSS `order` moves it between the mixer strips and the timeline) and holds zoom, follow, the overlay switch and `OverlayOptions`; nothing floats over the timeline itself. While the overlay is on, `.overlay-zone` has a screen-height bottom margin so a recording framed on timeline + box never shows the live instrument panel. Zoom is just `settings.zoom`, and `Timeline` keeps the view centred in a layout effect when it changes. Its colours in `OVERLAY_COLORS` are exact key values: never theme them, and never add a border, radius, shadow or text inside the box, or keying breaks. `OverlayOptions` uses `visibility: hidden` while playing (not `display: none`) so the box doesn't move mid-recording.

### Tests

Tests sit next to their source files (`*.test.ts(x)`). `src/test/setup.ts` loads jest-dom and `fake-indexeddb/auto`, and stubs `matchMedia` as a wide mouse screen (every media query is false). Tone/Web Audio is not available under jsdom, so component tests mock `@/audio/AudioEngine` (see `TrackControls.test.tsx`). Keep logic that needs testing in pure modules (`src/lib`, mapper, validation, stores).
