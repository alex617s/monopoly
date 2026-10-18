// Music and sound effects, made live with the Web Audio API (no sound files).
// Browsers only allow sound after the first tap, so unlockAudio() runs then.

export type Sfx =
  | 'tap'
  | 'spin'
  | 'step'
  | 'fork'
  | 'coin'
  | 'pay'
  | 'start'
  | 'buy'
  | 'build'
  | 'bank'
  | 'card'
  | 'shop'
  | 'news'
  | 'chance'
  | 'hospital'
  | 'jail'
  | 'banana'
  | 'rocket'
  | 'goodGod'
  | 'badGod'
  | 'lastRound'
  | 'win';
export type Track = 'main' | 'last';

export interface AudioSettings {
  music: boolean;
  sound: boolean;
  musicVolume: number;
  soundVolume: number;
}

const KEY = 'aa2-audio';
let settings: AudioSettings = { music: true, sound: true, musicVolume: 0.6, soundVolume: 0.8 };
try {
  const raw = localStorage.getItem(KEY);
  if (raw) settings = { ...settings, ...JSON.parse(raw) };
} catch {
  /* storage unavailable */
}
const listeners = new Set<() => void>();

export const audioSettings = () => settings;
export function subscribeAudio(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function setAudioSettings(patch: Partial<AudioSettings>) {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  applyVolumes();
  refreshMusic();
  listeners.forEach((l) => l());
}

let ctx: AudioContext | null = null;
let musicBus: GainNode;
let duckNode: GainNode;
let sfxBus: GainNode;
let noiseBuf: AudioBuffer;
let ducked = false;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor();
  comp.connect(master);
  musicBus = ctx.createGain();
  duckNode = ctx.createGain();
  sfxBus = ctx.createGain();
  musicBus.connect(duckNode);
  duckNode.connect(comp);
  sfxBus.connect(comp);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  applyVolumes();
  return ctx;
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.setTargetAtTime(settings.music ? settings.musicVolume * 0.7 : 0, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.sound ? settings.soundVolume : 0, t, 0.05);
  duckNode.gain.setTargetAtTime(ducked ? 0.15 : 1, t, 0.3);
}

let unlocked = false;
/** Call from a tap: starts the audio engine and any music that is waiting. */
export function unlockAudio() {
  const c = audio();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => undefined);
  if (!unlocked) {
    unlocked = true;
    refreshMusic();
  }
}

/** Music gets quiet while this device is in the voice chat. */
export function setDuck(on: boolean) {
  ducked = on;
  applyVolumes();
}

// ------------------------------------------------------------------ building blocks

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

interface ToneOpts {
  f: number;
  t?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  to?: number | null;
  attack?: number;
  out?: AudioNode;
  lp?: number | null;
  q?: number;
}
function tone({ f, t, dur = 0.2, type = 'sine', vol = 0.3, to = null, attack = 0.005, out, lp = null, q = 1 }: ToneOpts) {
  const c = ctx!;
  const at = t ?? c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let node: AudioNode = o;
  if (lp) {
    const fl = c.createBiquadFilter();
    fl.type = 'lowpass';
    fl.frequency.value = lp;
    fl.Q.value = q;
    o.connect(fl);
    node = fl;
  }
  node.connect(g);
  g.connect(out ?? sfxBus);
  o.start(at);
  o.stop(at + dur + 0.05);
}

interface NoiseOpts {
  t?: number;
  dur?: number;
  vol?: number;
  type?: BiquadFilterType;
  f?: number;
  q?: number;
  to?: number | null;
  out?: AudioNode;
}
function noise({ t, dur = 0.1, vol = 0.3, type = 'bandpass', f = 2000, q = 1, to = null, out }: NoiseOpts) {
  const c = ctx!;
  const at = t ?? c.currentTime;
  const s = c.createBufferSource();
  const fl = c.createBiquadFilter();
  const g = c.createGain();
  s.buffer = noiseBuf;
  fl.type = type;
  fl.frequency.setValueAtTime(f, at);
  fl.Q.value = q;
  if (to) fl.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(fl);
  fl.connect(g);
  g.connect(out ?? sfxBus);
  s.start(at, Math.random() * 0.5);
  s.stop(at + dur + 0.02);
}
const notes = (list: number[], start: number, step: number, opts: Omit<ToneOpts, 'f' | 't'>) => list.forEach((m, i) => m && tone({ f: mtof(m), t: start + i * step, ...opts }));

function coinAt(t: number) {
  tone({ f: mtof(83), t, dur: 0.08, type: 'square', vol: 0.1, lp: 5000 });
  tone({ f: mtof(88), t: t + 0.08, dur: 0.4, type: 'square', vol: 0.1, lp: 5000 });
}

