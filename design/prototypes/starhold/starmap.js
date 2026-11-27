// STARHOLD's galaxy seen from above. Each system is a star with planets on
// orbits that never stop turning, and your fleet circles the system it's at.
// The map is redrawn after every action, so each orbit is drawn at its phase
// right now: planets carry on where they were instead of jumping back.
import { key } from '../shared/dice.js';
import * as N from './engine.js';

const CELL = 100;
const RIM = 40; // a system's edge
const LETTER = { alloys: 'A', fuel: 'F', labor: 'L' };

// A stable number from a system's key, so each system keeps its look.
function hash(k) {
  let h = 2166136261;
  for (const ch of k) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// A group turning clockwise about the system's center, at its phase right now.
// The unpainted circle centers the group's box, so it turns about the star.
function orbit(radius, seconds, phase, body, t) {
  const turn = (t / seconds + phase) % 1;
  const style = `animation-duration:${seconds}s;animation-delay:${(-turn * seconds).toFixed(2)}s;transform:rotate(${(turn * 360).toFixed(1)}deg)`;
  return `<g class="spin" style="${style}"><circle r="${radius}" fill="none"/>${body}</g>`;
}

const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const triangle = (r, cls) => `<polygon class="${cls}" points="${pts([[0, -r], [r * 0.95, r * 0.65], [-r * 0.95, r * 0.65]])}"/>`;

/** What a system is, in words, for screen readers and the tap target. */
export function describe(sys) {
  const planet = N.RESOURCES[sys.planet].toLowerCase();
  if (sys.kind === 'home') return 'Your homeworld';
  if (sys.owned) return `Your system: ${Object.entries(N.yields(sys)).map(([r, n]) => `+${n} ${N.RESOURCES[r].toLowerCase()}`).join(', ')} per campaign`;
  if (sys.kind === 'core') return `The Precursor throneworld: strength ${sys.species.strength}, strikes back ${sys.species.strike}`;
  if (sys.species) return `The ${sys.species.name}${sys.species.rebel ? ' rebels' : ''}: strength ${sys.species.strength}, strikes back ${sys.species.strike}, ${planet} world`;
  return `${sys.kind === 'derelict' ? 'A derelict depot' : 'Uninhabited'}: ${planet} world`;
}

function system(sys, k, { here, t }) {
  const h = hash(k);
  const core = sys.kind === 'core';
  const rim = `<circle class="rim${sys.owned ? ' owned' : ''}${sys.visited ? '' : ' unknown'}" r="${RIM}"/>`;
  const star = sys.kind === 'home' ? 'star home' : core ? 'star core' : 'star';
  const sun = `<circle class="halo ${star}" r="${core ? 17 : 12}"/><circle class="${star}" r="${core ? 10 : 6.5}"/>`;

  // The resource planet, coloured by what the world yields, and a moon-sized
  // second planet on some systems. Inner orbits turn faster.
  const inner = 15 + (h % 4);
  const outer = 26 + ((h >> 3) % 4);
  const big = sys.planet === 'fuel' ? 5.5 : 4.2;
  let orbits = `<circle class="path" r="${inner}"/>`;
  let planets = orbit(inner, 7 + (h % 5), (h % 97) / 97, `<circle class="planet ${sys.planet}" cx="${inner}" r="${big}"/>`, t);
  if (core || h % 3) {
    orbits += `<circle class="path" r="${outer}"/>`;
    planets += orbit(outer, 13 + ((h >> 5) % 7), ((h >> 7) % 89) / 89, `<circle class="planet dust" cx="${outer}" r="2.6"/>`, t);
  }

  // Badges: who holds it, and how strong they are.
  let badge = '';
  let tag = '';
  if (sys.kind === 'home') {
    tag = 'home';
  } else if (sys.owned) {
    const [r, n] = Object.entries(N.yields(sys))[0];
    badge = `<g transform="translate(25 -25)"><circle class="badge ${r}" r="10"/><text class="b-num" y="4.5">${LETTER[r]}</text></g>`;
    tag = `+${n}`;
  } else if (sys.species) {
    const s = sys.species;
    badge = `<g transform="translate(25 -23)">${triangle(core ? 16 : 13, s.rebel ? 'foe rebel' : 'foe')}<text class="b-num" y="${core ? 6 : 5}">${s.strength}</text></g>`;
    tag = `${core ? '' : `${LETTER[sys.planet]} `}−${s.strike}`;
  } else {
    tag = LETTER[sys.planet];
    if (sys.kind === 'derelict') badge = '<path class="wreck" d="M-34 -22L-26 -14M-22 -30L-16 -24M-30 -30L-28 -26"/>';
  }

  // Your fleet circles where it is.
  const fleet = here
    ? `<circle class="fleet-path" r="35"/>${orbit(35, 5, 0, '<polygon class="ship" points="29,-6 41,-6 35,8"/>', t)}`
    : '';
  return `${rim}${orbits}${sun}${planets}${badge}${tag ? `<text class="tag" y="55">${tag}</text>` : ''}${fleet}`;
}

/**
 * The galaxy as SVG. rooms: the systems; pos: where the fleet is; reachable:
 * systems you can fly to; next: those one jump away.
 */
export function starmapSvg({ rooms, pos, reachable = new Set(), next = new Set(), label = 'The galaxy' }) {
  // With reduced motion the orbits stand still, so keep them in one place.
  const t = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : performance.now() / 1000;
  let lanes = '';
  let systems = '';
  for (const [k, sys] of Object.entries(rooms)) {
    if (!sys.seen) continue;
    const cx = sys.x * CELL + CELL / 2;
    const cy = sys.y * CELL + CELL / 2;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const n = rooms[key(sys.x + dx, sys.y + dy)];
      if (!n?.seen) continue;
      const cls = sys.owned && n.owned ? 'lane held' : sys.visited && n.visited ? 'lane' : 'lane unknown';
      lanes += `<line class="${cls}" x1="${cx + dx * RIM}" y1="${cy + dy * RIM}" x2="${cx + dx * (CELL - RIM)}" y2="${cy + dy * (CELL - RIM)}"/>`;
    }
    const body = `<g transform="translate(${cx} ${cy})">${system(sys, k, { here: k === pos, t })}</g>`;
    systems += reachable.has(k)
      ? `<g class="sys reach${next.has(k) ? ' next' : ''}" data-room="${k}" tabindex="0" role="button" aria-label="Fly to: ${describe(sys)}">${body}</g>`
      : `<g class="sys" aria-label="${describe(sys)}">${body}</g>`;
  }
  // Frame the whole galaxy, not just what you've seen, so the view holds still.
  const all = Object.values(rooms);
  const xs = all.map((r) => r.x);
  const ys = all.map((r) => r.y);
  const span = Math.max(3, Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1);
  const x0 = (Math.min(...xs) - (span - (Math.max(...xs) - Math.min(...xs) + 1)) / 2) * CELL;
  const y0 = (Math.min(...ys) - (span - (Math.max(...ys) - Math.min(...ys) + 1)) / 2) * CELL;
  return `<svg viewBox="${x0} ${y0} ${span * CELL} ${span * CELL}" role="group" aria-label="${label}">${lanes}${systems}</svg>`;
}
