// HIGH ROLLER: a casino-heist roguelite where your one d6 is your character.
//
// No stats. Each of the die's six faces is an effect: hit, block, parry (hit
// and block), heal, chip or blank. In a fight you roll, then either keep the
// face or spend a chip to reroll it; the guard then hits you unless the face
// blocked. Safes hold new faces: you choose which face of your die to replace.
// Chips are both your rerolls and the money you keep when the run ends,
// spent between runs on permanent upgrades. Beat the House on the last floor.
import { d6, makeFloor, neighbors, reveal } from '../shared/dice.js';

export const FLOORS = 4;
export const FLOOR_NAMES = ['The slot floor', 'The card tables', 'High limit', 'The vault'];

// A face is { kind, n }. kinds: hit, block, parry (hit n + block), heal, chip, blank.
const F = (kind, n = 0) => ({ kind, n });
export const START_DIE = [F('hit', 1), F('hit', 2), F('hit', 2), F('block'), F('block'), F('chip', 1)];
// Tuned with tests/balance/prototypes/high-roller.js. The elevator refills
// your Nerve: each floor is a fresh fight, your die is what carries over.
export const RULES = { startNerve: 12, elevatorHeals: true, guardHpPerFloor: 1, houseHp: 16 };
export const faceText = (f) =>
  ({ hit: `Hit ${f.n}`, block: 'Block', parry: `Parry ${f.n}`, heal: `Heal ${f.n}`, chip: `+${f.n} chip`, blank: 'Blank' })[f.kind];
// How good a face is, for the bot and for sorting offers.
export const faceValue = (f) => ({ blank: 0, chip: 1, hit: 1.2 * f.n, block: 2.2, heal: 0.9 * f.n, parry: 2.2 + 1.2 * f.n })[f.kind];

// Loot offers by floor: a d6 on the floor's row.
const LOOT = [
  [F('hit', 2), F('hit', 2), F('block'), F('heal', 2), F('chip', 2), F('parry', 1)],
  [F('hit', 2), F('hit', 3), F('block'), F('heal', 3), F('chip', 2), F('parry', 1)],
  [F('hit', 3), F('hit', 3), F('parry', 1), F('heal', 3), F('chip', 3), F('parry', 2)],
  [F('hit', 3), F('hit', 4), F('parry', 2), F('heal', 4), F('chip', 3), F('parry', 2)],
];
export const GUARDS = [
  { name: 'Bouncer', hp: 2, dmg: 1 },
  { name: 'Dealer', hp: 3, dmg: 1 },
  { name: 'Pit boss', hp: 4, dmg: 2 },
];
const GUARD_TABLE = [0, 0, 1, 1, 2, 2];
const ROOM_TABLE = ['empty', 'guard', 'guard', 'guard', 'safe', 'special'];
const SPECIAL_TABLE = ['alarm', 'alarm', 'alarm', 'bar', 'bar', 'bar'];
export const HOUSE = { name: 'The House', hp: 16, dmg: 2, boss: true };

export const META = {
  nerve: { name: 'Thick skin', text: '+2 starting Nerve.', base: 6, growth: 1.5, max: 5 },
  stake: { name: 'House money', text: 'Start each run with +1 chip.', base: 5, growth: 1.6, max: 4 },
  loaded: { name: 'Loaded face', text: 'Permanently upgrade your starting die, weakest face first.', base: 8, growth: 1.7, max: 4 },
};
const LOADED = [F('hit', 2), F('parry', 1), F('hit', 2), F('hit', 3)]; // what each Loaded level puts on the weakest face
export const metaCost = (id, level) => Math.round(META[id].base * META[id].growth ** level);

export function newProfile() {
  return { chips: 0, runs: 0, wins: 0, levels: { nerve: 0, stake: 0, loaded: 0 } };
}

export function startDie(p) {
  const die = START_DIE.map((f) => ({ ...f }));
  for (let l = 0; l < p.levels.loaded; l++) die[weakest(die)] = { ...LOADED[l] };
  return die;
}

export const weakest = (die) => die.reduce((w, f, i) => (faceValue(f) < faceValue(die[w]) ? i : w), 0);

