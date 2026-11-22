// The game engine: plain data in, plain data out. Every action mutates the
// state object and returns it. The state is JSON-serializable, including the
// die's seed, so a run can be saved, replayed or simulated headless.
//
// Each action also replaces state.events with what it caused, in order
// (hit, hurt, kill, levelup, ...), for the view to animate and sound out.
import * as R from './rules.js';

const LOG_SIZE = 40;
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------- the die ----------

// mulberry32, stepped on the seed stored in the state.
function rand(state) {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function d6(state) {
  return 1 + Math.floor(rand(state) * 6);
}

function onTable(state, table) {
  return table[d6(state) - 1];
}

// A natural 1 always fails and a natural 6 always succeeds.
function passes(die, total, target) {
  return die !== 1 && (die === 6 || total >= target);
}

// ---------- hero ----------

export function stat(state, name) {
  const { hero } = state;
  let value = hero.stats[name];
  for (const item of Object.values(hero.gear)) if (item) value += item.bonus[name] ?? 0;
  return value;
}

export const maxHp = (state) =>
  R.CLASSES[state.classId].hp + R.HP_PER_LEVEL * (state.hero.level - 1);
export const maxFocus = (state) => stat(state, 'wits');

export function mode(state) {
  if (state.over) return state.over;
  if (state.prompts.length) return state.prompts[0].type;
  if (state.combat) return 'combat';
  return 'explore';
}

export function newGame(classId, seed = Date.now()) {
  const cls = R.CLASSES[classId];
  if (!cls) throw new Error(`Unknown class: ${classId}`);
  const state = {
    seed: seed >>> 0,
    classId,
    hero: {
      level: 1,
      xp: 0,
      hp: 0,
      focus: 0,
      stats: { ...cls.stats },
      gear: { weapon: null, armor: null, charm: null },
      potions: R.START_POTIONS,
      skills: [cls.skills[0]],
    },
    floor: 0,
    rooms: {},
    pos: null,
    prev: null,
    combat: null,
    prompts: [],
    roll: null,
    events: [],
    log: [],
    over: null,
    tally: { kills: 0, rounds: 0, fights: 0 },
  };
  state.hero.hp = maxHp(state);
  state.hero.focus = maxFocus(state);
  enterFloor(state, 1);
  say(state, `You enter the dungeon as a ${cls.name}.`);
  return state;
}

const a = (word) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

function emit(state, type, data) {
  state.events.push({ type, ...data });
}

// Called first by every action: events describe only the latest action.
function begin(state) {
  state.events = [];
}

function say(state, text) {
  state.log.push(text);
  if (state.log.length > LOG_SIZE) state.log.shift();
}

function record(state, roll) {
  state.roll = { n: (state.roll?.n ?? 0) + 1, ...roll };
}

function heal(state, amount, source) {
  const before = state.hero.hp;
  state.hero.hp = Math.min(maxHp(state), state.hero.hp + amount);
  emit(state, 'heal', { amount: state.hero.hp - before, source });
  return state.hero.hp - before;
}

function hurt(state, amount) {
  state.hero.hp -= amount;
  emit(state, 'hurt', { amount });
  if (state.hero.hp <= 0) {
    state.hero.hp = 0;
    state.over = 'dead';
    state.combat = null;
    say(state, 'You die.');
    emit(state, 'dead');
  }
}

function gainXp(state, amount) {
  const { hero } = state;
  hero.xp += amount;
  while (hero.xp >= R.xpToLevel(hero.level)) {
    hero.xp -= R.xpToLevel(hero.level);
    hero.level += 1;
    state.prompts.push({ type: 'levelup', level: hero.level });
    emit(state, 'levelup', { level: hero.level });
  }
}

/** Resolves a level-up prompt: +1 to one stat, full HP and Focus. */
export function chooseStat(state, name) {
  begin(state);
  if (mode(state) !== 'levelup' || !R.STATS.includes(name)) return state;
  const { level } = state.prompts.shift();
  const { hero } = state;
  hero.stats[name] += 1;
  const unlock = R.SKILL_LEVELS.indexOf(level);
  if (unlock > 0) hero.skills.push(R.CLASSES[state.classId].skills[unlock]);
  hero.hp = maxHp(state);
  hero.focus = maxFocus(state);
  say(state, `Level ${level}: +1 ${name}.`);
  emit(state, 'stat', { stat: name, skill: unlock > 0 ? hero.skills.at(-1) : null });
  return state;
}

export function drinkPotion(state) {
  begin(state);
  const m = mode(state);
  if ((m !== 'explore' && m !== 'combat') || state.hero.potions < 1) return state;
  if (state.hero.hp >= maxHp(state)) return state;
  state.hero.potions -= 1;
  say(state, `You drink a potion: +${heal(state, R.POTION_HEAL, 'potion')} HP.`);
  return state;
}

// ---------- map ----------

export const key = (x, y) => `${x},${y}`;

export function neighbors(state, k) {
  const { x, y } = state.rooms[k];
  return R.DIRECTIONS.map(([dx, dy]) => key(x + dx, y + dy)).filter((n) => state.rooms[n]);
}

function distances(state, from) {
  const dist = { [from]: 0 };
  const queue = [from];
  while (queue.length) {
    const k = queue.shift();
    for (const n of neighbors(state, k)) {
      if (!(n in dist)) {
        dist[n] = dist[k] + 1;
        queue.push(n);
      }
    }
  }
  return dist;
}

function makeMonster(state, floor) {
  const die = d6(state);
  const base = R.BESTIARY[floor - 1][R.MONSTER_TABLE[die - 1]];
  const elite = die === 6;
  const hp = base.hp + (elite ? R.ELITE.hp : 0);
  return {
    name: elite ? `Elite ${base.name}` : base.name,
    attack: base.attack + (elite ? R.ELITE.attack : 0),
    defense: base.defense + (elite ? R.ELITE.defense : 0),
    hp,
    maxHp: hp,
    dmg: base.dmg,
    xp: floor + (elite ? R.ELITE.xp : 0),
    elite,
    boss: false,
  };
}

function makeBoss() {
  return { ...R.BOSS, maxHp: R.BOSS.hp, xp: 0, elite: false, boss: true };
}

function enterFloor(state, floor) {
  state.floor = floor;
  state.rooms = {};
  const order = [];
  const add = (x, y) => {
    const k = key(x, y);
    if (!state.rooms[k]) {
      state.rooms[k] = { x, y, kind: 'empty', seen: false, visited: false, enemy: null };
      order.push(k);
    }
  };
  let x = Math.floor(R.GRID / 2);
  let y = x;
  add(x, y);
  while (order.length < R.ROOMS_PER_FLOOR) {
    const die = d6(state);
    if (die > R.DIRECTIONS.length) continue;
    const [dx, dy] = R.DIRECTIONS[die - 1];
    if (x + dx < 0 || y + dy < 0 || x + dx >= R.GRID || y + dy >= R.GRID) continue;
    x += dx;
    y += dy;
    add(x, y);
  }

  const start = order[0];
  const dist = distances(state, start);
  const exit = order.reduce((a, b) => (dist[b] > dist[a] ? b : a));
  for (const k of order.slice(1)) {
    const room = state.rooms[k];
    if (k === exit) {
      room.kind = floor === R.FLOORS ? 'boss' : 'stairs';
      if (room.kind === 'boss') room.enemy = makeBoss();
      continue;
    }
    room.kind = onTable(state, R.ROOM_TABLE);
    if (room.kind === 'special') room.kind = onTable(state, R.SPECIAL_TABLE);
    if (room.kind === 'monster') room.enemy = makeMonster(state, floor);
  }

  state.pos = start;
  state.prev = null;
  state.hero.focus = maxFocus(state);
  visit(state, start);
}

function visit(state, k) {
  const room = state.rooms[k];
  room.visited = true;
  room.seen = true;
  for (const n of neighbors(state, k)) state.rooms[n].seen = true;
}

export function canMove(state, k) {
  return mode(state) === 'explore' && k in state.rooms && neighbors(state, state.pos).includes(k);
}

export function move(state, k) {
  begin(state);
  if (!canMove(state, k)) return state;
  state.prev = state.pos;
  state.pos = k;
  visit(state, k);
  emit(state, 'move', { from: state.prev, to: k });
  enterRoom(state, state.rooms[k]);
  return state;
}

function enterRoom(state, room) {
  switch (room.kind) {
    case 'monster':
    case 'boss':
      state.combat = { fight: { attack: 0, defense: 0, dmg: 0, poison: 0, ward: 0 } };
      state.tally.fights += 1;
      say(state, `${cap(a(room.enemy.name))} blocks the way.`);
      emit(state, 'encounter', { boss: room.enemy.boss });
      break;
    case 'chest':
      room.kind = 'empty';
      say(state, 'You open a chest.');
      emit(state, 'chest');
      rollLoot(state);
      break;
    case 'trap': {
      // Spotted or sprung, a trap is spent and stays on the map as disarmed.
      room.kind = 'disarmed';
      const die = d6(state);
      const wits = stat(state, 'wits');
      const target = R.trapRating(state.floor);
      const ok = passes(die, die + wits, target);
      record(state, {
        kind: 'trap',
        die,
        checks: [{ label: 'Spot', parts: [['Wits', wits]], total: die + wits, target, targetLabel: 'Trap', ok }],
        taken: ok ? 0 : R.trapDamage(state.floor),
      });
      emit(state, 'trap', { ok });
      if (ok) say(state, 'You spot a trap and disarm it.');
      else {
        say(state, `A trap springs: −${state.roll.taken} HP.`);
        hurt(state, state.roll.taken);
      }
      break;
    }
    case 'shrine':
      room.kind = 'empty';
      state.hero.hp = maxHp(state);
      state.hero.focus = maxFocus(state);
      say(state, 'A shrine restores your HP and Focus.');
      emit(state, 'shrine');
      break;
    case 'stairs':
      say(state, 'Stairs lead down.');
      break;
  }
}

export function descend(state) {
  begin(state);
  if (mode(state) !== 'explore' || state.rooms[state.pos].kind !== 'stairs') return state;
  enterFloor(state, state.floor + 1);
  say(state, `You descend to floor ${state.floor}.`);
  emit(state, 'descend', { floor: state.floor });
  return state;
}

// ---------- combat ----------

export function enemy(state) {
  return state.combat ? state.rooms[state.pos].enemy : null;
}

function leaveFight(state) {
  emit(state, 'escape', { from: state.pos, to: state.prev });
  state.combat = null;
  state.pos = state.prev;
  state.prev = null;
}

/**
 * One round, one die. The roll is checked twice: plus Might (or the skill's
 * stat) against the foe's Defense, and plus Grit against the foe's Attack.
 */
function strike(state, { stat: hitStat = 'might', bonus = 0, critOn = 6, dmg = 0 } = {}, label) {
  const foe = enemy(state);
  const { fight } = state.combat;
  const die = d6(state);
  const hitBase = stat(state, hitStat);
  const grit = stat(state, 'grit');
  const defense = foe.defense + fight.defense;
  const attack = foe.attack + fight.attack;
  const crit = die >= critOn;
  const hit = crit || passes(die, die + hitBase + bonus, defense);
  const blocked = passes(die, die + grit, attack);

  const hitParts = [[cap(hitStat), hitBase]];
  if (bonus) hitParts.push([label, bonus]);
  state.tally.rounds += 1;

  let damage = 0;
  if (hit) {
    damage = (1 + dmg + fight.dmg) * (crit ? 2 : 1);
    foe.hp = Math.max(0, foe.hp - damage);
    say(state, `${crit ? 'Critical! ' : ''}You hit the ${foe.name} for ${damage}.`);
    emit(state, 'hit', { damage, crit });
  } else {
    say(state, 'You miss.');
    emit(state, 'miss');
  }
  let guard = blocked ? 'blocked' : 'hurt';
  if (!blocked && foe.hp > 0 && fight.ward > 0) {
    fight.ward -= 1;
    guard = 'warded';
  }
  if (foe.hp === 0) guard = 'none';
  else if (guard === 'blocked') {
    say(state, `You block the ${foe.name}.`);
    emit(state, 'block');
  } else if (guard === 'warded') {
    say(state, `Your ward stops the ${foe.name}.`);
    emit(state, 'ward');
  }
  else say(state, `The ${foe.name} hits you for ${foe.dmg}.`);

  record(state, {
    kind: 'attack',
    die,
    checks: [
      { label: 'Hit', parts: hitParts, total: die + hitBase + bonus, target: defense, targetLabel: 'Defense', ok: hit, crit },
      { label: 'Block', parts: [['Grit', grit]], total: die + grit, target: attack, targetLabel: 'Attack', ok: guard !== 'hurt', ward: guard === 'warded', skipped: guard === 'none' },
    ],
    damage,
    taken: guard === 'hurt' ? foe.dmg : 0,
  });
  if (guard === 'hurt') hurt(state, foe.dmg);

  if (!state.over && foe.hp > 0 && fight.poison) {
    foe.hp = Math.max(0, foe.hp - fight.poison);
    say(state, `Poison: the ${foe.name} loses ${fight.poison}.`);
    emit(state, 'poison', { damage: fight.poison });
  }
  if (!state.over && foe.hp === 0) win(state, foe);
  return state;
}

function win(state, foe) {
  const room = state.rooms[state.pos];
  room.kind = 'empty';
  room.enemy = null;
  state.combat = null;
  state.tally.kills += 1;
  emit(state, 'kill', { at: state.pos, boss: foe.boss, elite: foe.elite });
  if (foe.boss) {
    state.over = 'won';
    say(state, `The ${foe.name} falls. You win!`);
    emit(state, 'won');
    return;
  }
  say(state, `The ${foe.name} dies. +${foe.xp} XP.`);
  gainXp(state, foe.xp);
  if (foe.elite) rollLoot(state);
}

export function attack(state) {
  begin(state);
  if (mode(state) !== 'combat') return state;
  return strike(state);
}

export function useSkill(state, id) {
  begin(state);
  const { hero } = state;
  if (mode(state) !== 'combat' || !hero.skills.includes(id) || hero.focus < 1) return state;
  const skill = R.SKILLS[id];
  hero.focus -= 1;
  emit(state, 'skill', { id });
  if (skill.escape) {
    say(state, `${skill.name}: you slip away.`);
    leaveFight(state);
    return state;
  }
  if (skill.heal) say(state, `${skill.name}: +${heal(state, skill.heal, 'skill')} HP.`);
  else say(state, `${skill.name}!`);
  for (const [k, v] of Object.entries(skill.fight ?? {})) state.combat.fight[k] += v;
  return strike(state, skill.roll, skill.name);
}

/** Roll + Grit must meet the foe's Attack to get away. Fail and it hits you. */
export function flee(state) {
  begin(state);
  if (mode(state) !== 'combat') return state;
  const foe = enemy(state);
  const die = d6(state);
  const grit = stat(state, 'grit');
  const attack = foe.attack + state.combat.fight.attack;
  const ok = passes(die, die + grit, attack);
  record(state, {
    kind: 'flee',
    die,
    checks: [{ label: 'Flee', parts: [['Grit', grit]], total: die + grit, target: attack, targetLabel: 'Attack', ok }],
    taken: ok ? 0 : foe.dmg,
  });
  if (ok) {
    say(state, `You flee from the ${foe.name}.`);
    leaveFight(state);
  } else {
    say(state, `You fail to flee. The ${foe.name} hits you for ${foe.dmg}.`);
    hurt(state, foe.dmg);
  }
  return state;
}

// ---------- loot ----------

function makeItem(state, slot, rare) {
  const def = R.SLOTS[slot];
  const tier = Math.min(R.itemTier(state.floor) + (rare ? 1 : 0), def.names.length);
  const bonus = { [def.stat]: tier };
  let name = def.names[tier - 1];
  if (rare) {
    const extra = onTable(state, R.STAT_TABLE);
    bonus[extra] = (bonus[extra] ?? 0) + 1;
    name = `${R.RARE_PREFIX[extra]} ${name}`;
  }
  return { slot, name, bonus, rare };
}

function rollLoot(state) {
  const die = d6(state);
  const found = R.LOOT_TABLE[die - 1];
  record(state, { kind: 'loot', die, found });
  emit(state, 'loot', { found });
  if (found === 'potion') {
    if (state.hero.potions < R.MAX_POTIONS) {
      state.hero.potions += 1;
      say(state, 'You find a potion.');
    } else {
      say(state, 'You find a potion, but your belt is full.');
    }
    return;
  }
  const slot = found === 'rare' ? onTable(state, R.SLOT_TABLE) : found;
  const item = makeItem(state, slot, found === 'rare');
  say(state, `You find ${a(item.rare ? `rare ${item.name}` : item.name)}.`);
  state.prompts.push({ type: 'loot', item });
}

/** Equips the offered item, replacing whatever was in its slot. */
export function takeLoot(state) {
  begin(state);
  if (mode(state) !== 'loot') return state;
  const { item } = state.prompts.shift();
  const { hero } = state;
  const focusBefore = maxFocus(state);
  hero.gear[item.slot] = item;
  hero.focus = Math.max(0, Math.min(maxFocus(state), hero.focus + maxFocus(state) - focusBefore));
  say(state, `You equip the ${item.name}.`);
  emit(state, 'equip', { slot: item.slot });
  return state;
}

export function leaveLoot(state) {
  begin(state);
  if (mode(state) !== 'loot') return state;
  const { item } = state.prompts.shift();
  say(state, `You leave the ${item.name}.`);
  emit(state, 'discard');
  return state;
}
