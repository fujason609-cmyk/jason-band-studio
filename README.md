# 放課後ティータイム Band Studio

A small browser DAW for a five-piece light-music club band. Listen to each member's part, mix them, import a MIDI file and hand its tracks to the band, and play along live on your computer keyboard. It's a static site with no backend or accounts, and it runs on GitHub Pages for free.

> A fan-made project, not affiliated with the rights holders of K-ON!. The repo ships no character artwork, official recordings or scores. The instruments are free CC0 recordings of real guitars, bass, piano and drums by Karoryfer Samples and Versilian Studios (see [public/instruments/CREDITS.md](public/instruments/CREDITS.md)), and the demo song, *After School Jam*, was written for this project.

## What it does

- **Five tracks**, one per member: Yui (lead guitar), Mio (bass), Ritsu (drums), Mugi (keys) and Azusa (rhythm guitar). Each member's instrument can be changed.
- **Real instruments, voiced after each member's gear.** Recorded electric guitars, bass, grand piano and a rock drum kit (about 4 MB, loaded when first needed). Yui's guitar goes through a crunchy humbucker-style amp (Les Paul), Azusa's through a brighter, tighter one (Mustang), Mio's bass is compressed like a fingerstyle Jazz Bass, Mugi's piano uses the soft-hammer recordings for quiet playing and the hard ones for loud, and Ritsu's kit is a full rock kit with a hi-hat that chokes. If the recordings can't load, each instrument falls back to a synthesized version so the band keeps playing. Nothing is sampled from the show.
- **Each member plays with their own feel.** Ritsu pushes ahead of the beat and hits the downbeats hard, Mio is steady, Yui has big dynamics and sometimes lays back, Azusa is tight, Mugi plays gently, and guitar chords are strummed string by string (up-strokes on the off-beats). The ✨ button above the score switches everyone to strictly on the beat.
- **Mixer** with per-track volume, mute and solo, plus a master volume. Mute always wins; while any track is soloed only soloed tracks play. Toggling either cuts notes that are already ringing.
- **One clock for the band.** Every note is scheduled on a single Tone.js Transport, so the parts can't drift apart. Tempo changes keep the playhead where it is, and pause, resume, seek and loop act on all tracks at once.
- **MIDI import** from the file picker or by dropping a `.mid` file on the page. Tracks are matched to members by General MIDI family (drums, bass, guitar, keys, lead) and you can reassign or leave out any of them before loading. The tempo map, PPQ and time signatures are kept.
- **Timeline** drawn on a canvas, with staff-paper lanes, bar numbers, zoom, an optional follow mode and click or drag to seek. With keyboard focus on it, the arrow keys move one bar and Home goes to the start.
- **A live instrument that fits the part.** Lead guitar and bass get a fretboard (6 and 4 strings, frets 0–15; phones show six frets at a time with arrows to move up the neck). Rhythm guitar gets strum pads for nine open chords. Keys get a piano and drums get a kit: cymbals, toms and snare, and a kick pedal.
- **Live playing** for the selected member:
  - Melodic instruments: the `A`–`;` keys play the white notes, `W E T Y U O P` the sharps, and `Z` / `X` change octave.
  - Drums: the `A`–`L` keys play the pads.
  - Rhythm guitar: the `A`–`L` keys strum C, G, Am, F, D, Em, A, E and Dm. Letting go mutes the strings.
  - The on-screen keyboard and pads work with mouse and touch.
  - Space plays or pauses.
- **Chinese and English.** The 中 / EN button in the header switches the whole interface. A first visit picks Chinese for any `zh-*` browser language.
- **Works on phones.** Below 760px the layout stacks into one column, the transport bar stays pinned to the top (it slides away while you scroll down and comes back when you scroll up), and the play-along member picker fits all five members on one row. Touch screens get bigger controls and no computer-keyboard hints.
- **Pick who you play along as** from the member chips above the live instrument, or by clicking a name in the mixer. Arrow keys move the choice.
- **Instagram recording frame.** The phone button in the toolbar above the timeline opens a full-screen view built for recording on a phone: one box in an Instagram shape (Reels / Story 9:16, post 4:5 or square 1:1) with the score on top and a flat chroma-key strip below (green, blue, magenta or black). The strip is always 16:9 at the full frame width, the size of landscape anime footage, and the score gets all the height above it. Play, restart, stop, zoom and the frame settings sit under the box. Esc or the × button goes back.
- **Built-in video recording.** In the recording frame, pressing Play records a video of just the frame (score and key colour, repainted at 1080 × 1920 / 1350 / 1080) with just the band's sound (taken from the app's own audio output, no microphone, no other apps). Stopping, pausing or the end of the song finishes the take (with a short tail so cymbals ring out) and asks whether to save it: on a phone, Save opens the share sheet (on iPhone, "Save Video" puts it in Photos for Instagram); elsewhere it downloads the file. Browsers that can write MP4 (Safari, recent Chrome) produce MP4; others produce WebM. Then key the colour out in your video editor to put other footage, such as animation, in its place. The red camera button switches recording off; browsers without MediaRecorder get a note suggesting the phone's own screen recording instead.
- **Saved in your browser.** Settings go in `localStorage`; the session and the original MIDI file go in IndexedDB. Refreshing the page restores everything, and the audio engine is rebuilt from the saved data.

