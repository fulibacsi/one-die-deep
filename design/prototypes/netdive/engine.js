// NETDIVE: an incremental hacking game on One Die Deep's map and die.
//
// The one stat is Bias, 2 to 5. Against ICE there are two attacks, rolled
// the way Lasers & Feelings rolls: pick one, then roll its dice and count
// the hits. A die under your Bias is a hit for BREAK (technical), a die over
// it is a hit for SPOOF (social engineering), and a die showing your Bias
// exactly is a zero-day: a hit for either. You roll one die, plus one for
// each level of expertise in that attack.
//
//   0 hits: the attack fails and the ICE hits back.
//   1 hit:  it strips a layer, but the ICE hits back.
//   2 hits: it strips a layer clean.
//   3 hits: it strips two layers.
//
// An attack that hits moves your Bias by one. Which way is a setting while
// we explore: SWING (a hit pushes you toward the other attack) or MOMENTUM
// (a hit makes the same attack easier). Each dive starts from your starting
// Bias again.
//
// A dive lasts until your cycles run out. Every roll costs one, and so does
// every move into a node you haven't been to: going back through explored
// nodes is free. You always keep the data, and spend it between dives on
// upgrades.
import { d6, makeFloor, neighbors, reveal } from '../shared/dice.js';

export const LAYERS = 6;
export const LAYER_NAMES = ['Perimeter', 'Mail server', 'Accounting', 'R&D vault', 'Black site', 'Core'];
export const START = { cycles: 28, bias: 3 };
export const MAX_DICE = 3;
export const BIAS_MIN = 2;
export const BIAS_MAX = 5;
export const ATTACKS = { break: 'Break', spoof: 'Spoof' };

export const SHIFTS = {
  swing: { name: 'Swing', text: 'A success pushes your Bias toward the other attack, so you have to alternate.' },
  momentum: { name: 'Momentum', text: 'A success makes the same attack easier, so you can lean on one.' },
};

// Expertise is where the extra dice come from.
export const UPGRADES = {
  breakExpert: { name: 'Break expertise', text: '+1 die when you Break.', base: 8, growth: 2.5, max: MAX_DICE - 1 },
  spoofExpert: { name: 'Spoof expertise', text: '+1 die when you Spoof.', base: 8, growth: 2.5, max: MAX_DICE - 1 },
  tuner: { name: 'Bias tuner', text: 'Choose your starting Bias: 2–4, then 2–5.', base: 7, growth: 2.5, max: 2 },
  relay: { name: 'Relay', text: 'Start each dive one layer deeper, up to your best minus one.', base: 21, growth: 1.8, max: 4 },
  exploit: { name: 'Exploit kit', text: 'A die one above your Bias is a zero-day too.', base: 54, growth: 1, max: 1 },
};
export const cost = (id, level) => Math.round(UPGRADES[id].base * UPGRADES[id].growth ** level);

// ICE differs in how many layers it has and how hard it hits back.
const ICE = [
  { name: 'Wall', layers: 1, counter: 1, pay: 1 },
  { name: 'Sentry', layers: 1, counter: 2, pay: 1 },
  { name: 'Black ICE', layers: 2, counter: 2, pay: 2 },
];
const ICE_TABLE = [0, 0, 1, 1, 2, 2];
const NODE_TABLE = ['empty', 'ice', 'ice', 'ice', 'cache', 'special'];
const SPECIAL_TABLE = ['trace', 'trace', 'trace', 'backdoor', 'backdoor', 'backdoor'];
const OUTCOMES = ['fail', 'scrape', 'clean', 'double'];

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
export const maxCycles = () => START.cycles;
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
    dice: { break: 1 + p.levels.breakExpert, spoof: 1 + p.levels.spoofExpert },
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
      if (layer === LAYERS) node.ice = { name: 'The Core', layers: 6, max: 6, counter: 3, pay: 0, core: true };
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
  dive.data += amount;
  emit(dive, 'data', { amount });
  return amount;
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

/** Whether one die is a hit for this attack at the dive's current Bias. */
export const hits = (dive, approach, die) => zeroDays(dive).includes(die) || wins(dive, approach, die);

/** One attack, 'break' or 'spoof', against the engaged ICE: roll its dice, count the hits. */
export function attempt(dive, approach) {
  dive.events = [];
  if (mode(dive) !== 'ice' || !ATTACKS[approach]) return dive;
  const node = dive.rooms[dive.engaged];
  const { ice } = node;
  const dice = Array.from({ length: dive.dice[approach] }, () => d6(dive));
  const count = dice.filter((die) => hits(dive, approach, die)).length;
  const outcome = OUTCOMES[count];
  dive.roll = { n: (dive.roll?.n ?? 0) + 1, dice, kind: approach, hits: dice.map((die) => hits(dive, approach, die)), outcome, bias: dive.bias, zeroDays: zeroDays(dive) };

  const strip = [0, 1, 1, 2][count];
  if (strip) {
    ice.layers = Math.max(0, ice.layers - strip);
    if (ice.layers === 0) crash(dive, node);
    else {
      say(dive, `${ATTACKS[approach]} strips ${strip === 2 ? 'two layers' : 'a layer'} of the ${ice.name}. ${ice.layers} left.`);
      emit(dive, 'hit', { double: strip === 2 });
    }
    shiftBias(dive, approach);
  } else {
    say(dive, `${ATTACKS[approach]} fails.`);
  }
  if (count <= 1) {
    say(dive, `The ${ice.name} hits back: −${ice.counter} cycles.`);
    emit(dive, 'hurt', { amount: ice.counter });
    spend(dive, ice.counter);
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

function crash(dive, node) {
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
  say(dive, `The ${ice.name} crashes: ${got} data.`);
  emit(dive, 'kill');
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