const SFX: Record<Sfx, (t: number) => void> = {
  tap: (t) => tone({ f: 880, to: 1200, dur: 0.06, type: 'triangle', vol: 0.15, t }),
  spin: (t0) => {
    let t = t0;
    let gap = 0.035;
    while (t - t0 < 2.0) {
      tone({ f: 1500, dur: 0.025, type: 'square', vol: 0.05, t, lp: 3000 });
      t += gap;
      gap *= 1.075;
    }
    notes([84, 88], t + 0.05, 0.09, { dur: 0.6, type: 'sine', vol: 0.22 });
  },
  step: (t) => tone({ f: 440, to: 860, dur: 0.09, type: 'sine', vol: 0.16, t }),
  fork: (t) => {
    notes([67, 71, 74], t, 0.08, { dur: 0.25, type: 'triangle', vol: 0.18 });
    tone({ f: mtof(79), t: t + 0.26, dur: 0.5, type: 'sine', vol: 0.13 });
  },
  coin: (t) => coinAt(t),
  pay: (t) => {
    noise({ t, dur: 0.35, vol: 0.22, f: 3000, to: 400, q: 3 });
    notes([76, 72, 67], t + 0.05, 0.12, { dur: 0.2, type: 'triangle', vol: 0.16 });
  },
  start: (t) => {
    const mel: [number, number, number][] = [
      [72, 0, 0.12],
      [76, 0.12, 0.12],
      [79, 0.24, 0.12],
      [84, 0.36, 0.5],
    ];
    mel.forEach(([m, d, l]) => {
      tone({ f: mtof(m), t: t + d, dur: l + 0.1, type: 'sawtooth', vol: 0.11, lp: 2600, attack: 0.02 });
      tone({ f: mtof(m - 12), t: t + d, dur: l + 0.1, type: 'square', vol: 0.045, lp: 1500 });
    });
    coinAt(t + 0.5);
  },
  buy: (t) => {
    tone({ f: 160, to: 60, dur: 0.18, type: 'sine', vol: 0.45, t });
    noise({ t, dur: 0.08, vol: 0.28, f: 1200, type: 'lowpass' });
    notes([79, 84], t + 0.2, 0.1, { dur: 0.35, type: 'triangle', vol: 0.16 });
  },
  build: (t) => {
    for (let i = 0; i < 3; i++) {
      noise({ t: t + i * 0.18, dur: 0.06, vol: 0.36, f: 2500, q: 4 });
      tone({ f: 300, to: 180, dur: 0.08, type: 'sine', vol: 0.28, t: t + i * 0.18 });
    }
    notes([72, 76, 79, 84], t + 0.6, 0.07, { dur: 0.3, type: 'triangle', vol: 0.15 });
  },
  bank: (t) => {
    noise({ t, dur: 0.05, vol: 0.18, f: 3000 });
    tone({ f: 1046, t: t + 0.05, dur: 0.7, type: 'sine', vol: 0.2 });
    tone({ f: 2093, t: t + 0.05, dur: 0.5, type: 'sine', vol: 0.06 });
  },
  card: (t) => {
    noise({ t, dur: 0.12, vol: 0.22, f: 5000, to: 2000, type: 'highpass' });
    notes([79, 83, 86, 91], t + 0.08, 0.05, { dur: 0.35, type: 'sine', vol: 0.14 });
  },
  shop: (t) =>
    [0, 0.18].forEach((d) => {
      tone({ f: 1568, t: t + d, dur: 0.8, type: 'sine', vol: 0.18 });
      tone({ f: 3168, t: t + d, dur: 0.5, type: 'sine', vol: 0.045 });
    }),
  news: (t) => {
    notes([67, 72, 76, 79], t, 0.11, { dur: 0.16, type: 'square', vol: 0.09, lp: 3000 });
    [72, 76, 79, 84].forEach((m) => tone({ f: mtof(m), t: t + 0.48, dur: 0.9, type: 'sawtooth', vol: 0.055, lp: 2400, attack: 0.03 }));
    tone({ f: 55, to: 50, dur: 0.6, type: 'sine', vol: 0.35, t: t + 0.48 });
  },
  chance: (t) => {
    notes([72, 79, 76, 84, 81, 88], t, 0.07, { dur: 0.2, type: 'triangle', vol: 0.14 });
    notes([91], t + 0.45, 0.1, { dur: 0.6, type: 'sine', vol: 0.14 });
  },
  hospital: (t) => {
    for (let i = 0; i < 4; i++) tone({ f: i % 2 ? 660 : 880, t: t + i * 0.3, dur: 0.3, type: 'triangle', vol: 0.15, attack: 0.02 });
  },
  jail: (t) => {
    noise({ t, dur: 0.25, vol: 0.4, f: 900, q: 6 });
    tone({ f: 110, to: 90, dur: 0.4, type: 'square', vol: 0.13, t, lp: 800 });
    notes([62, 61, 60], t + 0.35, 0.25, { dur: 0.3, type: 'sawtooth', vol: 0.11, lp: 1200 });
    tone({ f: mtof(59), t: t + 1.1, dur: 0.8, type: 'sawtooth', vol: 0.11, lp: 900 });
  },
  banana: (t) => {
    tone({ f: 300, to: 1200, dur: 0.18, type: 'sine', vol: 0.22, t });
    tone({ f: 1200, to: 120, dur: 0.5, type: 'triangle', vol: 0.18, t: t + 0.2 });
    noise({ t: t + 0.68, dur: 0.15, vol: 0.35, f: 400, type: 'lowpass' });
  },
  rocket: (t) => {
    noise({ t, dur: 0.8, vol: 0.22, f: 800, to: 6000, q: 2 });
    noise({ t: t + 0.8, dur: 0.6, vol: 0.55, f: 600, type: 'lowpass' });
    for (let i = 0; i < 6; i++) noise({ t: t + 0.9 + Math.random() * 0.6, dur: 0.06, vol: 0.18, f: 4000 + Math.random() * 3000 });
  },
  goodGod: (t) => {
    [60, 64, 67, 71, 72, 76, 79, 83, 84, 88].forEach((m, i) => tone({ f: mtof(m), t: t + i * 0.045, dur: 0.9, type: 'sine', vol: 0.09 }));
    [72, 76, 79].forEach((m) => tone({ f: mtof(m), t: t + 0.5, dur: 1.2, type: 'triangle', vol: 0.06, attack: 0.15 }));
  },
  badGod: (t) => {
    const slides: [number, number][] = [
      [67, 66],
      [66, 65],
      [65, 64],
      [64, 58],
    ];
    slides.forEach(([a, b], i) => tone({ f: mtof(a), to: mtof(b), t: t + i * 0.35, dur: i === 3 ? 0.9 : 0.3, type: 'sawtooth', vol: 0.11, lp: 900, q: 6, attack: 0.03 }));
  },
  lastRound: (t) => {
    for (let i = 0; i < 24; i++) noise({ t: t + i * 0.045, dur: 0.05, vol: 0.11 + i * 0.007, f: 1800, q: 1 });
    [57, 64, 69, 72].forEach((m) => tone({ f: mtof(m), t: t + 1.1, dur: 1.4, type: 'sawtooth', vol: 0.065, lp: 2200, attack: 0.02 }));
    tone({ f: 55, dur: 1.2, type: 'sine', vol: 0.45, t: t + 1.1, to: 45 });
  },
  win: (t) => {
    const mel: [number, number, number][] = [
      [67, 0, 0.15],
      [67, 0.15, 0.15],
      [67, 0.3, 0.15],
      [72, 0.45, 0.6],
      [76, 1.05, 0.2],
      [74, 1.25, 0.2],
      [76, 1.45, 0.2],
      [79, 1.65, 1.0],
    ];
    mel.forEach(([m, d, l]) => {
      tone({ f: mtof(m), t: t + d, dur: l + 0.15, type: 'sawtooth', vol: 0.1, lp: 2800, attack: 0.02 });
      tone({ f: mtof(m + 12), t: t + d, dur: l, type: 'sine', vol: 0.045 });
    });
    [48, 55, 60, 64].forEach((m) => tone({ f: mtof(m), t: t + 1.65, dur: 1.4, type: 'triangle', vol: 0.075, attack: 0.05 }));
    for (let i = 0; i < 10; i++) noise({ t: t + 1.7 + i * 0.12, dur: 0.08, vol: 0.11, f: 6000, type: 'highpass' });
  },
};

