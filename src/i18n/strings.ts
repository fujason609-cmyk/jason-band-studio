import type { MemberId } from "@/features/band/types";
import type { InstrumentId } from "@/types/audio";

export type Language = "en" | "zh";

/** Language shown on a first visit: Chinese for any zh-* browser, English otherwise. */
export function detectLanguage(): Language {
  const lang = typeof navigator !== "undefined" ? navigator.language : "";
  return /^zh\b/i.test(lang) ? "zh" : "en";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const en = {
  htmlLang: "en",
  appSubtitle: "After School Tea Time Band Studio",
  clubBadge: "Light Music Club",
  footer:
    "A fan-made practice tool, not affiliated with the rights holders of K-ON!. The instruments are free CC0 recordings by Karoryfer Samples and Versilian Studios (nothing from the show), and the demo song was written for this project. Your session is saved in this browser only.",
  dropHint: "Drop a MIDI file to load it",
  dismiss: "Dismiss message",

  // header
  loadDemo: "Load the demo song",
  confirmReplaceWithDemo: (name: string) =>
    `Replace ${name} with the demo song? Your mixer settings for it will be lost.`,
  theme: {
    system: "Theme follows your system. Switch to light",
    light: "Light theme. Switch to dark",
    dark: "Dark theme. Switch to system",
  },
  /** short label on the language button: the language you'd switch to */
  otherLanguageShort: "中",
  switchLanguage: "切换到中文 (Switch to Chinese)",

  // transport
  transport: "Transport",
  barBeat: (bar: number, beat: number) => `Bar ${bar}, beat ${beat}`,
  tempo: "Tempo",
  slower: "Slower",
  faster: "Faster",
  backToTempo: (bpm: number) => `Back to ${bpm}`,
  play: "Play",
  pause: "Pause",
  stop: "Stop and go back to the start",
  restart: "Play again from the start",
  loop: "Loop the song",
  loadingSounds: "Loading sounds",
  masterVolume: "Master volume",
  audioGate: "Sound is off until you start it. Your browser needs one click first.",
  startAudio: "Start audio",

  // mixer
  bandMixer: "Band mixer",
  theBand: "The band",
  clearSolo: "Clear solo",
  mute: (name: string) => `Mute ${name}`,
  solo: (name: string) => `Solo ${name}`,
  instrumentOf: (name: string) => `${name}'s instrument`,
  volumeOf: (name: string) => `${name} volume`,
  playLiveAs: (name: string) => `Play ${name}'s instrument live`,
  noPart: "No part in this song",
  retry: "Retry",

  // live instrument
  liveInstrument: "Live instrument",
  playAlongAs: (name: string) => `Play along as ${name}`,
  chooseMember: "Who do you play along as?",
  drumsHelp: "Press A to L on your keyboard, or tap the pads.",
  keysHelp: "Keys A to ; play the white notes, W E T Y U O P the sharps. Z and X change octave.",
  touchHelp: "Tap the keys to play.",
  touchDrumsHelp: "Tap the pads to play.",
  fretHelp: "Tap a fret or slide along a string. Keys A to ; play too, Z and X change octave.",
  touchFretHelp: "Tap a fret or slide along a string.",
  chordsHelp: "Press A to L or tap a chord to strum it. Let go to mute the strings.",
  touchChordsHelp: "Tap a chord to strum it. Let go to mute the strings.",
  lowerFrets: "Move toward the nut",
  higherFrets: "Move up the neck",
  fretRange: (from: number, to: number) => `Frets ${from}–${to}`,
  fretNote: (note: string, string: number, fret: number) =>
    fret === 0 ? `${note}, string ${string} open` : `${note}, string ${string}, fret ${fret}`,
  strumChord: (chord: string) => `Strum ${chord}`,
  octaveGroup: "Octave",
  octaveDown: "Octave down",
  octaveUp: "Octave up",
  octave: (n: number) => `Octave ${n}`,
  keysPatch: "Sound",
  keysPatchHint: "Mugi's KORG Triton sound. Used for the keys part when the song plays and when you play live.",
  keysPatches: { piano: "Piano", strings: "Strings", synth: "Synth lead", organ: "Organ" } as Record<string, string>,

  // timeline
  timeline: "Timeline",
  timelineSlider: "Song position. Arrow keys move one bar, Home goes to the start.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  followPlayhead: "Follow the playhead",
  feelOn: "Members play with their own feel. Switch to strictly on the beat",
  feelOff: "Everyone plays strictly on the beat. Switch to each member's own feel",

  // Instagram recording frame
  recordMode: "Instagram recording frame",
  overlayColor: "Key colour",
  overlayColors: { green: "Green", blue: "Blue", magenta: "Magenta", black: "Black" } as Record<string, string>,
  recordFrame: "Frame",
  recordFrames: { "9:16": "Reels 9:16", "4:5": "Post 4:5", "1:1": "Square 1:1" } as Record<string, string>,
  recordHint: "Record your screen, crop to the frame, then key out the colour to put other footage there. Everything below the frame is outside the shot.",
  exitRecord: "Leave the recording frame",
  recordVideoOn: "Video recording on: Play records this frame and the band's sound. Switch off",
  recordVideoOff: "Video recording off. Switch on to record a video when you press Play",
  recordingNow: "Recording. Stop or pause to finish",
  recordingUnsupported: "This browser can't record video. Use your phone's screen recording and crop to the frame instead.",
  savePrompt: "Save the video to your phone?",
  saveDetails: (seconds: number, frame: string, ext: string) => `${seconds} s · ${frame} · ${ext.toUpperCase()}`,
  webmNote: "This browser records WebM. Instagram may need it converted to MP4 first.",
  saveVideo: "Save",
  discardVideo: "Don't save",

  // MIDI import
  importMidi: "Import MIDI",
  whoPlaysWhat: "Who plays what?",
  mappingIntro: (file: string, tracks: number) =>
    `${file} has ${plural(tracks, "track")}. Give each one to a member, or leave it out. Several tracks can go to the same member.`,
  trackInfo: (instrument: string, notes: number) => `${instrument}, ${plural(notes, "note")}`,
  drumKit: "drum kit",
  leaveOut: "Leave out",
  memberOption: (name: string, role: string) => `${name} (${role.toLowerCase()})`,
  nothingAssigned: "Give at least one track to a member to load the song.",
  cancel: "Cancel",
  loadSong: "Load song",
  loaded: (file: string) => `Loaded ${file}.`,
  loadedLeftOut: (file: string, left: number) => `Loaded ${file}. ${plural(left, "track")} left out.`,
  couldNotOpen: "That file couldn't be opened.",
  midiError: {
    "not-midi": (f: string) => `${f} isn't a MIDI file. Choose a file ending in .mid or .midi.`,
    empty: (f: string) => `${f} is empty.`,
    "too-large": (f: string) => `${f} is larger than 5 MB. Choose a smaller MIDI file.`,
    unreadable: (f: string) =>
      `${f} isn't a readable MIDI file. Export it again as a Standard MIDI File (.mid) and try once more.`,
    "no-notes": (f: string) => `${f} has no notes to play. Pick a MIDI file that contains note data.`,
  },

  // storage and audio problems
  sessionCorrupt: "Your saved session couldn't be read, so the demo song is loaded instead.",
  storageBlocked: "This browser blocks local storage, so changes will be lost on refresh.",
  saveFailed: "Couldn't save the session in this browser. Free up storage and keep the tab open.",
  audioBlocked: (detail: string) =>
    `The browser didn't allow audio to start (${detail}). Click Start audio to try again.`,
  samplesFailed: (instrument: string) =>
    `Couldn't load the recorded ${instrument} sound, so it's playing the synthesized one. Use Retry on the mixer to try again.`,

  // band
  memberName: { yui: "Yui", mio: "Mio", ritsu: "Ritsu", tsumugi: "Mugi", azusa: "Azusa" } as Record<MemberId, string>,
  memberRole: {
    yui: "Lead guitar, vocals",
    mio: "Bass",
    ritsu: "Drums",
    tsumugi: "Keyboard",
    azusa: "Rhythm guitar",
  } as Record<MemberId, string>,
  instrument: {
    "lead-guitar": "Lead guitar",
    "rhythm-guitar": "Rhythm guitar",
    bass: "Bass",
    drums: "Drum kit",
    keys: "Keys",
  } as Record<InstrumentId, string>,
  /** keyed by the pad's computer key */
  drumPad: {
    a: "Kick",
    s: "Snare",
    d: "Closed hat",
    f: "Open hat",
    g: "Low tom",
    h: "Mid tom",
    j: "High tom",
    k: "Crash",
    l: "Ride",
  } as Record<string, string>,
};

export type Strings = typeof en;

const zh: Strings = {
  htmlLang: "zh-CN",
  appSubtitle: "放学后茶会 · 乐队工作室",
  clubBadge: "轻音部",
  footer:
    "粉丝自制的练习工具，与《轻音少女》版权方无关。乐器声音来自 Karoryfer Samples 与 Versilian Studios 的免费 CC0 录音（不含任何动画原声），演示曲是为本项目原创的。你的进度只保存在这个浏览器里。",
  dropHint: "松开即可载入 MIDI 文件",
  dismiss: "关闭提示",

  loadDemo: "载入演示曲",
  confirmReplaceWithDemo: (name) => `要用演示曲替换《${name}》吗？它的调音台设置会丢失。`,
  theme: {
    system: "主题跟随系统，点击切换为浅色",
    light: "浅色主题，点击切换为深色",
    dark: "深色主题，点击改为跟随系统",
  },
  otherLanguageShort: "EN",
  switchLanguage: "Switch to English (切换到英文)",

  transport: "播放控制",
  barBeat: (bar, beat) => `第 ${bar} 小节 第 ${beat} 拍`,
  tempo: "速度",
  slower: "减慢",
  faster: "加快",
  backToTempo: (bpm) => `恢复 ${bpm}`,
  play: "播放",
  pause: "暂停",
  stop: "停止并回到开头",
  restart: "从头重新播放",
  loop: "循环播放",
  loadingSounds: "正在载入音色",
  masterVolume: "总音量",
  audioGate: "声音尚未开启。浏览器要求先点击一次才能播放。",
  startAudio: "开启声音",

  bandMixer: "乐队调音台",
  theBand: "乐队成员",
  clearSolo: "取消独奏",
  mute: (name) => `静音 ${name}`,
  solo: (name) => `独奏 ${name}`,
  instrumentOf: (name) => `${name}的乐器`,
  volumeOf: (name) => `${name}的音量`,
  playLiveAs: (name) => `现场演奏${name}的乐器`,
  noPart: "这首歌里没有这个声部",
  retry: "重试",

  liveInstrument: "现场演奏",
  playAlongAs: (name) => `和乐队合奏：${name}`,
  chooseMember: "你要和谁换位一起弹？",
  drumsHelp: "用键盘 A 到 L 打鼓，或直接点击鼓垫。",
  keysHelp: "A 到 ; 是白键，W E T Y U O P 是黑键，Z 和 X 切换八度。",
  touchHelp: "点击琴键即可演奏。",
  touchDrumsHelp: "点击鼓垫即可演奏。",
  fretHelp: "点击品格或沿着琴弦滑动来演奏。键盘 A 到 ; 也能弹，Z 和 X 切换八度。",
  touchFretHelp: "点击品格或沿着琴弦滑动来演奏。",
  chordsHelp: "按 A 到 L 或点击和弦来扫弦，松开即止音。",
  touchChordsHelp: "点击和弦来扫弦，松开即止音。",
  lowerFrets: "移向琴头",
  higherFrets: "移向高把位",
  fretRange: (from, to) => `第 ${from}–${to} 品`,
  fretNote: (note, string, fret) => (fret === 0 ? `${note}，第 ${string} 弦空弦` : `${note}，第 ${string} 弦第 ${fret} 品`),
  strumChord: (chord) => `扫 ${chord} 和弦`,
  octaveGroup: "八度",
  octaveDown: "降低八度",
  octaveUp: "升高八度",
  octave: (n) => `第 ${n} 八度`,
  keysPatch: "音色",
  keysPatchHint: "紬的 KORG Triton 音色。歌曲播放时的键盘声部和你现场弹奏都会用这个音色。",
  keysPatches: { piano: "钢琴", strings: "弦乐", synth: "合成主音", organ: "风琴" },

  timeline: "时间轴",
  timelineSlider: "播放位置。方向键前后移动一小节，Home 键回到开头。",
  zoomIn: "放大",
  zoomOut: "缩小",
  followPlayhead: "跟随播放位置",
  feelOn: "演奏个性：开（每个人有自己的节奏感和力度）。点击改为完全按拍子",
  feelOff: "演奏个性：关（完全按拍子）。点击让每个人用自己的方式演奏",

  recordMode: "IG 录制画框",
  overlayColor: "抠像颜色",
  overlayColors: { green: "绿幕", blue: "蓝幕", magenta: "品红", black: "黑色" },
  recordFrame: "画框",
  recordFrames: { "9:16": "Reels 9:16", "4:5": "贴文 4:5", "1:1": "方形 1:1" },
  recordHint: "录屏后裁成画框的大小，再对绿幕抠像贴上其他画面。画框下面的按钮都在画面外。",
  exitRecord: "退出录制画框",
  recordVideoOn: "视频录制：开（按播放就录下画框画面和乐队声音）。点击关闭",
  recordVideoOff: "视频录制：关。点击开启后，按播放就会录制视频",
  recordingNow: "正在录制，按停止或暂停结束",
  recordingUnsupported: "这个浏览器不支持录制视频。请改用手机自带的录屏，再裁成画框大小。",
  savePrompt: "要把视频保存到手机吗？",
  saveDetails: (seconds, frame, ext) => `${seconds} 秒 · ${frame} · ${ext.toUpperCase()}`,
  webmNote: "这个浏览器录出来的是 WebM 格式，上传 IG 前可能需要先转成 MP4。",
  saveVideo: "保存",
  discardVideo: "不要",

  importMidi: "导入 MIDI",
  whoPlaysWhat: "谁来演奏哪一轨？",
  mappingIntro: (file, tracks) =>
    `${file} 共有 ${tracks} 条音轨。把每条音轨分配给一位成员，或者不使用。多条音轨可以分给同一位成员。`,
  trackInfo: (instrument, notes) => `${instrument}，${notes} 个音符`,
  drumKit: "架子鼓",
  leaveOut: "不使用",
  memberOption: (name, role) => `${name}（${role}）`,
  nothingAssigned: "至少把一条音轨分配给成员，才能载入这首歌。",
  cancel: "取消",
  loadSong: "载入歌曲",
  loaded: (file) => `已载入 ${file}。`,
  loadedLeftOut: (file, left) => `已载入 ${file}，有 ${left} 条音轨未使用。`,
  couldNotOpen: "无法打开这个文件。",
  midiError: {
    "not-midi": (f) => `${f} 不是 MIDI 文件。请选择以 .mid 或 .midi 结尾的文件。`,
    empty: (f) => `${f} 是空文件。`,
    "too-large": (f) => `${f} 超过 5 MB，请选择更小的 MIDI 文件。`,
    unreadable: (f) => `无法读取 ${f}。请重新导出为标准 MIDI 文件（.mid）后再试。`,
    "no-notes": (f) => `${f} 里没有可播放的音符。请选择包含音符数据的 MIDI 文件。`,
  },

  sessionCorrupt: "无法读取已保存的进度，已改为载入演示曲。",
  storageBlocked: "这个浏览器禁止了本地存储，刷新后改动会丢失。",
  saveFailed: "无法在这个浏览器里保存进度。请清理存储空间，并保持页面打开。",
  audioBlocked: (detail) => `浏览器不允许开启声音（${detail}）。请点击「开启声音」再试一次。`,
  samplesFailed: (instrument) => `无法载入${instrument}的真实采样，暂时改用合成音色。请在调音台上点击「重试」。`,

  memberName: { yui: "唯", mio: "澪", ritsu: "律", tsumugi: "紬", azusa: "梓" },
  memberRole: {
    yui: "主音吉他、主唱",
    mio: "贝斯",
    ritsu: "鼓",
    tsumugi: "键盘",
    azusa: "节奏吉他",
  },
  instrument: {
    "lead-guitar": "主音吉他",
    "rhythm-guitar": "节奏吉他",
    bass: "贝斯",
    drums: "架子鼓",
    keys: "键盘",
  },
  drumPad: {
    a: "底鼓",
    s: "军鼓",
    d: "闭镲",
    f: "开镲",
    g: "低音嗵鼓",
    h: "中音嗵鼓",
    j: "高音嗵鼓",
    k: "强音镲",
    l: "叮叮镲",
  },
};

export const STRINGS: Record<Language, Strings> = { en, zh };
