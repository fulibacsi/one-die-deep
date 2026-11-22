// Plays many bot runs per class and prints how far they get.
// Usage: node tests/balance/simulate.js [runs per class, default 2000]
import { GROWTH, play } from './bot.js';
import { CLASSES, FLOORS, STATS } from '../../src/rules.js';

const runs = Number(process.argv[2] ?? 2000);
const classes = Object.keys(CLASSES);
const pct = (n) => `${((100 * n) / runs).toFixed(0)}%`.padStart(4);

function sample(classId) {
  const r = { wins: 0, levels: 0, rounds: 0, fights: 0, deaths: Array(FLOORS).fill(0) };
  for (let seed = 1; seed <= runs; seed++) {
    const s = play(classId, seed);
    if (s.over === 'won') r.wins += 1;
    else r.deaths[s.floor - 1] += 1;
    r.levels += s.hero.level;
    r.rounds += s.tally.rounds;
    r.fights += s.tally.fights;
  }
  return r;
}

console.log(`${runs} runs per class, seeds 1..${runs}. Bot level-up order: ${JSON.stringify(GROWTH)}\n`);
console.log(`class     win  level  rounds/fight  deaths on floor 1..${FLOORS}`);
for (const classId of classes) {
  const r = sample(classId);
  console.log(
    `${classId.padEnd(8)} ${pct(r.wins)}  ${(r.levels / runs).toFixed(1).padStart(5)}  ` +
      `${(r.rounds / r.fights).toFixed(1).padStart(12)}  ${r.deaths.map(pct).join(' ')}`,
  );
}

// Win rate when every level-up follows one fixed order. If one order beats
// the rest by a wide margin, the level-up choice is not a real choice.
const orders = [...STATS.map((s) => [s]), ...STATS.flatMap((a, i) => STATS.slice(i + 1).map((b) => [a, b])), STATS];
const best = { ...GROWTH };
console.log(`\nwin rate by level-up order\n${'order'.padEnd(18)}${classes.map((c) => c.padStart(8)).join('')}`);
for (const order of orders) {
  for (const c of classes) GROWTH[c] = order;
  console.log(order.join('+').padEnd(18) + classes.map((c) => pct(sample(c).wins).padStart(8)).join(''));
}
Object.assign(GROWTH, best);
