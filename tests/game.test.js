import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../src/game.js';
import * as R from '../src/rules.js';

// Sets the seed so the next d6 roll shows `face`.
function forceRoll(state, face) {
  for (let seed = 0; ; seed++) {
    if (G.d6({ seed }) === face) {
      state.seed = seed;
      return state;
    }
  }
}

// A warrior standing in a room with a test monster, already in the fight.
function fight(foe = {}, classId = 'warrior') {
  const s = G.newGame(classId, 7);
  const room = s.rooms[s.pos];
  room.kind = 'monster';
  room.enemy = { name: 'Dummy', attack: 6, defense: 5, hp: 3, maxHp: 3, dmg: 1, xp: 1, elite: false, boss: false, ...foe };
  s.combat = { fight: { attack: 0, defense: 0, dmg: 0, poison: 0, ward: 0 } };
  s.prev = G.neighbors(s, s.pos)[0];
  return s;
}

test('the die only shows 1 to 6, each about a sixth of the time', () => {
  const counts = Array(7).fill(0);
  const state = { seed: 123 };
  for (let i = 0; i < 60000; i++) counts[G.d6(state)] += 1;
  assert.equal(counts[0], 0);
  for (let face = 1; face <= 6; face++) assert.ok(Math.abs(counts[face] - 10000) < 400, `face ${face}: ${counts[face]}`);
});

test('a new game starts on floor 1 with a connected map and full HP and Focus', () => {
  const s = G.newGame('rogue', 42);
  assert.equal(s.floor, 1);
  assert.equal(Object.keys(s.rooms).length, R.ROOMS_PER_FLOOR);
  assert.equal(Object.values(s.rooms).filter((r) => r.kind === 'stairs').length, 1);
  assert.ok(s.rooms[s.pos].visited);
  for (const n of G.neighbors(s, s.pos)) assert.ok(s.rooms[n].seen);
  assert.equal(s.hero.hp, R.CLASSES.rogue.hp);
  assert.equal(s.hero.focus, R.CLASSES.rogue.stats.wits);
  assert.equal(G.mode(s), 'explore');
});

test('the same seed and actions give the same run, also after a JSON round trip', () => {
  const play = (s) => {
    for (let i = 0; i < 30 && !s.over; i++) {
      if (G.mode(s) === 'combat') G.attack(s);
      else if (G.mode(s) === 'levelup') G.chooseStat(s, 'might');
      else if (G.mode(s) === 'loot') G.takeLoot(s);
      else G.move(s, G.neighbors(s, s.pos)[i % G.neighbors(s, s.pos).length]);
    }
    return s;
  };
  const a = play(G.newGame('mage', 9));
  const b = play(JSON.parse(JSON.stringify(G.newGame('mage', 9))));
  assert.deepEqual(a, b);
});

test('one roll hits when roll + Might meets Defense, and blocks when roll + Grit meets Attack', () => {
  // Warrior: Might 2, Grit 3. Defense 5 needs a 3; Attack 6 needs a 3.
  const s = forceRoll(fight(), 3);
  G.attack(s);
  assert.equal(G.enemy(s).hp, 2);
  assert.equal(s.hero.hp, R.CLASSES.warrior.hp);
  assert.deepEqual(s.roll.checks.map((c) => c.ok), [true, true]);

  const t = forceRoll(fight(), 2);
  G.attack(t);
  assert.equal(G.enemy(t).hp, 3);
  assert.equal(t.hero.hp, R.CLASSES.warrior.hp - 1);
});

test('a natural 1 always misses and gets hit; a natural 6 always crits and blocks', () => {
  const s = forceRoll(fight({ defense: 1, attack: 1 }), 1);
  s.hero.stats.might = 10;
  s.hero.stats.grit = 10;
  G.attack(s);
  assert.equal(G.enemy(s).hp, 3);
  assert.equal(s.hero.hp, R.CLASSES.warrior.hp - 1);

  const t = forceRoll(fight({ defense: 20, attack: 20, hp: 5 }), 6);
  G.attack(t);
  assert.equal(G.enemy(t).hp, 3, 'crit deals double damage');
  assert.equal(t.hero.hp, R.CLASSES.warrior.hp);
});

