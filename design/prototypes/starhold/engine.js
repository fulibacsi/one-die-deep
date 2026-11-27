// STARHOLD: galaxy conquest on One Die Deep's map and die, a variant of
// NETDIVE v3. Incremental, with resources to manage.
//
// One galaxy, kept between campaigns. Your fleet launches from your homeworld
// with a few turns of supply. Moving through systems you hold is free; a move
// into any other system costs one supply, and so does every roll. Uninhabited
// worlds are yours on arrival. Inhabited ones have a strength you wear down
// with two actions (they regroup between campaigns), rolled the way Lasers &
// Feelings rolls: pick one, roll its
// dice, count the hits. A die under your Aggression is a hit for PURGE, a die
// over it is a hit for ENSLAVE, and your Aggression exactly hits for either.
//
//   0 hits: the attack fails and the defenders strike back.
//   1 hit:  strength −1, but they strike back.
//   2 hits: strength −1, clean.
//   3 hits: strength −2.
//
// A hit moves your Aggression by one toward the other action. The action that
// takes the last point of strength decides the species' fate, and with it what
// the system produces: a purged world yields its planet's resource (alloys or
// fuel), an enslaved one yields labor. At the end of each campaign every
// system you hold ships its output home, and you spend it on your fleet.
// Take the Precursor throneworld to win.
import { d6, makeFloor, neighbors, reveal } from '../shared/dice.js';

export const SYSTEMS = 20;
export const GRID = 6;
export const START = { supply: 6, aggression: 3 };
export const AGG_MIN = 2;
export const AGG_MAX = 5;
export const MAX_DICE = 3;
export const ACTIONS = { purge: 'Purge', enslave: 'Enslave' };
export const RESOURCES = { alloys: 'Alloys', fuel: 'Fuel', labor: 'Labor' };

// Each upgrade is bought with one resource.
export const UPGRADES = {
  warfleet: { name: 'Warfleet', text: '+1 die when you Purge.', pay: 'alloys', base: 14, growth: 2.5, max: MAX_DICE - 1 },
  overseers: { name: 'Overseers', text: '+1 die when you Enslave.', pay: 'labor', base: 14, growth: 2.5, max: MAX_DICE - 1 },
  supply: { name: 'Supply lines', text: '+4 supply per campaign.', pay: 'fuel', base: 8, growth: 1.6, max: 6 },
  doctrine: { name: 'War doctrine', text: 'Choose your starting Aggression: 2–4, then 2–5.', pay: 'labor', base: 16, growth: 2.5, max: 2 },
};
export const cost = (id, level) => Math.round(UPGRADES[id].base * UPGRADES[id].growth ** level);

const KIND_TABLE = ['empty', 'empty', 'species', 'species', 'species', 'derelict'];
const SPECIES = ['Krell', 'Vashti', 'Oru', 'Thessar', 'Myrr', 'Quell'];
const ZERO = { alloys: 0, fuel: 0, labor: 0 };

// ---------- the profile: the galaxy and everything kept between campaigns ----------

export function newProfile(seed = Date.now()) {
  const p = {
    seed: seed >>> 0,
    campaigns: 0,
    won: false,
    aggression: START.aggression,
    stock: { ...ZERO },
    earned: { ...ZERO },
    levels: Object.fromEntries(Object.keys(UPGRADES).map((id) => [id, 0])),
  };
  const galaxy = makeFloor(p, SYSTEMS, GRID);
  p.rooms = galaxy.rooms;
  p.home = galaxy.start;
  // Distance from home sets how strong a system is and how much it yields.
  const dist = { [p.home]: 0 };
  const queue = [p.home];
  while (queue.length) {
    const k = queue.shift();
    for (const n of neighbors(p.rooms, k)) if (!(n in dist)) (dist[n] = dist[k] + 1), queue.push(n);
  }
  for (const k of galaxy.order) {
    const sys = p.rooms[k];
    sys.dist = dist[k];
    sys.owned = false;
    sys.fate = null;
    sys.planet = d6(p) <= 3 ? 'alloys' : 'fuel';
    if (k === p.home) {
      Object.assign(sys, { kind: 'home', owned: true, fate: 'home' });
    } else if (k === galaxy.exit) {
      Object.assign(sys, { kind: 'core', species: { name: 'Precursors', strength: 12, max: 12, strike: 4 } });
    } else {
      sys.kind = KIND_TABLE[d6(p) - 1];
      if (sys.kind === 'species') {
        const strength = 1 + Math.floor(sys.dist / 2);
        sys.species = { name: SPECIES[d6(p) - 1], strength, max: strength, strike: 1 + Math.floor(sys.dist / 3) };
      }
    }
  }
  reveal(p.rooms, p.home);
  return p;
}