const lastPlayed: Partial<Record<Sfx, number>> = {};
export function sfx(name: Sfx) {
  if (!settings.sound || !ctx || ctx.state !== 'running') return;
  // the same sound twice at once just sounds louder, so skip it
  const now = ctx.currentTime;
  if ((lastPlayed[name] ?? -1) > now - 0.05) return;
  lastPlayed[name] = now;
  SFX[name](now);
}

// ------------------------------------------------------------------ music

const _ = 0;
const kick = (t: number) => tone({ f: 150, to: 45, dur: 0.18, type: 'sine', vol: 0.5, t, out: musicBus });
const snare = (t: number, v = 0.2) => {
  noise({ t, dur: 0.12, vol: v, f: 1800, q: 0.7, out: musicBus });
  tone({ f: 220, to: 160, dur: 0.07, type: 'triangle', vol: 0.11, t, out: musicBus });
};
const hat = (t: number, v = 0.06) => noise({ t, dur: 0.035, vol: v, f: 8000, type: 'highpass', out: musicBus });
const pluck = (m: number, t: number, dur: number) => {
  tone({ f: mtof(m), t, dur, type: 'square', vol: 0.085, lp: 2200, out: musicBus });
  tone({ f: mtof(m) * 2, t, dur: dur * 0.6, type: 'sine', vol: 0.025, out: musicBus });
};
const bass = (m: number, t: number, dur: number, vol = 0.2) => tone({ f: mtof(m), t, dur, type: 'triangle', vol, out: musicBus });

