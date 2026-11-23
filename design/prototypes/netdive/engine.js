// NETDIVE: an incremental hacking game on One Die Deep's map and die.
//
// The one stat is Bias, 2 to 5. Against ICE there are two attacks:
// BREAK (technical, succeeds on a roll under your Bias) and SPOOF (social
// engineering, succeeds on a roll over it). A roll equal to your Bias is a
// zero-day: the ICE crashes outright, whatever it resists. ICE resists one
// attack: a resisted attack only gets through on a zero-day.
//
// Every success moves your Bias by one. Which way is a setting while we
// explore: SWING (a success pushes you toward the other attack) or MOMENTUM
// (a success makes the same attack easier). Each dive starts from your
// starting Bias again.
//
// A dive lasts until your cycles run out. Every roll costs one, and so does
// every move into a node you haven't been to: going back through explored
// nodes is free. You always keep the data, and spend it between dives on
// upgrades.
import { d6, makeFloor, neighbors, reveal } from '../shared/dice.js';

export const LAYERS = 6;
export const LAYER_NAMES = ['Perimeter', 'Mail server', 'Accounting', 'R&D vault', 'Black site', 'Core'];
export const START = { cycles: 14, bias: 3 };
export const BIAS_MIN = 2;
export const BIAS_MAX = 5;
export const ATTACKS = { break: 'Break', spoof: 'Spoof' };

export const SHIFTS = {
  swing: { name: 'Swing', text: 'A success pushes your Bias toward the other attack, so you have to alternate.' },
  momentum: { name: 'Momentum', text: 'A success makes the same attack easier, so you specialise, and resistant ICE pushes back.' },
};

export const UPGRADES = {
  battery: { name: 'Battery', text: '+4 cycles per dive.', base: 5, growth: 1.45, max: 8 },
  tuner: { name: 'Bias tuner', text: 'Choose your starting Bias: 2–4, then 2–5.', base: 7, growth: 2.5, max: 2 },
  buffer: { name: 'Buffer', text: 'Each level rerolls one failed roll per dive.', base: 9, growth: 1.8, max: 3 },
  compress: { name: 'Compressor', text: '+50% data from ICE and caches.', base: 13, growth: 1.9, max: 4 },
  firewall: { name: 'Firewall', text: 'ICE counterattacks cost 1 cycle less.', base: 18, growth: 2.2, max: 2 },
  relay: { name: 'Relay', text: 'Start each dive one layer deeper, up to your best minus one.', base: 21, growth: 1.8, max: 4 },
  exploit: { name: 'Exploit kit', text: 'A roll one above your Bias is a zero-day too.', base: 54, growth: 1, max: 1 },
};
export const cost = (id, level) => Math.round(UPGRADES[id].base * UPGRADES[id].growth ** level);

// A wall can't be talked round; a sentry spots brute force.
const ICE = [
  { name: 'Wall', layers: 1, counter: 1, pay: 1, resists: 'spoof' },
  { name: 'Sentry', layers: 1, counter: 2, pay: 1, resists: 'break' },
  { name: 'Black ICE', layers: 2, counter: 2, pay: 2, resists: null },
];
const ICE_TABLE = [0, 0, 1, 1, 2, 2];
const NODE_TABLE = ['empty', 'ice', 'ice', 'ice', 'cache', 'special'];
const SPECIAL_TABLE = ['trace', 'trace', 'trace', 'backdoor', 'backdoor', 'backdoor'];

/** The attack this ICE resists right now. The Core's layers alternate. */
export function resists(ice) {
  if (ice.core) return ice.layers % 2 ? 'break' : 'spoof';
  return ice.resists;
}

// ---------- profile: what carries over between dives ----------

export function newProfile() {
  return {
    data: 0,
    earned: 0,
    dives: 0,
    deepest: 1,
    won: false,
    bias: START.bias,
    shift: 'swing',
    levels: Object.fromEntries(Object.keys(UPGRADES).map((id) => [id, 0])),
  };
}

export const biasRange = (p) => [[3, 3], [2, 4], [2, 5]][p.levels.tuner];
export const maxCycles = (p) => START.cycles + 4 * p.levels.battery;
export const startLayer = (p) => Math.max(1, Math.min(1 + p.levels.relay, p.deepest - 1));

export function canBuy(p, id) {
  const level = p.levels[id];
  return level < UPGRADES[id].max && p.data >= cost(id, level);
}

export function buy(p, id) {
  if (!canBuy(p, id)) return p;
  p.data -= cost(id, p.levels[id]);
  p.levels[id] += 1;
  const [lo, hi] = biasRange(p);
  p.bias = Math.min(hi, Math.max(lo, p.bias));
  return p;
}

export function setBias(p, value) {
  const [lo, hi] = biasRange(p);
  p.bias = Math.min(hi, Math.max(lo, value));
  return p;
}

