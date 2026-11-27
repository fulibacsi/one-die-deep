// STARHOLD: campaigns to take the Precursor throneworld, for three players.
// The careful bot picks the action that takes the most strength per supply it
// expects to spend, except on the final blow, where it picks the fate that
// yields the resource it needs next, if those odds are at least 60% as good.
// The odds bot always picks by odds, ignoring fate; the random bot picks at
// random. Careful against odds shows whether choosing fates pays off. Also:
// how battles turn out by number of hits, how often the final blow trades odds
// for the resource, and the fates chosen.
// Usage: node tests/balance/prototypes/starhold.js [profiles, default 300]
import * as N from '../../../design/prototypes/starhold/engine.js';

const profiles = Number(process.argv[2] ?? 300);
const CAP = 150;

const choose = (n, k) => (k === 0 ? 1 : (n * choose(n - 1, k - 1)) / k);

// Chance of at least 1, 2 and 3 hits for an action at the campaign's Aggression.
function atLeast(c, action) {
  let faces = 0;
  for (let die = 1; die <= 6; die++) if (N.hits(c, action, die)) faces += 1;
  const p = faces / 6;
  const n = c.dice[action];
  const exactly = (k) => (k > n ? 0 : choose(n, k) * p ** k * (1 - p) ** (n - k));
  return [1, 2, 3].map((k) => [1, 2, 3].filter((j) => j >= k).reduce((sum, j) => sum + exactly(j), 0));
}

function worth(c, action, species) {
  const [one, two, three] = atLeast(c, action);
  return (one + three) / (1 + (1 - two) * species.strike);
}

// The resource of the upgrade closest to affordable.
function needed(p) {
  let best = null;
  for (const [id, u] of Object.entries(N.UPGRADES)) {
    if (p.levels[id] >= u.max) continue;
    const short = N.cost(id, p.levels[id]) - p.stock[u.pay];
    if (short > 0 && (!best || short < best.short)) best = { short, pay: u.pay };
  }
  return best?.pay ?? null;
}

const POLICIES = {
  careful(c, sys, stats) {
    const byOdds = worth(c, 'purge', sys.species) >= worth(c, 'enslave', sys.species) ? 'purge' : 'enslave';
    if (sys.species.strength > 1 || sys.kind === 'core') return byOdds;
    const want = needed(c.p);
    const fate = want === 'labor' ? 'enslave' : want === sys.planet ? 'purge' : null;
    if (!fate || fate === byOdds) return byOdds;
    stats.tradeoffs += 1;
    if (atLeast(c, fate)[0] >= 0.6 * atLeast(c, byOdds)[0]) {
      stats.overrides += 1;
      return fate;
    }
    return byOdds;
  },
  odds: (c, sys) => (worth(c, 'purge', sys.species) >= worth(c, 'enslave', sys.species) ? 'purge' : 'enslave'),
  random: () => (Math.random() < 0.5 ? 'purge' : 'enslave'),
};

// The nearest system you don't hold, by flight.
function target(c) {
  let best = null;
  for (const k of Object.keys(c.rooms)) {
    if (c.rooms[k].owned) continue;
    const steps = N.route(c, k);
    if (steps && (!best || steps.length < best.length)) best = steps;
  }
  return best;
}

function campaign(p, policy, stats) {
  const c = N.launch(p);
  for (let i = 0; i < 500 && !c.over; i++) {
    if (N.mode(c) === 'battle') {
      const sys = c.rooms[c.engaged];
      N.attempt(c, POLICIES[policy](c, sys, stats));
      stats.attacks += 1;
      stats[c.roll.outcome] += 1;
      continue;
    }
    const steps = c.supply >= 2 ? target(c) : null;
    if (!steps) {
      N.recall(c);
      break;
    }
    for (const step of steps) {
      N.move(c, step);
      if (N.mode(c) !== 'explore') break;
    }
  }
  if (!c.over) N.recall(c);
  for (const fate of c.taken) stats[fate] += 1;
  return c;
}

function run(policy) {
  const results = [];
  const stats = { attacks: 0, fail: 0, scrape: 0, clean: 0, double: 0, tradeoffs: 0, overrides: 0, claimed: 0, purged: 0, enslaved: 0, earned: { alloys: 0, fuel: 0, labor: 0 }, half: [] };
  for (let s = 1; s <= profiles; s++) {
    const p = N.newProfile(s * 7919);
    while (!p.won && p.campaigns < CAP) {
      for (;;) {
        const options = Object.keys(N.UPGRADES).filter((id) => N.canBuy(p, id));
        if (!options.length) break;
        options.sort((a, b) => N.cost(a, p.levels[a]) - N.cost(b, p.levels[b]));
        N.buy(p, options[0]);
      }
      N.settle(p, campaign(p, policy, stats));
    }
    for (const r of Object.keys(stats.earned)) stats.earned[r] += p.earned[r];
    results.push(p.won ? p.campaigns : Infinity);
  }
  results.sort((a, b) => a - b);
  const q = (f) => results[Math.floor(f * (results.length - 1))];
  const pct = (n, d) => `${Math.round((100 * n) / d)}%`;
  const a = stats.attacks;
  const taken = stats.claimed + stats.purged + stats.enslaved;
  const earned = Object.entries(stats.earned).map(([r, n]) => `${r} ${Math.round(n / profiles)}`).join(', ');
  return [
    `${policy.padEnd(8)} won ${pct(results.filter(Number.isFinite).length, profiles).padStart(4)}  campaigns p10/median/p90 ${q(0.1)}/${q(0.5)}/${q(0.9)}  hits 0/1/2/3 ${pct(stats.fail, a)}/${pct(stats.scrape, a)}/${pct(stats.clean, a)}/${pct(stats.double, a)}`,
    `${''.padEnd(8)} systems taken: claimed ${pct(stats.claimed, taken)}, purged ${pct(stats.purged, taken)}, enslaved ${pct(stats.enslaved, taken)}  earned per profile: ${earned}` +
      (policy === 'careful' ? `\n${''.padEnd(8)} final blows where odds and need disagree: ${stats.tradeoffs}, of them need won ${pct(stats.overrides, stats.tradeoffs)}` : ''),
  ].join('\n');
}

console.log(`${profiles} profiles per row, ${N.SYSTEMS} systems, ${N.START.supply} supply, capped at ${CAP} campaigns`);
for (const policy of Object.keys(POLICIES)) console.log(run(policy));