export function buyMeta(p, id) {
  const level = p.levels[id];
  if (level >= META[id].max || p.chips < metaCost(id, level)) return p;
  p.chips -= metaCost(id, level);
  p.levels[id] += 1;
  return p;
}

// ---------- a run ----------

export function newRun(p, seed) {
  const nerve = RULES.startNerve + 2 * p.levels.nerve;
  const run = {
    seed: seed >>> 0,
    die: startDie(p),
    nerve,
    maxNerve: nerve,
    chips: p.levels.stake,
    earned: 0,
    floor: 0,
    combat: null,
    offer: null,
    roll: null,
    events: [],
    log: [],
    over: null,
  };
  enterFloor(run, 1);
  say(run, 'You walk in with your lucky die.');
  return run;
}

function say(run, text) {
  run.log.push(text);
  if (run.log.length > 30) run.log.shift();
}
const emit = (run, type, data) => run.events.push({ type, ...data });

function enterFloor(run, floor) {
  run.floor = floor;
  const f = makeFloor(run, 8);
  run.rooms = f.rooms;
  for (const k of f.order.slice(1)) {
    const room = run.rooms[k];
    if (k === f.exit) {
      room.kind = floor === FLOORS ? 'guard' : 'elevator';
      if (floor === FLOORS) room.foe = { ...HOUSE, hp: RULES.houseHp, max: RULES.houseHp };
      continue;
    }
    room.kind = ROOM_TABLE[d6(run) - 1];
    if (room.kind === 'special') room.kind = SPECIAL_TABLE[d6(run) - 1];
    if (room.kind === 'guard') {
      const g = GUARDS[GUARD_TABLE[d6(run) - 1]];
      const hp = g.hp + RULES.guardHpPerFloor * (floor - 1);
      room.foe = { ...g, hp, max: hp, dmg: g.dmg + Math.floor((floor - 1) / 2) };
    }
  }
  run.rooms[f.start].kind = 'empty';
  run.pos = f.start;
  run.prev = null;
  reveal(run.rooms, f.start);
}

export const mode = (run) => run.over ?? (run.offer ? 'offer' : run.combat?.face != null ? 'decide' : run.combat ? 'fight' : 'explore');

export function canMove(run, k) {
  return mode(run) === 'explore' && neighbors(run.rooms, run.pos).includes(k);
}

function gainChips(run, n) {
  run.chips += n;
  run.earned += n;
}

function hurt(run, n) {
  run.nerve = Math.max(0, run.nerve - n);
  emit(run, 'hurt', { amount: n });
  if (run.nerve === 0) {
    run.over = 'bust';
    run.combat = null;
    say(run, 'Your nerve breaks. Security walks you out.');
    emit(run, 'dead');
  }
}

function rollFace(run) {
  const die = d6(run);
  run.roll = { n: (run.roll?.n ?? 0) + 1, die, face: run.die[die - 1] };
  return die;
}

export function move(run, k) {
  run.events = [];
  if (!canMove(run, k)) return run;
  run.prev = run.pos;
  run.pos = k;
  reveal(run.rooms, k);
  emit(run, 'move');
  const room = run.rooms[k];
  if (room.kind === 'guard') {
    run.combat = { face: null };
    say(run, `${room.foe.name} steps in your way.`);
    emit(run, 'encounter');
  } else if (room.kind === 'safe') {
    room.kind = 'empty';
    const offer = { ...LOOT[run.floor - 1][d6(run) - 1] };
    run.offer = offer;
    say(run, `You crack a safe: a ${faceText(offer)} face.`);
    emit(run, 'loot');
  } else if (room.kind === 'alarm') {
    room.kind = 'tripped';
    const die = rollFace(run);
    const face = run.die[die - 1];
    const safe = face.kind === 'block' || face.kind === 'parry';
    run.roll.kind = 'alarm';
    run.roll.ok = safe;
    if (safe) {
      say(run, `An alarm beam. You roll ${faceText(face)} and slip past it.`);
      emit(run, 'disarm');
    } else {
      say(run, `An alarm beam. You roll ${faceText(face)} and the guards rough you up: −2 Nerve.`);
      hurt(run, 2);
    }
  } else if (room.kind === 'bar') {
    room.kind = 'empty';
    const before = run.nerve;
    run.nerve = Math.min(run.maxNerve, run.nerve + 4);
    say(run, `A stiff drink at the bar: +${run.nerve - before} Nerve.`);
    emit(run, 'heal');
  }
  return run;
}

