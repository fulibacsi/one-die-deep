// HIGH ROLLER: does the meta-progression curve rise? Win rate by run number
// for profiles that bank chips and buy the cheapest upgrade between runs.
// Usage: node tests/balance/prototypes/high-roller.js [profiles, default 400] [runs, default 15]
import * as H from '../../../design/prototypes/high-roller/engine.js';
import { neighbors } from '../../../design/prototypes/shared/dice.js';

const profiles = Number(process.argv[2] ?? 400);
const runsEach = Number(process.argv[3] ?? 15);
const patch = JSON.parse(process.argv[4] ?? '{}');
Object.assign(H.RULES, patch.rules ?? {});
if (patch.die) H.START_DIE.splice(0, 6, ...patch.die.map(([kind, n]) => ({ kind, n: n ?? 0 })));
if (patch.guards) patch.guards.forEach((g, i) => Object.assign(H.GUARDS[i], g));

function stepToward(run, goal) {
  const seen = new Set([run.pos]);
  const queue = [[run.pos, null]];
  while (queue.length) {
    const [k, first] = queue.shift();
    for (const n of neighbors(run.rooms, k)) {
      if (seen.has(n)) continue;
      seen.add(n);
      const room = run.rooms[n];
      if (!room.seen) continue;
      if (goal(room)) return first ?? n;
      if (room.visited && room.kind !== 'guard') queue.push([n, first ?? n]);
    }
  }
  return null;
}

function play(run) {
  for (let i = 0; i < 2000 && !run.over; i++) {
    const m = H.mode(run);
    if (m === 'offer') {
      const w = H.weakest(run.die);
      H.takeFace(run, H.faceValue(run.offer) > H.faceValue(run.die[w]) ? w : null);
    } else if (m === 'fight') H.roll(run);
    else if (m === 'decide') {
      const face = run.die[run.combat.face];
      const foe = run.rooms[run.pos].foe;
      const desperate = run.nerve <= 2 * foe.dmg;
      const bad = face.kind === 'blank' || (face.kind === 'chip' && desperate);
      if (bad && run.chips > (desperate ? 0 : 2)) H.reroll(run);
      else H.keep(run);
    } else {
      const next = stepToward(run, (r) => !r.visited);
      if (next) H.move(run, next);
      else if (run.rooms[run.pos].kind === 'elevator') H.descend(run);
      else H.move(run, stepToward(run, (r) => r.kind === 'elevator' || r.foe?.boss));
    }
  }
  return run;
}

const wins = Array(runsEach).fill(0);
const floors = Array(runsEach).fill(0);
for (let s = 1; s <= profiles; s++) {
  const p = H.newProfile();
  for (let r = 0; r < runsEach; r++) {
    for (;;) {
      const options = Object.keys(H.META).filter((id) => p.levels[id] < H.META[id].max && p.chips >= H.metaCost(id, p.levels[id]));
      if (!options.length) break;
      options.sort((a, b) => H.metaCost(a, p.levels[a]) - H.metaCost(b, p.levels[b]));
      H.buyMeta(p, options[0]);
    }
    const run = play(H.newRun(p, s * 100 + r));
    if (run.over === 'won') wins[r] += 1;
    floors[r] += run.floor;
    H.settle(p, run);
  }
}
console.log(`${profiles} profiles, ${runsEach} runs each`);
console.log('run    ' + wins.map((_, i) => String(i + 1).padStart(4)).join(''));
console.log('win %  ' + wins.map((w) => String(Math.round((100 * w) / profiles)).padStart(4)).join(''));
console.log('floor  ' + floors.map((f) => (f / profiles).toFixed(1).padStart(4)).join(''));
