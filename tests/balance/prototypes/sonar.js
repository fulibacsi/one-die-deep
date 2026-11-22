// SONAR: does reading the echoes matter? A deducing bot against a blind one.
// Usage: node tests/balance/prototypes/sonar.js [games, default 2000]
import * as S from '../../../design/prototypes/sonar/engine.js';

const games = Number(process.argv[2] ?? 2000);
Object.assign(S.RULES, JSON.parse(process.argv[3] ?? '{}'));

// The most power a hidden cell can hold, from the open echoes around it.
function bound(s, i) {
  let best = Infinity;
  for (const n of S.around(i)) {
    const c = s.cells[n];
    if (!c.open || c.power) continue;
    const known = S.around(n).reduce((sum, m) => sum + (s.cells[m].open ? s.cells[m].power : 0), 0);
    best = Math.min(best, S.shownEcho(s, n) - known);
  }
  return best;
}

function deduce(s) {
  const hidden = s.cells.map((c, i) => i).filter((i) => !s.cells[i].open);
  let pick = hidden[0];
  let low = Infinity;
  for (const i of hidden) {
    const b = bound(s, i);
    if (b < low) (low = b), (pick = i);
  }
  return pick;
}

// Like deduce, but plays safe: exact deductions, and only fights whose worst
// roll (a 1) it survives, until nothing else is left.
function careful(s) {
  const hidden = s.cells.map((c, i) => i).filter((i) => !s.cells[i].open);
  const exact = new Map();
  for (let n = 0; n < s.cells.length; n++) {
    const c = s.cells[n];
    if (!c.open || c.power) continue;
    const unknown = S.around(n).filter((m) => !s.cells[m].open);
    const known = S.around(n).reduce((sum, m) => sum + (s.cells[m].open ? s.cells[m].power : 0), 0);
    if (unknown.length === 1) exact.set(unknown[0], S.shownEcho(s, n) - known);
  }
  const worst = (i) => (exact.has(i) ? exact.get(i) : bound(s, i)) - 1;
  const ranked = hidden.map((i) => [i, worst(i)]).sort((a, b) => a[1] - b[1]);
  const survivable = ranked.filter(([, w]) => w < s.hull);
  // Level-up catapult: when hurt, take a known fight whose XP levels you up,
  // because the level-up repairs the hull right after it.
  if (s.hull < S.maxHull(s.level)) {
    const catapult = survivable.find(([i]) => exact.get(i) > 0 && s.xp + exact.get(i) >= S.xpToLevel(s.level) && exact.get(i) !== S.RULES.leviathan);
    if (catapult) return catapult[0];
  }
  return (survivable[0] ?? ranked[0])[0];
}

const blind = (s) => {
  const hidden = s.cells.map((c, i) => i).filter((i) => !s.cells[i].open);
  return hidden[Math.floor(Math.random() * hidden.length)];
};

for (const [name, policy] of [['careful', careful], ['deducing', deduce], ['blind', blind]]) {
  let wins = 0;
  let levels = 0;
  let pings = 0;
  for (let g = 1; g <= games; g++) {
    const s = S.newGame(g);
    while (!s.over) S.ping(s, policy(s));
    if (s.over === 'won') wins += 1;
    levels += s.level;
    pings += s.pings;
  }
  console.log(`${name.padEnd(9)} wins ${((100 * wins) / games).toFixed(0)}%  final level ${(levels / games).toFixed(1)}  pings ${(pings / games).toFixed(0)}`);
}
