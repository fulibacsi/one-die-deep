// What a bigger die would do to One Die Deep. For each die it builds a copy of
// the engine in a temporary folder where every check (hit, block, flee, spot a
// trap) rolls that die instead of a d6, and runs the balance bot on it. Room,
// monster and loot tables still roll a d6. A natural 1 still fails, and the
// die's top face still succeeds and crits.
//
// Two ways to fit a bigger die to the game's small numbers:
//   recentred  Stats and targets stay as they are, and the roll is shifted
//              down by (N - 6) / 2, so an average roll lands where a d6's
//              does. A stat point is then worth 1/N of a roll, not 1/6.
//   same odds  The roll is mapped onto the d6's scale, 1 + (die - 1) x 6 / N,
//              the same as growing every stat and target by N/6. Every check
//              then succeeds as often as on a d6 (exactly on a d12, nearly on
//              a d10 or d20), so a stat point keeps its weight. Only the
//              naturals change: 1 and the top face come up 1/N of the time.
// The d6 row must match tests/balance/simulate.js, which checks the copying.
// Usage: node tests/balance/die-size.js [runs per class per order, default 1000]
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runs = Number(process.argv[2] ?? 1000);
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');

// Replaces text that must appear exactly once, so a changed engine fails loudly.
function swap(text, from, to) {
  const found = text.split(from).length - 1;
  if (found !== 1) throw new Error(`Expected one ${JSON.stringify(from)} in src/game.js, found ${found}`);
  return text.replace(from, to);
}

const FIT = {
  recentred: (n) => `total - ${(n - 6) / 2}`,
  'same odds': (n) => `total - die + 1 + ((die - 1) * 6) / ${n}`,
};

function build(sides, fit) {
  let game = read('src/game.js');
  game = swap(game, 'function onTable(state, table) {', `function check(state) {\n  return 1 + Math.floor(rand(state) * ${sides});\n}\n\nfunction onTable(state, table) {`);
  game = swap(game, 'return die !== 1 && (die === 6 || total >= target);', `return die !== 1 && (die === ${sides} || ${FIT[fit](sides)} >= target);`);
  game = swap(game, "const die = d6(state);\n      const wits = stat(state, 'wits');", "const die = check(state);\n      const wits = stat(state, 'wits');");
  game = swap(game, 'const die = d6(state);\n  const hitBase', 'const die = check(state);\n  const hitBase');
  game = swap(game, "const die = d6(state);\n  const grit = stat(state, 'grit');\n  const attack = foe.attack + state.combat", "const die = check(state);\n  const grit = stat(state, 'grit');\n  const attack = foe.attack + state.combat");
  game = swap(game, 'const crit = hit && (die === 6 ||', `const crit = hit && (die === ${sides} ||`);
  const dir = mkdtempSync(join(tmpdir(), 'die-size-'));
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'tests/balance'), { recursive: true });
  writeFileSync(join(dir, 'src/game.js'), game);
  writeFileSync(join(dir, 'src/rules.js'), read('src/rules.js'));
  writeFileSync(join(dir, 'tests/balance/bot.js'), read('tests/balance/bot.js'));
  return dir;
}

const STATS = ['might', 'grit', 'wits'];
const ORDERS = [...STATS.map((s) => [s]), ...STATS.flatMap((a, i) => STATS.slice(i + 1).map((b) => [a, b])), STATS];
const CLASSES = ['warrior', 'rogue', 'mage'];

async function measure(dir) {
  const { GROWTH, play } = await import(pathToFileURL(join(dir, 'tests/balance/bot.js')).href);
  const out = {};
  for (const c of CLASSES) {
    const best = GROWTH[c];
    const sample = (order) => {
      GROWTH[c] = order;
      let wins = 0;
      let rounds = 0;
      let fights = 0;
      for (let seed = 1; seed <= runs; seed++) {
        const s = play(c, seed);
        if (s.over === 'won') wins += 1;
        rounds += s.tally.rounds;
        fights += s.tally.fights;
      }
      return { win: wins / runs, rounds: rounds / fights };
    };
    const main = sample(best);
    const byOrder = ORDERS.map((order) => sample(order).win);
    GROWTH[c] = best;
    out[c] = { win: main.win, rounds: main.rounds, spread: Math.max(...byOrder) - Math.min(...byOrder), worst: Math.min(...byOrder) };
  }
  return out;
}

const pct = (x) => `${Math.round(100 * x)}%`;
const ROWS = [[6, 'recentred'], [10, 'recentred'], [12, 'recentred'], [20, 'recentred'], [10, 'same odds'], [12, 'same odds'], [20, 'same odds']];

console.log(`${runs} runs per class per level-up order, seeds 1..${runs}. Main order: the bot's default (each class's main stat).`);
console.log('A stat point moves a check by 1/N of the die; naturals (1 or N) decide 2/N of checks.\n');
console.log(`${'die'.padEnd(4)}${'fit'.padEnd(11)}${'win: warrior rogue mage'.padEnd(26)}${'rounds/fight'.padEnd(17)}build spread (best - worst order)`);
for (const [sides, fit] of ROWS) {
  const dir = build(sides, fit);
  try {
    const r = await measure(dir);
    const col = (f) => CLASSES.map((c) => f(r[c]).padStart(c.length)).join(' ');
    console.log(
      `d${String(sides).padEnd(3)}${(sides === 6 ? '-' : fit).padEnd(11)}${'     '}${col((x) => pct(x.win))}`.padEnd(41) +
        `${CLASSES.map((c) => r[c].rounds.toFixed(1)).join('/').padEnd(17)}${CLASSES.map((c) => `${c} ${pct(r[c].spread)}`).join(', ')}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