/** What a system you hold ships home each campaign, by how you took it. */
export function yields(sys) {
  if (!sys.owned) return {};
  if (sys.fate === 'home') return { alloys: 1, fuel: 1, labor: 1 };
  const y = 1 + Math.floor(sys.dist / 5);
  if (sys.fate === 'enslaved') return { labor: 2 * y };
  if (sys.fate === 'purged') return { [sys.planet]: 2 * y };
  return { [sys.planet]: y }; // claimed: uninhabited, or a derelict's world
}

/** What each fate would yield, for a system you haven't taken yet. */
export function fates(sys) {
  return {
    purge: yields({ ...sys, owned: true, fate: 'purged' }),
    enslave: yields({ ...sys, owned: true, fate: 'enslaved' }),
  };
}

export function income(p) {
  const total = { ...ZERO };
  for (const sys of Object.values(p.rooms)) for (const [r, n] of Object.entries(yields(sys))) total[r] += n;
  return total;
}

export const held = (p) => Object.values(p.rooms).filter((s) => s.owned).length;
export const aggressionRange = (p) => [[3, 3], [2, 4], [2, 5]][p.levels.doctrine];
export const maxSupply = (p) => START.supply + 4 * p.levels.supply;

export function canBuy(p, id) {
  const level = p.levels[id];
  return level < UPGRADES[id].max && p.stock[UPGRADES[id].pay] >= cost(id, level);
}

export function buy(p, id) {
  if (!canBuy(p, id)) return p;
  p.stock[UPGRADES[id].pay] -= cost(id, p.levels[id]);
  p.levels[id] += 1;
  setAggression(p, p.aggression);
  return p;
}

export function setAggression(p, value) {
  const [lo, hi] = aggressionRange(p);
  p.aggression = Math.min(hi, Math.max(lo, value));
  return p;
}

// ---------- a campaign ----------

export function launch(p) {
  return {
    p,
    rooms: p.rooms,
    supply: maxSupply(p),
    max: maxSupply(p),
    aggression: p.aggression,
    dice: { purge: 1 + p.levels.warfleet, enslave: 1 + p.levels.overseers },
    pos: p.home,
    prev: null,
    engaged: null,
    taken: [],
    roll: null,
    events: [],
    log: ['The fleet launches from your homeworld.'],
    over: null,
  };
}

function say(c, text) {
  c.log.push(text);
  if (c.log.length > 30) c.log.shift();
}

function emit(c, type, data) {
  c.events.push({ type, ...data });
}

function spend(c, n) {
  c.supply = Math.max(0, c.supply - n);
  if (c.supply === 0 && !c.over) {
    c.over = 'out';
    say(c, 'Out of supply. The fleet turns for home.');
    emit(c, 'out');
  }
}

export const mode = (c) => c.over ?? (c.engaged ? 'battle' : 'explore');

/** Whether one die is a hit for this action at the campaign's Aggression. */
export const hits = (c, action, die) => die === c.aggression || (action === 'purge' ? die < c.aggression : die > c.aggression);

/**
 * The shortest flight to a system you can see, as the systems to enter in
 * turn. It only passes through systems you hold; the last one may be any.
 * Null when there's no such flight.
 */
export function route(c, k) {
  if (mode(c) !== 'explore' || !c.rooms[k]?.seen || k === c.pos) return null;
  const from = { [c.pos]: null };
  const queue = [c.pos];
  while (queue.length) {
    const at = queue.shift();
    for (const n of neighbors(c.rooms, at)) {
      if (n in from || !c.rooms[n].seen) continue;
      from[n] = at;
      if (n === k) {
        const steps = [];
        for (let step = k; step !== c.pos; step = from[step]) steps.unshift(step);
        return steps;
      }
      if (c.rooms[n].owned) queue.push(n);
    }
  }
  return null;
}

export function canMove(c, k) {
  return mode(c) === 'explore' && neighbors(c.rooms, c.pos).includes(k);
}