export function descend(run) {
  run.events = [];
  if (mode(run) !== 'explore' || run.rooms[run.pos].kind !== 'elevator') return run;
  enterFloor(run, run.floor + 1);
  say(run, `The elevator opens on ${FLOOR_NAMES[run.floor - 1].toLowerCase()}.`);
  if (RULES.elevatorHeals) run.nerve = run.maxNerve;
  emit(run, 'descend');
  return run;
}

/** Roll the die in a fight. The face waits for you to keep it or reroll. */
export function roll(run) {
  run.events = [];
  if (mode(run) !== 'fight') return run;
  run.combat.face = rollFace(run) - 1;
  run.roll.kind = 'fight';
  return run;
}

/** Spend a chip to reroll the face you just rolled. */
export function reroll(run) {
  run.events = [];
  if (mode(run) !== 'decide' || run.chips < 1) return run;
  run.chips -= 1;
  run.combat.face = rollFace(run) - 1;
  run.roll.kind = 'fight';
  run.roll.rerolled = true;
  emit(run, 'reroll');
  return run;
}

/** Keep the rolled face: it happens, then the guard hits unless you blocked. */
export function keep(run) {
  run.events = [];
  if (mode(run) !== 'decide') return run;
  const room = run.rooms[run.pos];
  const { foe } = room;
  const face = run.die[run.combat.face];
  run.combat.face = null;
  let blocked = false;
  if (face.kind === 'hit' || face.kind === 'parry') {
    foe.hp = Math.max(0, foe.hp - face.n);
    say(run, `${faceText(face)}: ${foe.name} −${face.n}.`);
    emit(run, 'hit');
  }
  if (face.kind === 'block' || face.kind === 'parry') blocked = true;
  if (face.kind === 'heal') {
    const before = run.nerve;
    run.nerve = Math.min(run.maxNerve, run.nerve + face.n);
    say(run, `${faceText(face)}: +${run.nerve - before} Nerve.`);
    emit(run, 'heal');
  }
  if (face.kind === 'chip') {
    gainChips(run, face.n);
    say(run, `${faceText(face)}.`);
    emit(run, 'chip');
  }
  if (face.kind === 'blank') say(run, 'Blank. Nothing happens.');
  if (foe.hp === 0) return beat(run, room);
  if (blocked) {
    say(run, `You block the ${foe.name}.`);
    emit(run, 'block');
  } else {
    say(run, `The ${foe.name} hits you: −${foe.dmg} Nerve.`);
    hurt(run, foe.dmg);
  }
  return run;
}

function beat(run, room) {
  const { foe } = room;
  room.kind = 'empty';
  room.foe = null;
  run.combat = null;
  emit(run, 'kill');
  if (foe.boss) {
    run.over = 'won';
    gainChips(run, 10);
    say(run, 'The House folds. You walk out rich: +10 chips.');
    emit(run, 'won');
    return run;
  }
  const pay = run.floor;
  gainChips(run, pay);
  say(run, `${foe.name} is out cold. +${pay} chip${pay > 1 ? 's' : ''}.`);
  return run;
}

/** Put the offered face on the die in place of face `slot` (0-5), or skip with null. */
export function takeFace(run, slot) {
  run.events = [];
  if (mode(run) !== 'offer') return run;
  const offer = run.offer;
  run.offer = null;
  if (slot == null) {
    say(run, 'You leave it.');
    return run;
  }
  say(run, `Face ${slot + 1} is now ${faceText(offer)} (was ${faceText(run.die[slot])}).`);
  run.die[slot] = offer;
  emit(run, 'equip');
  return run;
}

/** Banks the run's chips into the profile. */
export function settle(p, run) {
  p.chips += run.chips;
  p.runs += 1;
  if (run.over === 'won') p.wins += 1;
  return p;
}
