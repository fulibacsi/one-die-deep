# One Die Deep

A small dungeon crawler where every random event is one roll of a six-sided die.
Three stats, three classes, level-ups, skills and random loot, drawn as abstract
shapes on graph paper.

## Play

The game is plain ES modules with no build step. Serve the folder and open it:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` straight from disk does not
work, because browsers block module imports from `file://`.

Keys: arrows move, Space attacks, 1–3 use skills (or pick a stat on level-up),
F flees, P drinks a potion, D descends, E / L equip or leave loot.
Click or tap a room you can see to walk there through the rooms you've explored.

## Rules

- **One roll, two checks.** Each combat round you roll one d6. Roll + **Might** ≥
  the foe's Defense: you hit. Roll + **Grit** ≥ the foe's Attack: you block. A 1
  always fails both; a 6 always succeeds and crits (double damage). A hit that
  kills means the foe cannot hit back.
- **Wits** is your Focus pool. Every skill costs 1 Focus. Focus refills on each
  new floor, at shrines and on level-up. Wits is also added to trap rolls and to
  Mage spells.
- **HP** comes from your class plus 2 per level, so the sheet holds only three stats.
- **Classes.** Each class is built on one main stat, its highest at the start, and
  has three skills, learned at levels 1, 2 and 4.
  - Warrior, Might: you hit hard. 9 HP, Might 3, Grit 2, Wits 1. Smash, Rally, Berserk.
  - Rogue, Grit: you avoid and retaliate. 5 HP, Might 2, Grit 3, Wits 2. Counter
    (every block deals 2 back for the fight), Riposte (this roll hits only if it
    blocks, ignoring Defense), Shadowstep (this roll cannot hurt you; a hit crits).
  - Mage, Wits: your mana is your weapon. 10 HP, Might 2, Grit 2, Wits 4. Firebolt,
    Frost, Ward. Spells hit with Wits.
- **Level-up:** +1 to a stat of your choice, HP and Focus refill.
- **Dungeon:** six floors of nine rooms on a 5×5 grid. Rooms next to you are
  revealed, except traps. Room contents, monsters and loot come from d6 tables in
  `src/rules.js`. The Hollow King waits on floor 6.

## Code

- `src/rules.js`: every number and table. Balance changes go here.
- `src/game.js`: the engine. Plain-data state (including the die's seed), so runs
  are reproducible and can be simulated headless.
- `src/ui.js` and `index.html`: the browser view.
- `src/sound.js`: every sound effect as a ZzFX parameter list. Paste one into the
  [ZzFX designer](https://killedbyapixel.github.io/ZzFX/) to hear and tweak it.
  Sound starts after the first click or key press; the header toggle mutes it and
  is remembered per browser.
- `src/vendor/ZzFX.js`: [ZzFX](https://github.com/KilledByAPixel/ZzFX) 1.4.0 by
  Frank Force, MIT licence, unmodified.
- `tests/game.test.js`: engine tests (`npm test`).
- `tests/balance/`: a bot and a simulation (`npm run balance`). It prints win rate,
  fight length and deaths per floor for each class, and win rate per level-up
  order, which shows whether one stat dominates.
