// NETDIVE: dives to crack the Core, for each Bias-shift variant and two
// players: a careful bot (picks the attack that strips the most layers per
// cycle it expects to spend) and a random one. The gap between them shows how
// much the choice of attack matters. Also: how attacks turn out by number of
// hits, and how often the choice is a real one, where neither attack is at
// least as likely as the other to get 1, 2 and 3 hits.
// Usage: node tests/balance/prototypes/netdive.js [profiles, default 300]
import * as N from '../../../design/prototypes/netdive/engine.js';
import { neighbors } from '../../../design/prototypes/shared/dice.js';

const profiles = Number(process.argv[2] ?? 300);
const CAP = 200;

function stepToward(dive, goal) {
  const seen = new Set([dive.pos]);
  const queue = [[dive.pos, null]];
  while (queue.length) {
    const [k, first] = queue.shift();
    for (const n of neighbors(dive.rooms, k)) {
      if (seen.has(n)) continue;
      seen.add(n);
      const node = dive.rooms[n];
      if (!node.seen) continue;
      if (goal(node)) return first ?? n;
      if (node.visited && node.kind !== 'ice') queue.push([n, first ?? n]);
    }
  }
  return null;
}

// Chance of at least 1, 2 and 3 hits for an attack at the dive's current Bias.
function atLeast(dive, approach) {
  let faces = 0;
  for (let die = 1; die <= 6; die++) if (N.hits(dive, approach, die)) faces += 1;
  const p = faces / 6;
  const n = dive.dice[approach];
  const exactly = (k) => (k > n ? 0 : choose(n, k) * p ** k * (1 - p) ** (n - k));
  return [1, 2, 3].map((k) => [1, 2, 3].filter((j) => j >= k).reduce((sum, j) => sum + exactly(j), 0));
}
const choose = (n, k) => (k === 0 ? 1 : (n * choose(n - 1, k - 1)) / k);

// Layers stripped per cycle the attack is expected to cost.
function worth(dive, approach, ice) {
  const [one, two, three] = atLeast(dive, approach);
  const layers = one + three; // 1 or 2 hits strip one layer, 3 strip two
  const hitBack = 1 - two;
  return layers / (1 + hitBack * ice.counter);
}

const POLICIES = {
  careful: (dive, ice) => (worth(dive, 'break', ice) >= worth(dive, 'spoof', ice) ? 'break' : 'spoof'),
  random: () => (Math.random() < 0.5 ? 'break' : 'spoof'),
};

function choiceKind(dive) {
  const b = atLeast(dive, 'break');
  const s = atLeast(dive, 'spoof');
  const eps = 1e-9;
  if (b.every((x, i) => Math.abs(x - s[i]) < eps)) return 'same';
  if (b.every((x, i) => x >= s[i] - eps) || s.every((x, i) => x >= b[i] - eps)) return 'dominated';
  return 'tradeoff';
}

function playDive(p, seed, policy, stats) {
  const dive = N.startDive(p, seed);
  const go = (k) => {
    stats.moves += 1;
    if (dive.rooms[k].visited) stats.backtracks += 1;
    N.move(dive, k);
  };
  for (let i = 0; i < 500 && !dive.over; i++) {
    if (N.mode(dive) === 'ice') {
      const ice = dive.rooms[dive.engaged].ice;
      if (dive.bias === N.BIAS_MIN || dive.bias === N.BIAS_MAX) stats.extreme += 1;
      stats[choiceKind(dive)] += 1;
      N.attempt(dive, POLICIES[policy](dive, ice));
      stats.attempts += 1;
      stats[dive.roll.outcome] += 1;
      continue;
    }
    const here = dive.rooms[dive.pos];
    const next = dive.cycles < 6 ? null : stepToward(dive, (n) => !n.visited);
    if (next) go(next);
    else if (here.kind === 'uplink') N.descend(dive);
    else {
      const to = stepToward(dive, (n) => n.kind === 'uplink' || n.ice?.core) ?? stepToward(dive, (n) => !n.visited);
      if (to) go(to);
      else N.jackOut(dive);
    }
  }
  if (!dive.over) N.jackOut(dive);
  return dive;
}

function run(shift, policy) {
  const results = [];
  const stats = { attempts: 0, extreme: 0, moves: 0, backtracks: 0, fail: 0, scrape: 0, clean: 0, double: 0, same: 0, dominated: 0, tradeoff: 0 };
  for (let s = 1; s <= profiles; s++) {
    const p = N.newProfile();
    N.setShift(p, shift);
    let dives = 0;
    while (!p.won && dives < CAP) {
      for (;;) {
        const options = Object.keys(N.UPGRADES).filter((id) => N.canBuy(p, id));
        if (!options.length) break;
        options.sort((a, b) => N.cost(a, p.levels[a]) - N.cost(b, p.levels[b]));
        N.buy(p, options[0]);
      }
      N.settle(p, playDive(p, s * 1000 + dives, policy, stats));
      dives += 1;
    }
    results.push(p.won ? dives : Infinity);
  }
  results.sort((a, b) => a - b);
  const q = (f) => results[Math.floor(f * (results.length - 1))];
  const pct = (n, d) => `${Math.round((100 * n) / d)}%`;
  const a = stats.attempts;
  return `${shift.padEnd(9)} ${policy.padEnd(8)} won ${pct(results.filter(Number.isFinite).length, profiles).padStart(4)}  dives p10/median/p90 ${q(0.1)}/${q(0.5)}/${q(0.9)}  hits 0/1/2/3 ${pct(stats.fail, a)}/${pct(stats.scrape, a)}/${pct(stats.clean, a)}/${pct(stats.double, a)}  real choice ${pct(stats.tradeoff, a)} (same ${pct(stats.same, a)})  at Bias 2 or 5 ${pct(stats.extreme, a)}  moves back ${pct(stats.backtracks, stats.moves)}`;
}

console.log(`${profiles} profiles per row, starting Bias ${N.START.bias}, capped at ${CAP} dives`);
for (const shift of Object.keys(N.SHIFTS)) for (const policy of Object.keys(POLICIES)) console.log(run(shift, policy));
