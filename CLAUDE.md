# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A static, backend-free browser DAW (React 19 + TypeScript + Vite + Tone.js + Zustand + SCSS) for a five-member fan-made "K-ON!" band. Deployed to GitHub Pages. Instruments are CC0 recordings (Karoryfer / Versilian, built by `scripts/build-sample-packs.ts`, credited in `public/instruments/CREDITS.md`) with in-browser synth fallbacks; the repo must not ship character artwork, official recordings or scores. Any sample pack added must be redistributable (record its `license` in `SAMPLE_PACKS`, `src/audio/audioConfig.ts`, and in CREDITS.md).

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
FFMPEG=/path/to/ffmpeg pnpm samples:build   # rebuild public/instruments/* + samplePacks.generated.ts from CC0 sources
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

Synth voices in `voices.ts` are modelled on each member's known gear (comment above `createSynthVoice`): the guitars, the bass's finger pluck and Mugi's FM piano are **rendered once in plain JS** (`karplus.ts`, `fmPiano.ts`; which notes per `RENDERED_SETS`; done in `SampleManager.loadSynth`, yielding between notes and reporting progress) and played by a `Tone.Sampler`; the guitars go through `guitarAmp()`; bass and keys are `LayeredVoice`s, and the keys' string pad is a single-saw PolySynth wrapped in `HeldNotesOnly` (sequenced notes ≥ 0.3 s only, max 32 voices). **CPU budget rule:** the audio thread overloads (output drops out or goes silent) when dense parts run many live synth voices. Tone's `PluckSynth` (an AudioWorklet per string, running even when silent) and a 64-voice FM PolySynth both did this; prefer rendered samples for anything that can sound many notes at once, and keep live PolySynths small (`MelodicVoice` caps at 48 by default). To check, play a dense MIDI file in headless Chrome and compare `AudioContext.currentTime` against wall time: below ~1.0 means the audio thread can't keep up. `SYNTH_TRIM_DB` was set by rendering a phrase per instrument with `Tone.Offline` and matching RMS, so re-measure after changing a patch rather than guessing.

**Feel** (`src/lib/feel.ts`, pure): sequenced notes get each member's timing push, jitter, dynamics, downbeat accent and chord strum (`humanize`, `strumOffsets`: down-strums low→high, off-beat eighths up-strum). `AudioTrack` knows its member and applies it in the Part callback; drums never strum, live notes are untouched. `settings.feel` (`"character"` | `"steady"`, toolbar ✨ toggle) reaches the engine through `audioEngine.setFeel` in the bridge; `"steady"` removes timing and dynamics but keeps the strum roll.

`SampleManager` loads instruments lazily and shares buffers across tracks. All five instruments have a recorded pack in `SAMPLE_PACKS` (files from the generated `samplePacks.generated.ts`; don't hand-edit it, rerun `FFMPEG=… pnpm samples:build`, which needs an ffmpeg that reads FLAC and writes MP3). Pack voices come from `createPackVoice` (same member voicing as the synths: guitar amps, bass compression, `SampledDrumKit`; the piano is `VelocityLayers` over the pack's `soft` and main recordings, **no string pad**: a sawtooth pad droned audibly under long held notes of real piano). `load()` never rejects: if a pack fails, the synth voice is prepared instead and the state is `"error"` so the mixer shows Retry. Notes stay silent until an instrument's voice exists. Instrument IDs: `lead-guitar`, `rhythm-guitar`, `bass`, `drums`, `keys`. Drum samples are keyed by GM note name (`C2` = kick 36, `D2` = snare 38); the kit has one sample per piece and `drumSampleNote()` routes every other GM drum note to the closest piece. Pack `volume`s were set the same way as `SYNTH_TRIM_DB` (offline render, matched RMS).

### MIDI import flow

`useMidiImport.openFile` → `readMidiFile` (file checks) → `parseMidi` (`@tonejs/midi` → `NoteEvent`s) → `suggestMapping` (GM program family → member: drums→ritsu, bass→mio, guitar/keys/lead → yui/azusa/tsumugi) → stored as `pendingImport` for the user to edit. `confirm` → `buildTracksFromMapping` (merges tracks assigned to the same member; unassigned members keep existing tracks) → saves the MIDI blob → `engine.stop()` → `projectStore.loadSong`. The timeline grid uses only the first time signature.

### UI language (en / zh)

