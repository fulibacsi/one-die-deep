// NETDIVE: how many dives a greedy bot needs to crack the Core.
// Usage: node tests/balance/prototypes/netdive.js [profiles, default 300] [bias policy: 3|2|4|5]
import * as N from '../../../design/prototypes/netdive/engine.js';
import { neighbors } from '../../../design/prototypes/shared/dice.js';

const profiles = Number(process.argv[2] ?? 300);
const wantBias = Number(process.argv[3] ?? 3);

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

function playDive(p, seed) {
  const dive = N.startDive(p, seed);
  for (let i = 0; i < 500 && !dive.over; i++) {
    const m = N.mode(dive);
    if (m === 'ice') {
      const ice = dive.rooms[dive.engaged].ice;
      N.attempt(dive, ice.core || (ice.layers === 1 && dive.cycles > 4) ? 'break' : 'ghost');
      continue;
    }
    const here = dive.rooms[dive.pos];
    const hurry = dive.cycles < 6;
    const next = hurry ? null : stepToward(dive, (n) => !n.visited);
    if (next) N.move(dive, next);
    else if (here.kind === 'uplink') N.descend(dive);
    else {
      const go = stepToward(dive, (n) => n.kind === 'uplink' || n.ice?.core) ?? stepToward(dive, (n) => !n.visited);
      if (go) N.move(dive, go);
      else N.jackOut(dive);
    }
  }
  if (!dive.over) N.jackOut(dive);
  return dive;
}

const results = [];
let affordable = 0;
let shopVisits = 0;
for (let s = 1; s <= profiles; s++) {
  const p = N.newProfile();
  let dives = 0;
  while (!p.won && dives < 300) {
    shopVisits += 1;
    if (Object.keys(N.UPGRADES).some((id) => N.canBuy(p, id))) affordable += 1;
    for (;;) {
      const options = Object.keys(N.UPGRADES).filter((id) => N.canBuy(p, id));
      if (!options.length) break;
      options.sort((a, b) => N.cost(a, p.levels[a]) - N.cost(b, p.levels[b]));
      N.buy(p, options[0]);
    }
    N.setBias(p, wantBias);
    N.settle(p, playDive(p, s * 1000 + dives));
    dives += 1;
  }
  results.push(p.won ? dives : Infinity);
}
results.sort((a, b) => a - b);
const q = (f) => results[Math.floor(f * (results.length - 1))];
const won = results.filter(Number.isFinite).length;
console.log(`${profiles} profiles, bias ${wantBias}: cracked the Core in ${won}/${profiles}`);
console.log(`dives to win: p10 ${q(0.1)}, median ${q(0.5)}, p90 ${q(0.9)}`);
console.log(`an upgrade was affordable before ${((100 * affordable) / shopVisits).toFixed(0)}% of dives`);