export function setShift(p, shift) {
  if (SHIFTS[shift]) p.shift = shift;
  return p;
}

// ---------- a dive ----------

export function startDive(p, seed) {
  const dive = {
    seed: seed >>> 0,
    bias: p.bias,
    shift: p.shift ?? 'swing',
    exploit: p.levels.exploit > 0,
    buffer: p.levels.buffer,
    firewall: p.levels.firewall,
    payRate: 1 + 0.5 * p.levels.compress,
    cycles: maxCycles(p),
    max: maxCycles(p),
    layer: startLayer(p),
    data: 0,
    engaged: null,
    roll: null,
    events: [],
    log: [],
    over: null,
  };
  enterLayer(dive, dive.layer);
  say(dive, `Jacked in at layer ${dive.layer}: ${LAYER_NAMES[dive.layer - 1]}.`);
  return dive;
}

export const zeroDays = (dive) => (dive.exploit ? [dive.bias, dive.bias + 1] : [dive.bias]);
const wins = (dive, approach, die) => (approach === 'break' ? die < dive.bias : die > dive.bias);

function say(dive, text) {
  dive.log.push(text);
  if (dive.log.length > 30) dive.log.shift();
}

function emit(dive, type, data) {
  dive.events.push({ type, ...data });
}

function enterLayer(dive, layer) {
  dive.layer = layer;
  const floor = makeFloor(dive, 9);
  dive.rooms = floor.rooms;
  for (const k of floor.order.slice(1)) {
    const node = dive.rooms[k];
    if (k === floor.exit) {
      node.kind = layer === LAYERS ? 'ice' : 'uplink';
      if (layer === LAYERS) node.ice = { name: 'The Core', layers: 6, max: 6, counter: 3, pay: 0, resists: null, core: true };
      continue;
    }
    node.kind = NODE_TABLE[d6(dive) - 1];
    if (node.kind === 'special') node.kind = SPECIAL_TABLE[d6(dive) - 1];
    if (node.kind === 'ice') {
      const base = ICE[ICE_TABLE[d6(dive) - 1]];
      const layers = base.layers + Math.floor((layer - 1) / 2);
      node.ice = { ...base, layers, max: layers, counter: base.counter + Math.floor((layer - 1) / 3) };
    }
  }
  dive.rooms[floor.start].kind = 'empty';
  dive.pos = floor.start;
  dive.prev = null;
  reveal(dive.rooms, floor.start);
}

function spend(dive, n) {
  dive.cycles = Math.max(0, dive.cycles - n);
  if (dive.cycles === 0 && !dive.over) {
    dive.over = 'out';
    say(dive, 'Out of cycles. The trace catches up and you are disconnected.');
    emit(dive, 'disconnected');
  }
}

function gain(dive, amount) {
  const got = Math.round(amount * dive.payRate);
  dive.data += got;
  emit(dive, 'data', { amount: got });
  return got;
}

export const mode = (dive) => dive.over ?? (dive.engaged ? 'ice' : 'explore');

export function canMove(dive, k) {
  return mode(dive) === 'explore' && neighbors(dive.rooms, dive.pos).includes(k);
}

/**
 * The shortest walk to a node you can see, as the nodes to step into in turn.
 * It only passes through nodes you've been to; the last step may be into
 * anything. Null when there's no such walk.
 */
export function route(dive, k) {
  if (mode(dive) !== 'explore' || !dive.rooms[k]?.seen || k === dive.pos) return null;
  const from = { [dive.pos]: null };
  const queue = [dive.pos];
  while (queue.length) {
    const at = queue.shift();
    for (const n of neighbors(dive.rooms, at)) {
      if (n in from || !dive.rooms[n].seen) continue;
      from[n] = at;
      if (n === k) {
        const steps = [];
        for (let step = k; step !== dive.pos; step = from[step]) steps.unshift(step);
        return steps;
      }
      if (dive.rooms[n].visited) queue.push(n);
    }
  }
  return null;
}

