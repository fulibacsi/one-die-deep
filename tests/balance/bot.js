// A plain, greedy bot: clears every room on a floor, then takes the stairs.
// It plays worse than a careful human, so its win rate is a floor, not a target.
import * as G from '../../src/game.js';

// Level-up order per class, repeated. These are each class's best simple
// order in the growth grid printed by simulate.js.
export const GROWTH = {
  warrior: ['might'],
  rogue: ['might'],
  mage: ['wits'],
};

// How much the bot values one point of each stat on gear.
const VALUE = {
  warrior: { might: 3, grit: 2, wits: 1 },
  rogue: { might: 3, grit: 2, wits: 2 },
  mage: { might: 1, grit: 2, wits: 3 },
};

// When the bot spends Focus on a skill.
const WANTS = {
  smash: (s, foe) => foe.hp >= 2,
  rally: (s) => s.hero.hp <= G.maxHp(s) - 4,
  berserk: (s, foe) => foe.hp >= 4 && s.combat.fight.dmg === 0,
  backstab: (s, foe) => foe.hp >= 2,
  vanish: (s, foe) => s.hero.hp <= foe.dmg && s.hero.potions === 0,
  poison: (s, foe) => foe.hp >= 3 && s.combat.fight.poison === 0,
  firebolt: () => true,
  frost: (s, foe) => foe.hp >= 3 && s.combat.fight.attack === 0,
  ward: (s, foe) => foe.hp >= 3 && s.combat.fight.ward === 0,
};

const itemValue = (s, item) =>
  item ? Object.entries(item.bonus).reduce((sum, [k, v]) => sum + VALUE[s.classId][k] * v, 0) : 0;

function fight(s) {
  const foe = G.enemy(s);
  const { hero } = s;
  if (hero.hp <= foe.dmg && hero.potions > 0) return G.drinkPotion(s);
  if (hero.focus > 0) {
    // Newest skills first: they are the strongest.
    const skill = [...hero.skills].reverse().find((id) => WANTS[id](s, foe));
    if (skill) return G.useSkill(s, skill);
  }
  // No plain fleeing: with no HP regen, a bot that flees just walks back in.
  return G.attack(s);
}

// Next step on the shortest path to the nearest room matching `goal`,
// walking only through rooms that are already safe.
function stepToward(s, goal) {
  const seen = new Set([s.pos]);
  const queue = [[s.pos, null]];
  while (queue.length) {
    const [k, first] = queue.shift();
    for (const n of G.neighbors(s, k)) {
      if (seen.has(n)) continue;
      seen.add(n);
      const room = s.rooms[n];
      if (goal(room, n)) return first ?? n;
      const safe = room.visited && room.kind !== 'monster';
      if (safe) queue.push([n, first ?? n]);
    }
  }
  return null;
}

function explore(s) {
  const { hero } = s;
  if (hero.hp <= G.maxHp(s) / 3 && hero.potions > 0) return G.drinkPotion(s);
  const hostile = (room) => room.kind === 'monster' || room.kind === 'boss';
  const healthy = hero.hp > G.maxHp(s) / 2;
  // Explore everything, then finish fights it escaped from if healthy, then leave.
  const next = stepToward(s, (room) => !room.visited) ?? (healthy ? stepToward(s, hostile) : null);
  if (next) return G.move(s, next);
  if (s.rooms[s.pos].kind === 'stairs') return G.descend(s);
  return G.move(s, stepToward(s, (room) => room.kind === 'stairs') ?? stepToward(s, hostile));
}

export function step(s) {
  switch (G.mode(s)) {
    case 'levelup': {
      const order = GROWTH[s.classId];
      return G.chooseStat(s, order[(s.hero.level - 2) % order.length]);
    }
    case 'loot': {
      const { item } = s.prompts[0];
      return itemValue(s, item) > itemValue(s, s.hero.gear[item.slot]) ? G.takeLoot(s) : G.leaveLoot(s);
    }
    case 'combat':
      return fight(s);
    default:
      return explore(s);
  }
}

export function play(classId, seed) {
  const s = G.newGame(classId, seed);
  for (let i = 0; i < 10000 && !s.over; i++) step(s);
  if (!s.over) throw new Error(`Bot stalled: ${classId} seed ${seed}`);
  return s;
}