test('a killing hit cannot be answered, and the kill grants XP and clears the room', () => {
  const s = forceRoll(fight({ hp: 1, attack: 20 }), 3);
  G.attack(s);
  assert.equal(s.hero.hp, R.CLASSES.warrior.hp);
  assert.equal(G.mode(s), 'explore');
  assert.equal(s.hero.xp, 1);
  assert.equal(s.rooms[s.pos].kind, 'empty');
});

test('skills cost Focus and are refused without it', () => {
  const s = forceRoll(fight({ hp: 5 }), 3);
  G.useSkill(s, 'smash');
  assert.equal(s.hero.focus, 0);
  assert.equal(G.enemy(s).hp, 3, 'Smash hits for 2');
  const before = JSON.stringify({ ...s, events: [] });
  G.useSkill(s, 'smash');
  assert.equal(JSON.stringify(s), before);
});

test('Ward blocks hits and Poison ticks after each roll', () => {
  const s = forceRoll(fight({ hp: 5, defense: 20 }, 'mage'), 2);
  s.hero.skills.push('ward');
  G.useSkill(s, 'ward');
  assert.equal(s.hero.hp, R.CLASSES.mage.hp);
  assert.equal(s.combat.fight.ward, 1);

  const t = forceRoll(fight({ hp: 5, defense: 20 }, 'rogue'), 4);
  t.hero.skills.push('poison');
  G.useSkill(t, 'poison');
  assert.equal(G.enemy(t).hp, 4);
});

test('Vanish: that roll cannot hurt you, even on a 1, and a hit crits', () => {
  const s = forceRoll(fight({ attack: 20, hp: 5 }, 'rogue'), 1);
  s.hero.skills.push('vanish');
  G.useSkill(s, 'vanish');
  assert.equal(s.hero.hp, R.CLASSES.rogue.hp);
  assert.equal(G.enemy(s).hp, 5, 'a 1 still misses');

  const t = forceRoll(fight({ attack: 20, hp: 5 }, 'rogue'), 3);
  t.hero.skills.push('vanish');
  G.useSkill(t, 'vanish');
  assert.equal(G.enemy(t).hp, 3, 'a hit deals double');
  assert.deepEqual(t.events.map((e) => e.type), ['skill', 'hit', 'block']);
  assert.equal(t.events[1].crit, true);
});

test('a successful flee returns you to the room you came from', () => {
  const t = forceRoll(fight(), 6);
  const back = t.prev;
  G.flee(t);
  assert.equal(t.pos, back);
});

test('levelling up asks for a stat, unlocks skills on schedule and restores HP and Focus', () => {
  const s = fight({ hp: 1, xp: R.xpToLevel(1) });
  s.hero.hp = 1;
  s.hero.focus = 0;
  forceRoll(s, 6);
  G.attack(s);
  assert.equal(G.mode(s), 'levelup');
  G.chooseStat(s, 'grit');
  assert.equal(s.hero.level, 2);
  assert.equal(s.hero.stats.grit, R.CLASSES.warrior.stats.grit + 1);
  assert.deepEqual(s.hero.skills, R.CLASSES.warrior.skills.slice(0, 2));
  assert.equal(s.hero.hp, G.maxHp(s));
  assert.equal(G.maxHp(s), R.CLASSES.warrior.hp + R.HP_PER_LEVEL);
  assert.equal(s.hero.focus, G.maxFocus(s));
});

test('loot can be equipped or left; gear adds to stats and Focus', () => {
  const s = G.newGame('mage', 3);
  const item = { slot: 'charm', name: 'Runed Ring', bonus: { wits: 2, might: 1 }, rare: true };
  s.prompts.push({ type: 'loot', item });
  G.takeLoot(s);
  assert.equal(G.stat(s, 'wits'), R.CLASSES.mage.stats.wits + 2);
  assert.equal(G.stat(s, 'might'), R.CLASSES.mage.stats.might + 1);
  assert.equal(s.hero.focus, G.maxFocus(s));

  s.prompts.push({ type: 'loot', item: { ...item, name: 'Other', bonus: { wits: 1 } } });
  G.leaveLoot(s);
  assert.equal(s.hero.gear.charm.name, 'Runed Ring');
});