interface Song {
  bpm: number;
  length: number;
  step: (i: number, t: number, len: number) => void;
}

const MAIN_MEL = [72,_,76,79, 76,_,72,74, 76,_,72,69, 72,_,_,_, 77,_,76,74, 72,_,74,76, 79,_,77,76, 74,_,_,_,
  72,_,76,79, 84,_,79,76, 77,_,76,74, 72,_,69,72, 74,_,76,77, 79,_,77,74, 72,_,_,_, _,_,_,_]; // prettier-ignore
const MAIN_CHORDS = [48, 45, 41, 43, 48, 45, 41, 43];
const LAST_MEL = [69,72,76,72, 69,72,76,77, 76,74,72,71, 69,_,_,_, 65,69,72,69, 65,69,72,74, 74,72,71,72, 71,_,68,_]; // prettier-ignore
const LAST_CHORDS = [45, 41, 43, 40];

const SONGS: Record<Track, Song> = {
  // "Bush Bounce": a bouncy cartoon tune in C major
  main: {
    bpm: 126,
    length: 64,
    step(i, t, len) {
      const bar = Math.floor(i / 8);
      const s = i % 8;
      const root = MAIN_CHORDS[bar % 8];
      if (s === 0 || s === 4) kick(t);
      if (s === 2 || s === 6) snare(t);
      hat(t, s % 2 ? 0.035 : 0.06);
      if (s % 2 === 0) bass(s === 4 ? root + 7 : root, t, len * 1.6);
      if (s % 2 === 1) [0, root === 45 ? 3 : 4, 7].forEach((k) => tone({ f: mtof(root + 24 + k), t, dur: len * 0.7, type: 'triangle', vol: 0.022, out: musicBus }));
      const m = MAIN_MEL[i % MAIN_MEL.length];
      if (m) pluck(m, t, len * 1.8);
    },
  },
  // the last round: faster and a little tense, in A minor
  last: {
    bpm: 150,
    length: 32,
    step(i, t, len) {
      const bar = Math.floor(i / 8);
      const s = i % 8;
      const root = LAST_CHORDS[bar % 4];
      if (s === 0 || s === 4) kick(t);
      if (s === 2 || s === 6) snare(t, 0.24);
      hat(t, 0.055);
      hat(t + len / 2, 0.03);
      bass(s % 2 ? root + 12 : root, t, len * 0.8, 0.18);
      const m = LAST_MEL[i % LAST_MEL.length];
      if (m) tone({ f: mtof(m), t, dur: len * 0.7, type: 'sawtooth', vol: 0.065, lp: 2000, out: musicBus });
      if (s === 0) [0, root === 45 ? 3 : 4, 7].forEach((k) => tone({ f: mtof(root + 12 + k), t, dur: len * 7, type: 'sawtooth', vol: 0.022, lp: 1200, out: musicBus }));
    },
  },
};

let wanted: Track | null = null;
let playing: Track | null = null;
let timer: number | undefined;
let nextTime = 0;
let stepIdx = 0;

/** Which music should play now (null for silence). */
export function setMusic(track: Track | null) {
  wanted = track;
  refreshMusic();
}

function refreshMusic() {
  const target = settings.music && unlocked ? wanted : null;
  if (target === playing) return;
  window.clearInterval(timer);
  timer = undefined;
  playing = target;
  if (!target || !audio()) return;
  const song = SONGS[target];
  const len = 60 / song.bpm / 2;
  stepIdx = 0;
  nextTime = ctx!.currentTime + 0.1;
  timer = window.setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.15) {
      song.step(stepIdx, nextTime, len);
      nextTime += len;
      stepIdx = (stepIdx + 1) % song.length;
    }
  }, 25);
}