export function move(c, k) {
  c.events = [];
  if (!canMove(c, k)) return c;
  const sys = c.rooms[k];
  const free = sys.owned;
  c.prev = c.pos;
  c.pos = k;
  reveal(c.rooms, k);
  emit(c, 'move', { from: c.prev, to: k });
  if (sys.kind === 'species' || sys.kind === 'core') {
    c.engaged = k;
    const { name, strength, strike } = sys.species;
    say(c, `The ${name} defend this system: strength ${strength}, they strike back for ${strike}.`);
    emit(c, 'encounter', { core: sys.kind === 'core' });
  } else if (!sys.owned) {
    if (sys.kind === 'derelict') {
      const before = c.supply;
      c.supply = Math.min(c.max, c.supply + 3);
      say(c, `A derelict supply depot: +${c.supply - before} supply.`);
      emit(c, 'derelict');
    }
    sys.kind = 'empty';
    take(c, sys, 'claimed');
  }
  if (!free) spend(c, 1);
  return c;
}

function take(c, sys, fate) {
  sys.owned = true;
  sys.fate = fate;
  c.taken.push(fate);
  const out = Object.entries(yields(sys)).map(([r, n]) => `${n} ${RESOURCES[r].toLowerCase()}`).join(', ');
  const what = { claimed: 'You claim an uninhabited world', purged: `The ${sys.species?.name} are purged`, enslaved: `The ${sys.species?.name} are enslaved` }[fate];
  say(c, `${what}. It yields ${out} per campaign.`);
  emit(c, 'take', { fate });
}

/** One action, 'purge' or 'enslave', against the defenders here: roll its dice, count the hits. */
export function attempt(c, action) {
  c.events = [];
  if (mode(c) !== 'battle' || !ACTIONS[action]) return c;
  const sys = c.rooms[c.engaged];
  const { species } = sys;
  const dice = Array.from({ length: c.dice[action] }, () => d6(c.p));
  const marks = dice.map((die) => hits(c, action, die));
  const count = marks.filter(Boolean).length;
  const outcome = ['fail', 'scrape', 'clean', 'double'][count];
  c.roll = { n: (c.roll?.n ?? 0) + 1, dice, kind: action, hits: marks, outcome, aggression: c.aggression };

  const damage = [0, 1, 1, 2][count];
  if (damage) {
    species.strength = Math.max(0, species.strength - damage);
    if (species.strength === 0) conquer(c, sys, action);
    else {
      say(c, `${ACTIONS[action]}: the ${species.name} lose ${damage} strength. ${species.strength} left.`);
      emit(c, 'hit', { double: damage === 2 });
    }
    shift(c, action);
  } else {
    say(c, `${ACTIONS[action]} fails.`);
  }
  if (count <= 1) {
    say(c, `The ${species.name} strike back: −${species.strike} supply.`);
    emit(c, 'hurt', { amount: species.strike });
    spend(c, species.strike);
  }
  spend(c, 1);
  return c;
}

// A purge hit lowers your Aggression, toward Enslave; an enslave hit raises it.
function shift(c, action) {
  const from = c.aggression;
  c.aggression = Math.min(AGG_MAX, Math.max(AGG_MIN, c.aggression + (action === 'purge' ? -1 : 1)));
  c.roll.aggressionTo = c.aggression;
  if (c.aggression !== from) {
    say(c, `Your Aggression moves from ${from} to ${c.aggression}.`);
    emit(c, 'shift', { from, to: c.aggression });
  }
}

function conquer(c, sys, action) {
  c.engaged = null;
  if (sys.kind === 'core') {
    sys.owned = true;
    sys.fate = action === 'purge' ? 'purged' : 'enslaved';
    c.over = 'won';
    say(c, `The Precursor throneworld falls. The galaxy is yours.`);
    emit(c, 'won');
    return;
  }
  take(c, sys, action === 'purge' ? 'purged' : 'enslaved');
}

export function recall(c) {
  c.events = [];
  if (c.over) return c;
  c.over = 'recalled';
  say(c, 'You recall the fleet.');
  emit(c, 'recall');
  return c;
}

/**
 * Ends a campaign: every system you hold ships its output home, and defenders
 * you didn't defeat regroup to full strength. Returns what came in.
 */
export function settle(p, c) {
  for (const sys of Object.values(p.rooms)) if (sys.species && !sys.owned) sys.species.strength = sys.species.max;
  const got = income(p);
  for (const [r, n] of Object.entries(got)) {
    p.stock[r] += n;
    p.earned[r] += n;
  }
  p.campaigns += 1;
  if (c.over === 'won') p.won = true;
  return got;
}