export function move(dive, k) {
  dive.events = [];
  if (!canMove(dive, k)) return dive;
  const explored = dive.rooms[k].visited;
  dive.prev = dive.pos;
  dive.pos = k;
  reveal(dive.rooms, k);
  emit(dive, 'move', { from: dive.prev, to: k });
  const node = dive.rooms[k];
  if (node.kind === 'ice') {
    dive.engaged = k;
    say(dive, `${node.ice.name} (${node.ice.layers} layer${node.ice.layers > 1 ? 's' : ''}) blocks the node.`);
    emit(dive, 'encounter', { core: node.ice.core });
  } else if (node.kind === 'cache') {
    node.kind = 'empty';
    const die = d6(dive);
    dive.roll = { n: (dive.roll?.n ?? 0) + 1, die, kind: 'cache' };
    say(dive, `Data cache: ${gain(dive, die * dive.layer)} data.`);
  } else if (node.kind === 'trace') {
    // Staying hidden is a Spoof roll: over your Bias, or a zero-day.
    node.kind = 'tripped';
    const die = d6(dive);
    const ok = wins(dive, 'spoof', die) || zeroDays(dive).includes(die);
    dive.roll = { n: (dive.roll?.n ?? 0) + 1, die, kind: 'trace', ok };
    emit(dive, 'trace', { ok });
    if (ok) say(dive, 'A trace program sweeps past. You talk your way out of it.');
    else {
      say(dive, 'A trace program tags you: −3 cycles.');
      spend(dive, 3);
    }
  } else if (node.kind === 'backdoor') {
    node.kind = 'empty';
    const before = dive.cycles;
    dive.cycles = Math.min(dive.max, dive.cycles + 3);
    say(dive, `A backdoor: +${dive.cycles - before} cycles.`);
    emit(dive, 'backdoor');
  }
  if (!explored) spend(dive, 1);
  return dive;
}

export function descend(dive) {
  dive.events = [];
  if (mode(dive) !== 'explore' || dive.rooms[dive.pos].kind !== 'uplink') return dive;
  enterLayer(dive, dive.layer + 1);
  say(dive, `Down to layer ${dive.layer}: ${LAYER_NAMES[dive.layer - 1]}.`);
  emit(dive, 'descend', { layer: dive.layer });
  spend(dive, 1);
  return dive;
}

/** One attack, 'break' or 'spoof', against the engaged ICE. */
export function attempt(dive, approach) {
  dive.events = [];
  if (mode(dive) !== 'ice' || !ATTACKS[approach]) return dive;
  const node = dive.rooms[dive.engaged];
  const { ice } = node;
  const resisted = resists(ice) === approach;
  const lands = (die) => zeroDays(dive).includes(die) || (!resisted && wins(dive, approach, die));
  let die = d6(dive);
  let rerolled = null;
  if (!lands(die) && dive.buffer > 0) {
    dive.buffer -= 1;
    rerolled = die;
    die = d6(dive);
  }
  const outcome = zeroDays(dive).includes(die) ? 'zero-day' : lands(die) ? 'success' : 'fail';
  dive.roll = { n: (dive.roll?.n ?? 0) + 1, die, kind: approach, outcome, rerolled, resisted, bias: dive.bias };

  if (outcome === 'zero-day') {
    crash(dive, node, true);
  } else if (outcome === 'success') {
    ice.layers -= 1;
    if (ice.layers === 0) crash(dive, node, false);
    else {
      say(dive, `${ATTACKS[approach]} strips a layer of the ${ice.name}. ${ice.layers} left.`);
      emit(dive, 'hit');
    }
    shiftBias(dive, approach);
  } else {
    const hurt = Math.max(1, ice.counter - dive.firewall);
    say(dive, `${resisted ? `The ${ice.name} resists ${ATTACKS[approach]}` : `${ATTACKS[approach]} fails`}. It hits back: −${hurt} cycles.`);
    emit(dive, 'hurt', { amount: hurt });
    spend(dive, hurt);
  }
  spend(dive, 1);
  return dive;
}

// Swing: Break lowers Bias (Spoof gets easier), Spoof raises it.
// Momentum: the other way round, so the same attack gets easier.
function shiftBias(dive, approach) {
  const toward = approach === 'break' ? -1 : 1;
  const step = dive.shift === 'swing' ? toward : -toward;
  const from = dive.bias;
  dive.bias = Math.min(BIAS_MAX, Math.max(BIAS_MIN, dive.bias + step));
  dive.roll.biasTo = dive.bias;
  if (dive.bias !== from) {
    say(dive, `Your Bias moves from ${from} to ${dive.bias}.`);
    emit(dive, 'shift', { from, to: dive.bias });
  }
}

function crash(dive, node, zeroDay) {
  const { ice } = node;
  node.kind = 'empty';
  dive.engaged = null;
  if (ice.core) {
    dive.over = 'won';
    say(dive, 'The Core crashes. The whole network is yours.');
    emit(dive, 'won');
    return;
  }
  const got = gain(dive, ice.max * ice.pay * dive.layer);
  say(dive, `${zeroDay ? 'Zero-day! ' : ''}The ${ice.name} crashes: ${got} data.`);
  emit(dive, 'kill', { zeroDay });
}

export function jackOut(dive) {
  dive.events = [];
  if (dive.over) return dive;
  dive.over = 'jacked';
  say(dive, 'You jack out.');
  emit(dive, 'jackout');
  return dive;
}

/** Banks a finished dive into the profile. */
export function settle(p, dive) {
  p.data += dive.data;
  p.earned += dive.data;
  p.dives += 1;
  p.deepest = Math.max(p.deepest, dive.layer);
  if (dive.over === 'won') p.won = true;
  return p;
}
