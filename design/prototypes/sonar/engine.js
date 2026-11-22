// SONAR: a dungeon-minesweeper on the d6.
//
// The trench is a hidden grid. Ping a cell to reveal it. Open water shows an
// echo: the total power of the creatures in the eight cells around it.
// Pinging a creature means fighting it: roll the die, and the hull takes
// power - roll damage, never less than 0. Kills give XP equal to their
// power; a level-up adds hull and repairs it fully, so the trick is the
// order: small fights first, the big ones right before a level-up.
// Kill the Leviathan to win.
import { d6 } from '../shared/dice.js';

export const W = 8;
export const H = 8;
// spawns: [power, count], many small creatures and a few big ones.
// Combat: damage = power - roll (- level when levelGuards).
// Growth: max hull = hullBase + hullPerLevel per level after the first.
// Tuned with tests/balance/prototypes/sonar.js.
export const RULES = {
  spawns: [[1, 4], [2, 4], [3, 4], [4, 3], [5, 3], [6, 2], [7, 2], [8, 2]],
  leviathan: 12,
  levelGuards: false,
  hullBase: 4,
  hullPerLevel: 2,
};
export const PEARLS = 4;
export const PEARL_REPAIR = 3;
export const NAMES = { 1: 'Krill swarm', 2: 'Jellyfish', 3: 'Lionfish', 4: 'Moray eel', 5: 'Anglerfish', 6: 'Shark', 7: 'Giant squid', 8: 'Colossal squid' };
export const xpToLevel = (level) => 4 * level;
export const maxHull = (level) => RULES.hullBase + RULES.hullPerLevel * (level - 1);

const idx = (x, y) => y * W + x;
export function around(i) {
  const x = i % W;
  const y = Math.floor(i / W);
  const out = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(idx(nx, ny));
    }
  return out;
}

// Picks a random free cell with the die: two rolls choose among 36, rerolled
// until one lands in range. Keeps every random choice a d6 roll.
function pickFree(state, free) {
  for (;;) {
    const n = (d6(state) - 1) * 6 + (d6(state) - 1) + 36 * (d6(state) - 1);
    if (n < free.length) return free.splice(n, 1)[0];
  }
}

export function newGame(seed) {
  const state = {
    seed: seed >>> 0,
    cells: Array.from({ length: W * H }, () => ({ power: 0, pearl: false, open: false, mark: false })),
    level: 1,
    xp: 0,
    hull: maxHull(1),
    roll: null,
    events: [],
    log: [],
    over: null,
    pings: 0,
  };
  const free = Array.from({ length: W * H }, (_, i) => i);
  const place = (power) => (state.cells[pickFree(state, free)].power = power);
  for (const [power, count] of RULES.spawns) for (let i = 0; i < count; i++) place(power);
  place(RULES.leviathan);
  for (let i = 0; i < PEARLS; i++) state.cells[pickFree(state, free)].pearl = true;
  // Start on the calmest open water, so the first move is never blind.
  const calm = free.reduce((best, i) => (shownEcho(state, i) < shownEcho(state, best) ? i : best));
  open(state, calm);
  say(state, 'The sub settles into the trench. Ping a cell to look.');
  return state;
}

// What the echo shows once revealed: the creatures' total power, counting
// ones already killed, so the numbers on the board never change.
export function shownEcho(state, i) {
  return around(i).reduce((sum, n) => sum + state.cells[n].power, 0);
}

function say(state, text) {
  state.log.push(text);
  if (state.log.length > 30) state.log.shift();
}

function open(state, i) {
  const cell = state.cells[i];
  if (cell.open) return;
  cell.open = true;
  cell.mark = false;
  if (!cell.power && !cell.pearl && shownEcho(state, i) === 0) for (const n of around(i)) open(state, n);
}

export function mark(state, i) {
  if (!state.over && !state.cells[i].open) state.cells[i].mark = !state.cells[i].mark;
  return state;
}

export function ping(state, i) {
  state.events = [];
  const cell = state.cells[i];
  if (state.over || cell.open) return state;
  state.pings += 1;
  open(state, i);
  if (cell.power) fight(state, cell);
  else if (cell.pearl) {
    const before = state.hull;
    state.hull = Math.min(maxHull(state.level), state.hull + PEARL_REPAIR);
    say(state, `A pearl bed: hull +${state.hull - before}.`);
    state.events.push({ type: 'heal' });
  } else {
    say(state, shownEcho(state, i) ? `Echo strength ${shownEcho(state, i)}.` : 'Silence. Open water all around.');
    state.events.push({ type: 'move' });
  }
  return state;
}

function fight(state, cell) {
  const die = d6(state);
  const dmg = Math.max(0, cell.power - die - (RULES.levelGuards ? state.level : 0));
  state.roll = { n: (state.roll?.n ?? 0) + 1, die, level: RULES.levelGuards ? state.level : 0, power: cell.power, dmg };
  cell.alive = false;
  state.hull = Math.max(0, state.hull - dmg);
  const name = cell.power === RULES.leviathan ? 'Leviathan' : NAMES[cell.power];
  say(state, dmg ? `${name} (${cell.power}): the hull takes ${dmg}.` : `${name} (${cell.power}): no damage.`);
  state.events.push({ type: dmg ? 'hurt' : 'block' }, { type: 'kill' });
  if (state.hull === 0) {
    state.over = 'lost';
    say(state, 'The hull gives way.');
    state.events.push({ type: 'dead' });
    return;
  }
  if (cell.power === RULES.leviathan) {
    state.over = 'won';
    say(state, 'The Leviathan sinks into the dark. You win.');
    state.events.push({ type: 'won' });
    return;
  }
  state.xp += cell.power;
  while (state.xp >= xpToLevel(state.level)) {
    state.xp -= xpToLevel(state.level);
    state.level += 1;
    state.hull = maxHull(state.level);
    say(state, `Level ${state.level}: hull ${state.hull}, repaired.`);
    state.events.push({ type: 'levelup' });
  }
}
