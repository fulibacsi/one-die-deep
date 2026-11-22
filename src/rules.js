// Every tunable number and table in the game. Tables indexed by a die roll
// have exactly six entries: entry [roll - 1].

// Each combat round is one d6 roll, checked twice:
//   roll + Might >= foe Defense  ->  you hit it
//   roll + Grit  >= foe Attack   ->  you block its hit
export const STATS = ['might', 'grit', 'wits'];
export const STAT_INFO = {
  might: 'Added to your roll to hit.',
  grit: 'Added to your roll to block.',
  wits: 'Your Focus for skills. Added to trap rolls and spells.',
};

export const FLOORS = 6;
export const GRID = 5;
export const ROOMS_PER_FLOOR = 9;
export const START_POTIONS = 1;
export const MAX_POTIONS = 3;
export const POTION_HEAL = 5;
export const HP_PER_LEVEL = 2;
export const SKILL_LEVELS = [1, 2, 4];
export const xpToLevel = (level) => 5 * level;

// Each class is built on one main stat, its highest at the start.
export const CLASSES = {
  warrior: {
    name: 'Warrior',
    main: 'might',
    blurb: 'Might: you hit hard.',
    hp: 9,
    stats: { might: 3, grit: 2, wits: 1 },
    skills: ['smash', 'rally', 'berserk'],
  },
  rogue: {
    name: 'Rogue',
    main: 'grit',
    blurb: 'Grit: you avoid and retaliate.',
    hp: 5,
    stats: { might: 2, grit: 3, wits: 2 },
    skills: ['counter', 'riposte', 'shadowstep'],
  },
  mage: {
    name: 'Mage',
    main: 'wits',
    blurb: 'Wits: your mana is your weapon.',
    hp: 10,
    stats: { might: 2, grit: 2, wits: 4 },
    skills: ['firebolt', 'frost', 'ward'],
  },
};

// A skill costs 1 Focus and changes the roll you make with it.
// roll:   modifiers for this one roll: stat (used to hit), bonus, dmg,
//         riposte (hits exactly when the roll blocks, ignoring Defense),
//         safe (the block always succeeds), critOnHit (any hit is a crit)
// fight:  modifiers that last until the fight ends (attack, defense, dmg, ward,
//         counter: damage dealt back on every block)
// heal:   HP restored before the roll
export const SKILLS = {
  smash: { name: 'Smash', text: '+2 to hit this roll. A hit deals 2.', roll: { bonus: 2, dmg: 1 } },
  rally: { name: 'Rally', text: 'Heal 4 HP, then attack.', heal: 4 },
  berserk: { name: 'Berserk', text: 'Your hits deal +1 for the rest of the fight.', fight: { dmg: 1 } },
  riposte: { name: 'Riposte', text: 'This roll hits only if it blocks, ignoring Defense. A hit deals 2.', roll: { riposte: true, dmg: 1 } },
  counter: { name: 'Counter', text: 'Every block deals 2 back for the rest of the fight.', fight: { counter: 2 } },
  shadowstep: { name: 'Shadowstep', text: 'This roll cannot hurt you, and a hit crits.', roll: { safe: true, critOnHit: true } },
  firebolt: { name: 'Firebolt', text: 'Hit with Wits. A hit deals 2.', roll: { stat: 'wits', dmg: 1 } },
  frost: { name: 'Frost', text: 'Foe Attack −2 this fight. Hit with Wits.', fight: { attack: -2 }, roll: { stat: 'wits' } },
  ward: { name: 'Ward', text: 'Block the next 2 hits this fight. Hit with Wits.', fight: { ward: 2 }, roll: { stat: 'wits' } },
};

// Map layout: a random walk. Rolls of 5 or 6 are rerolled.
export const DIRECTIONS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export const ROOM_TABLE = ['empty', 'monster', 'monster', 'monster', 'chest', 'special'];
export const SPECIAL_TABLE = ['trap', 'trap', 'trap', 'shrine', 'shrine', 'shrine'];

// One row per floor. A 6 makes the third monster an elite.
// attack: what your Grit roll must meet. defense: what your Might roll must meet.
export const MONSTER_TABLE = [0, 0, 1, 1, 2, 2];
const m = (name, attack, defense, hp, dmg = 1) => ({ name, attack, defense, hp, dmg });
export const BESTIARY = [
  [m('Rat', 5, 5, 2), m('Bat', 6, 6, 1), m('Goblin', 6, 5, 3)],
  [m('Kobold', 7, 6, 3), m('Skeleton', 6, 8, 2), m('Slime', 7, 5, 5)],
  [m('Orc', 8, 8, 4), m('Ghoul', 8, 9, 3), m('Spider', 9, 8, 2, 2)],
  [m('Cultist', 9, 9, 4), m('Wraith', 9, 10, 3), m('Troll', 10, 8, 6)],
  [m('Shade', 10, 11, 3, 2), m('Golem', 10, 11, 5), m('Ogre', 11, 9, 6, 2)],
  [m('Knight', 11, 11, 5, 2), m('Lich', 11, 12, 4, 2), m('Demon', 12, 10, 6, 2)],
];
export const ELITE = { attack: 1, defense: 1, hp: 2, xp: 2 };
export const BOSS = m('The Hollow King', 12, 12, 12, 2);

export const trapRating = (floor) => 3 + floor;
export const trapDamage = (floor) => 1 + Math.ceil(floor / 3);

export const LOOT_TABLE = ['potion', 'potion', 'weapon', 'armor', 'charm', 'rare'];
export const SLOT_TABLE = ['weapon', 'weapon', 'armor', 'armor', 'charm', 'charm'];
export const STAT_TABLE = ['might', 'might', 'grit', 'grit', 'wits', 'wits'];
export const SLOTS = {
  weapon: { stat: 'might', names: ['Dagger', 'Sword', 'Axe', 'Warblade'] },
  armor: { stat: 'grit', names: ['Leathers', 'Chainmail', 'Plate', 'Bulwark'] },
  charm: { stat: 'wits', names: ['Ring', 'Amulet', 'Talisman', 'Crown'] },
};
export const itemTier = (floor) => 1 + Math.floor((floor - 1) / 3);
export const RARE_PREFIX = { might: 'Brutal', grit: 'Stout', wits: 'Runed' };