## Getting started

```bash
corepack enable          # or: npm i -g pnpm@9
pnpm install
pnpm dev                 # http://localhost:5173
```

| Script | What it does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Typecheck and production build into `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm test` | Vitest unit and component tests |
| `pnpm lint` | ESLint |
| `pnpm demo:midi` | Rewrite `public/demo/after-school-jam.mid` from the demo song |
| `pnpm samples:build` | Rebuild the recorded instrument samples (needs `FFMPEG`, see below) |

`public/demo/after-school-jam.mid` is a ready-made file for trying the import flow.

## Deploying to GitHub Pages

1. Push the repo to GitHub with `main` as the default branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` lints, tests, builds and publishes the site.

The workflow sets `BASE_PATH=/<repo-name>/` so that asset paths work under `https://<user>.github.io/<repo-name>/`. If the repo is your `<user>.github.io` root site, change `BASE_PATH` to `/` in the workflow. Locally the base is `/`.

## How it's put together

```
src/
  audio/          AudioEngine (owns all sound), AudioTrack (one lane), SampleManager,
                  TransportController (the clock), voices (synth instruments), audioConfig
  features/
    band/         members, the original demo song, MemberBadge
    mixer/        TrackMixer, TrackControls, mixer selectors
    midi/         midiParser (@tonejs/midi → note events), midiMapper (tracks → members), import UI
    timeline/     canvas drawing, Timeline, Playhead
    instruments/  live keyboard / drum pads and computer-keyboard input
  stores/         Zustand: useProjectStore (song + mix), useStudioStore (UI, transport, settings)
  services/       storage (localStorage settings, IndexedDB projects and MIDI blobs), MIDI file checks
  i18n/           en / zh UI strings, useT() / getT()
  hooks/          engine bridge, transport, playback position, media queries
  lib/            pure logic: time model, mute/solo rules, keyboard map, GM drums
```

**React handles state and UI; the engine handles sound and time.** Components never touch Tone.js directly. `useAudioEngineBridge` subscribes to the project store and calls `audioEngine.sync(project)`, which compares each value with what it already has and only changes what's different. The playhead and position readout run on `requestAnimationFrame` and write straight to the DOM, so playback never causes React re-renders.

**Time model.** Notes are stored in *song seconds*, meaning seconds at the song's own tempo map, which `@tonejs/midi` works out. The engine converts them to Transport ticks against the song's base BPM. Playing at another tempo is then just a change to `Transport.bpm`: tick positions don't move, so the sound and the playhead stay together. A tempo map inside the MIDI file is kept, because the whole song is scaled by the same ratio.

## Instrument samples

The recordings in `public/instruments/` are excerpts of CC0 libraries hosted by the [sfzinstruments](https://github.com/sfzinstruments) project, credited in [CREDITS.md](public/instruments/CREDITS.md). They are built, not hand-made:

```bash
FFMPEG=/path/to/ffmpeg pnpm samples:build   # ffmpeg must be able to read FLAC and write MP3
```

`scripts/build-sample-packs.ts` downloads the exact source files (pinned to a commit, cached in `.sample-cache/`), mixes the close and overhead mics for drums, trims each note, encodes mono 96 kbps MP3s and writes `src/audio/samplePacks.generated.ts`. Change which notes or layers are used there, then rebuild. If you swap in other recordings, they must be licensed for redistribution; record the licence in `SAMPLE_PACKS` (`src/audio/audioConfig.ts`) and in CREDITS.md, and re-measure the pack volumes.

Packs load lazily and are shared by every track that uses them. Each mixer strip shows the load progress. If a pack fails to load, that instrument plays its synthesized voice and the strip shows a Retry button.

## Testing

`pnpm test` runs 93 tests covering:
- mute and solo rules
- tick and second conversions, and tempo scaling
- the keyboard map
- MIDI parsing and errors, track auto-mapping and merging
- project validation and repair
- settings and IndexedDB round trips
- the project store and the demo song's integrity
- mixer UI behaviour
- the play-along member picker, and English / Chinese string parity
- fretboard tuning, chord voicings, each member's live layout, strumming, and the scroll-to-hide rule
- the Instagram recording frame, the timeline toolbar and their stored settings

Behaviour checked by hand in Chromium:
- playback and stop at the end of the song
- tempo change while playing (no jump, half speed at half tempo)
- pause and resume (no drift)
- the end of the song stopping playback even when the tab is in the background

## Known limits

- The synth voices are expressive enough to practise with, but they don't model guitar bends, slides or strumming.
- Imported songs use one time signature on the timeline grid (the first one in the file). Note timing is still exact.
- Sessions live only in this browser. Clearing site data, switching devices or moving the site to another domain loses them. Project import and export is on the roadmap (V1.1).
- There's no WAV export, MusicXML or notation editing yet (V1.2–V2.0).
- Audio needs one click or key press before it can start, which is a browser rule.