All user-visible text lives in `src/i18n/strings.ts`: an `en` object whose type (`Strings`) the `zh` object must satisfy, so a missing translation is a type error (`strings.test.ts` also checks key parity). Components call `useT()`; code outside React (store callbacks, async handlers, notices) calls `getT()`. The language is `settings.language`, persisted with the other settings and defaulted by `detectLanguage()`. Member display names and roles come from `t.memberName` / `t.memberRole`, not from `MEMBERS`. Errors thrown by the MIDI file and parse layers carry a `code` plus `fileName` and are translated where they are shown (`useMidiImport`), so keep their English `message` only for logs and tests. Tests render in English (jsdom reports `en-US`).

### Responsive layout

One breakpoint, `$narrow: 760px` in `studio.scss`, mirrored by `NARROW_QUERY` in `useMediaQuery.ts` for JS (one-octave keyboard, lane labels drawn on the timeline canvas). `TOUCH_QUERY` (no hover, coarse pointer) swaps keyboard hints for tap hints and enlarges controls in CSS. On narrow screens the transport bar is `position: sticky` and `useHideOnScroll` slides it away while scrolling down (the pure rule is `scrollVisibility`).

### Live instrument panel

`liveLayoutFor(instrument)` in `src/lib/fretboard.ts` picks the on-screen instrument: `fretboard` (lead guitar, bass, with tunings in the same file), `chords` (rhythm guitar strum pads, `CHORDS`), `piano` (keys) or `drums` (kit laid out by `DrumPad.area` grid areas). All of them feed `useKeyboardInput`, which tracks every sounding note by *source* (`key:a`, `ptr:<id>`). A strum is one source with a sub-source per string (`src|0`, `src|1`, ...), started `STRUM_MS` apart; `release(src)` stops the whole group and cancels strings that haven't started yet. On the fretboard the octave control only moves the computer-keyboard notes, so it is hidden on touch screens.

### Look and the score drawing

Design tokens live in `src/styles/tokens.scss` ("club-room notebook": cream dot-grid paper, `--accent`, `--band` five-colour gradient, `--sticker-edge` button edge; dark theme is an evening club room). `studio.scss` has two mixins: `sticker-press` (buttons lift on hover and press into their edge) and `washi-tape($color)` (an `::after` tape strip on a card's top edge, so don't give those cards another `::after`). `drawTimeline` paints member-tinted lanes, candy-sticker notes and one glyph per drum voice; given `position` it glows notes under the playhead (`noteState`), dims played ones and, with `ripples`, draws note-start rings. `Timeline` therefore redraws the canvas on every playback frame from `usePlaybackPosition` (still no React state), and caches the CSS palette in a ref that is cleared when the theme changes. Keep per-frame drawing to what is on screen.

### Timeline toolbar and Instagram recording frame

`TimelineToolbar` is the first row of the `.studio__tracks` card (full width on desktop; on narrow screens CSS `order` moves it between the mixer strips and the timeline) and holds zoom, follow and the recording-frame button; nothing floats over the timeline itself. Zoom is just `settings.zoom`, and `Timeline` keeps the view centred in a layout effect when it changes.

`src/features/overlay/RecordFrame.tsx`: `useStudioStore.recordMode` (not persisted) makes `Studio` render only `RecordFrame`, a fixed full-screen view with one box of the IG shape in `settings.overlay.frame` (9:16 / 4:5 / 1:1), sized in CSS to the largest that fits above the controls (`--controls-h`). `recordLayout()` splits the box: the flat chroma-key strip is always 16:9 at full box width (room for landscape anime footage) and the `Timeline` above it gets all remaining height (`laneHeight` from what's left after the ruler, plus `labels` and `forceFollow`). Colours in `OVERLAY_COLORS` are exact key values: never theme them, and never add a border, radius, shadow or text over the key area, or keying breaks. Transport (play, restart, stop), zoom, colour and frame controls sit below the box, outside the cropped area; keep them short enough that the 9:16 box still gets the full width of a 390×844 phone. Esc leaves. `Timeline`/`drawTimeline` take an optional `laneHeight` (default `LANE_HEIGHT`); the main studio keeps 84px lanes so the mixer strips line up. The main page has no key-colour box any more; `sanitizeOverlay` drops old `enabled`/`aspect`/`size`/`split` keys. `useTransport().restart` stops (back to tick 0) and plays again.

### Tests

Tests sit next to their source files (`*.test.ts(x)`). `src/test/setup.ts` loads jest-dom and `fake-indexeddb/auto`, and stubs `matchMedia` as a wide mouse screen (every media query is false). Tone/Web Audio is not available under jsdom, so component tests mock `@/audio/AudioEngine` (see `TrackControls.test.tsx`). Keep logic that needs testing in pure modules (`src/lib`, mapper, validation, stores).