test('a trap rolls once, then stays on the map as a disarmed trap', () => {
  const s = G.newGame('rogue', 11);
  const start = s.pos;
  const next = G.neighbors(s, start)[0];
  Object.assign(s.rooms[next], { kind: 'trap', enemy: null });
  forceRoll(s, 6);
  G.move(s, next);
  assert.equal(s.roll.kind, 'trap');
  assert.equal(s.rooms[next].kind, 'disarmed');
  const rolls = s.roll.n;
  G.move(s, start);
  G.move(s, next);
  assert.equal(s.roll.n, rolls, 'walking back through does not roll again');
});

test('stairs lead down; the last floor has the boss, and beating it wins', () => {
  const s = G.newGame('warrior', 5);
  const stairs = Object.keys(s.rooms).find((k) => s.rooms[k].kind === 'stairs');
  G.descend(s);
  assert.equal(s.floor, 1, 'cannot descend away from the stairs');
  s.pos = stairs;
  G.descend(s);
  assert.equal(s.floor, 2);

  const last = G.newGame('warrior', 5);
  while (last.floor < R.FLOORS) {
    last.pos = Object.keys(last.rooms).find((k) => last.rooms[k].kind === 'stairs');
    G.descend(last);
  }
  const lair = Object.keys(last.rooms).find((k) => last.rooms[k].kind === 'boss');
  assert.ok(lair);
  last.pos = lair;
  last.rooms[lair].enemy.hp = 1;
  last.combat = { fight: { attack: 0, defense: 0, dmg: 0, poison: 0, ward: 0 } };
  forceRoll(last, 6);
  G.attack(last);
  assert.equal(G.mode(last), 'won');
});

test('each action lists what it caused, in order, and only that', () => {
  const types = (s) => s.events.map((e) => e.type);
  const s = forceRoll(fight({ attack: 20 }), 3);
  G.attack(s);
  assert.deepEqual(types(s), ['hit', 'hurt']);
  forceRoll(s, 6);
  G.attack(s);
  assert.deepEqual(types(s), ['hit', 'kill']);
  assert.deepEqual(s.events[0], { type: 'hit', damage: 2, crit: true });
  G.attack(s);
  assert.deepEqual(types(s), [], 'a refused action causes nothing');

  const t = forceRoll(fight({ hp: 1, xp: R.xpToLevel(1) }), 6);
  G.attack(t);
  assert.deepEqual(types(t), ['hit', 'kill', 'levelup']);
  G.chooseStat(t, 'might');
  assert.deepEqual(t.events, [{ type: 'stat', stat: 'might', skill: R.CLASSES.warrior.skills[1] }]);
});

test('log lines read correctly for armor names and for the boss', () => {
  const s = G.newGame('warrior', 13);
  const next = G.neighbors(s, s.pos)[0];
  Object.assign(s.rooms[next], { kind: 'chest', enemy: null });
  forceRoll(s, R.LOOT_TABLE.indexOf('armor') + 1);
  G.move(s, next);
  assert.equal(s.log.at(-1), `Loot: ${R.SLOTS.armor.names[0]}.`);

  const t = G.newGame('warrior', 13);
  const lair = G.neighbors(t, t.pos)[0];
  Object.assign(t.rooms[lair], { kind: 'boss', enemy: { ...R.BOSS, maxHp: R.BOSS.hp, xp: 0, elite: false, boss: true } });
  G.move(t, lair);
  assert.equal(t.log.at(-1), 'The Hollow King blocks the way.');
  forceRoll(t, 6);
  G.attack(t);
  assert.deepEqual(t.log.slice(-2), ['Critical! You hit the Hollow King for 2.', 'You block the Hollow King.']);
  forceRoll(t, 1);
  G.attack(t);
  assert.equal(t.log.at(-1), 'The Hollow King hits you for 2.');
});

test('running out of HP ends the run', () => {
  const s = forceRoll(fight({ dmg: 99 }), 1);
  G.attack(s);
  assert.equal(G.mode(s), 'dead');
  assert.equal(s.hero.hp, 0);
});
