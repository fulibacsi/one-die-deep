// NETDIVE: dives to crack the Core, for each Bias-shift variant and two
// players: a careful bot (picks the attack that isn't resisted and has the
// better odds) and a random one. The gap between them shows how much the
// choice of attack matters.
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

// Chance an attack lands at the dive's current Bias.
function odds(dive, approach, ice) {
  let faces = 0;
  for (let die = 1; die <= 6; die++) {
    const zero = N.zeroDays(dive).includes(die);
    const win = approach === 'break' ? die < dive.bias : die > dive.bias;
    if (zero || (N.resists(ice) !== approach && win)) faces += 1;
  }
  return faces / 6;
}

const POLICIES = {
  careful: (dive, ice) => (odds(dive, 'break', ice) >= odds(dive, 'spoof', ice) ? 'break' : 'spoof'),
  random: () => (Math.random() < 0.5 ? 'break' : 'spoof'),
};

function playDive(p, seed, policy, stats) {
  const dive = N.startDive(p, seed);
  for (let i = 0; i < 500 && !dive.over; i++) {
    if (N.mode(dive) === 'ice') {
      const ice = dive.rooms[dive.engaged].ice;
      if (dive.bias === N.BIAS_MIN || dive.bias === N.BIAS_MAX) stats.extreme += 1;
      N.attempt(dive, POLICIES[policy](dive, ice));
      stats.attempts += 1;
      if (dive.roll.outcome !== 'fail') stats.landed += 1;
      continue;
    }
    const here = dive.rooms[dive.pos];
    const next = dive.cycles < 6 ? null : stepToward(dive, (n) => !n.visited);
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

function run(shift, policy) {
  const results = [];
  const stats = { attempts: 0, landed: 0, extreme: 0 };
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
  return `${shift.padEnd(9)} ${policy.padEnd(8)} won ${pct(results.filter(Number.isFinite).length, profiles).padStart(4)}  dives p10/median/p90 ${q(0.1)}/${q(0.5)}/${q(0.9)}  attacks land ${pct(stats.landed, stats.attempts)}  at Bias 2 or 5 ${pct(stats.extreme, stats.attempts)}`;
}

console.log(`${profiles} profiles per row, starting Bias ${N.START.bias}, capped at ${CAP} dives`);
for (const shift of Object.keys(N.SHIFTS)) for (const policy of Object.keys(POLICIES)) console.log(run(shift, policy));
