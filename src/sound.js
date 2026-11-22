// Sound effects, synthesized with ZzFX (src/vendor/ZzFX.js). Each sound is a
// ZzFX parameter list; paste one into https://killedbyapixel.github.io/ZzFX/
// to hear and tweak it. Order: volume, randomness, frequency, attack, sustain,
// release, shape, shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime,
// repeatTime, noise, modulation, bitCrush, delay, sustainVolume, decay,
// tremolo, filter.
//
// Browsers only allow audio after a user gesture, so ZzFX (which opens its
// AudioContext on import) loads on the first click or key press.

export const SOUNDS = {
  tick: [0.3, 0.5, 1800, 0, 0, 0.01, 1],
  land: [0.6, 0.1, 160, 0, 0.01, 0.09, 1, 1, -3],
  hit: [0.7, 0.05, 260, 0, 0.02, 0.12, 2, 1.5, -8, 0, 0, 0, 0, 0.8],
  crit: [0.9, 0.05, 420, 0, 0.04, 0.22, 2, 1.2, -6, 0, 0, 0, 0, 1.2, 0, 0, 0.06],
  miss: [0.35, 0.1, 600, 0.03, 0.02, 0.1, 4, 1, -15],
  block: [0.5, 0.05, 1100, 0, 0.01, 0.12, 0, 1, 0, 0, 0, 0, 0, 0, 90],
  ward: [0.5, 0, 700, 0.01, 0.05, 0.2, 0, 1, 0, 0, 350, 0.05, 0, 0, 0, 0, 0.05],
  hurt: [0.5, 0.05, 140, 0, 0.06, 0.18, 5, 0.5, -6, 0, 0, 0, 0, 0.6, 0, 0.15],
  poison: [0.4, 0.1, 300, 0, 0.04, 0.1, 0, 1, -10, 0, 0, 0, 0, 0, 25],
  kill: [0.6, 0.05, 520, 0, 0.05, 0.25, 1, 1, -14, 0, 0, 0, 0, 1.5],
  encounter: [0.5, 0, 98, 0.03, 0.15, 0.3, 2, 1, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0.8],
  step: [0.2, 0.3, 140, 0, 0, 0.03, 1],
  chest: [0.5, 0.1, 200, 0, 0.02, 0.08, 1, 2],
  note: [0.5, 0, 523.25, 0.005, 0.06, 0.25, 1],
  heal: [0.5, 0.05, 400, 0.02, 0.1, 0.2, 0, 1, 8, 0, 0, 0, 0.04, 0, 0, 0, 0, 1, 0, 0.4],
  sprung: [0.6, 0.05, 90, 0, 0.03, 0.2, 4, 1, -4, 0, 0, 0, 0, 2, 0, 0.2],
  disarm: [0.4, 0, 1400, 0, 0.01, 0.04, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0.05],
  descend: [0.6, 0, 440, 0.02, 0.25, 0.35, 1, 1, -6, 0, 0, 0, 0, 0, 0, 0, 0.12],
  escape: [0.4, 0.1, 250, 0.01, 0.06, 0.1, 4, 1, 20],
  skill: [0.5, 0.05, 600, 0.01, 0.1, 0.18, 0, 1, 14, 0, 0, 0, 0, 0, 12],
  equip: [0.5, 0.05, 330, 0, 0.02, 0.08, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0.25],
  discard: [0.3, 0.1, 220, 0, 0.01, 0.06, 1, 1, -5],
};

// Short tunes, played on the `note` sound. [pitch ratio, ms after start];
// 1 is C5, 1.26 E5, 1.5 G5, 2 C6.
const TUNES = {
  levelup: [[1, 0], [1.26, 70], [1.5, 140], [2, 210]],
  won: [[1, 0], [1.26, 120], [1.5, 240], [2, 360], [1.5, 520], [2, 640]],
  dead: [[0.75, 0], [0.71, 200], [0.63, 400], [0.5, 650]],
  shrine: [[1, 0], [1.26, 40], [1.5, 80]],
  item: [[1.5, 0], [2, 60]],
  rare: [[1.5, 0], [2, 50], [2.52, 100], [3, 150]],
  potion: [[2, 0], [2.52, 60]],
  stat: [[1.5, 0]],
};

// What each engine event sounds like.
const CUES = {
  move: () => 'step',
  encounter: () => 'encounter',
  chest: () => 'chest',
  trap: (e) => (e.ok ? 'disarm' : 'sprung'),
  shrine: () => TUNES.shrine,
  descend: () => 'descend',
  hit: (e) => (e.crit ? 'crit' : 'hit'),
  miss: () => 'miss',
  block: () => 'block',
  ward: () => 'ward',
  hurt: () => 'hurt',
  poison: () => 'poison',
  kill: () => 'kill',
  levelup: () => TUNES.levelup,
  skill: () => 'skill',
  escape: () => 'escape',
  heal: (e) => (e.source === 'potion' ? 'heal' : null),
  loot: (e) => ({ potion: TUNES.potion, rare: TUNES.rare })[e.found] ?? TUNES.item,
  equip: () => 'equip',
  discard: () => 'discard',
  stat: () => TUNES.stat,
  dead: () => TUNES.dead,
  won: () => TUNES.won,
};

const STORAGE_KEY = 'one-die-deep:muted';
const GAP_MS = 90;

let muted = false;
try {
  muted = localStorage.getItem(STORAGE_KEY) === '1';
} catch {
  // Storage blocked: sound stays on for this visit.
}

let zzfx = null;
let built = null;
let loading = null;

/** Loads ZzFX and builds every sound. Call from a user gesture. */
export function unlock() {
  if (zzfx) {
    if (zzfx.ZZFX.audioContext.state === 'suspended') zzfx.ZZFX.audioContext.resume();
    return Promise.resolve();
  }
  loading ??= import('./vendor/ZzFX.js')
    .then((mod) => {
      zzfx = mod;
      built = Object.fromEntries(Object.entries(SOUNDS).map(([name, params]) => [name, new mod.ZZFXSound([...params])]));
      if (mod.ZZFX.audioContext.state === 'suspended') mod.ZZFX.audioContext.resume();
    })
    .catch(() => {
      // No audio support: the game plays silently.
    });
  return loading;
}

export const isMuted = () => muted;

export function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    // Not remembered, but still applies for this visit.
  }
}

function playCue(cue) {
  if (Array.isArray(cue)) {
    for (const [pitch, at] of cue) setTimeout(() => built.note.play(1, pitch, 0), at);
  } else if (cue) {
    built[cue].play();
  }
}

/** Plays one named sound from SOUNDS. */
export function play(name) {
  if (!muted && built) built[name].play();
}

/** Plays the sounds for a list of engine events, a beat apart. */
export function playEvents(events) {
  if (muted || !built) return;
  let at = 0;
  for (const event of events) {
    const cue = CUES[event.type]?.(event);
    if (!cue) continue;
    setTimeout(() => playCue(cue), at);
    at += GAP_MS;
  }
}
