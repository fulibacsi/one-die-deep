// Draws a room map as SVG: rooms on a grid, doors between neighbours,
// fog for unseen rooms. The prototype supplies each room's glyph.
import { key, neighbors } from './dice.js';

const CELL = 100;
const ROOM = 64;

/**
 * rooms: { k: { x, y, seen, visited } }, pos: current key,
 * glyph(room, k) -> SVG drawn around 0,0, hero: SVG around 0,0,
 * reachable: Set of keys you can move to, next: those of them one step away,
 * shape: 'square' | 'circle'.
 */
export function mapSvg({ rooms, pos, glyph, hero, reachable = new Set(), next = new Set(), shape = 'square', label = 'Map' }) {
  let doors = '';
  let cells = '';
  for (const [k, room] of Object.entries(rooms)) {
    if (!room.seen) continue;
    const cx = room.x * CELL + CELL / 2;
    const cy = room.y * CELL + CELL / 2;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const n = rooms[key(room.x + dx, room.y + dy)];
      if (!n?.seen) continue;
      const known = room.visited && n.visited;
      doors += `<line class="door${known ? '' : ' unknown'}" x1="${cx + (dx * ROOM) / 2}" y1="${cy + (dy * ROOM) / 2}" x2="${cx + dx * (CELL - ROOM / 2)}" y2="${cy + dy * (CELL - ROOM / 2)}"/>`;
    }
    const cls = `room${room.visited ? '' : ' unknown'}${k === pos ? ' here' : ''}`;
    const body =
      shape === 'circle'
        ? `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${ROOM / 2}"/>`
        : `<rect class="${cls}" x="${cx - ROOM / 2}" y="${cy - ROOM / 2}" width="${ROOM}" height="${ROOM}"/>`;
    const g = glyph(room, k);
    const inner = `${body}${g ? `<g transform="translate(${cx + (k === pos ? 12 : 0)} ${cy + (k === pos ? 6 : 0)}) scale(${k === pos ? 0.7 : 1})">${g}</g>` : ''}`;
    const heroAt = k === pos ? `<g transform="translate(${g ? cx - 14 : cx} ${g ? cy - 12 : cy}) scale(${g ? 0.7 : 1})">${hero}</g>` : '';
    cells += reachable.has(k)
      ? `<g class="reach${next.has(k) ? ' next' : ''}" data-room="${k}" tabindex="0" role="button" aria-label="Move here">${inner}${heroAt}</g>`
      : `<g>${inner}${heroAt}</g>`;
  }
  const all = Object.values(rooms);
  const xs = all.map((r) => r.x);
  const ys = all.map((r) => r.y);
  const span = Math.max(3, Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1);
  const x0 = (Math.min(...xs) - (span - (Math.max(...xs) - Math.min(...xs) + 1)) / 2) * CELL;
  const y0 = (Math.min(...ys) - (span - (Math.max(...ys) - Math.min(...ys) + 1)) / 2) * CELL;
  return `<svg viewBox="${x0} ${y0} ${span * CELL} ${span * CELL}" role="group" aria-label="${label}">${doors}${cells}</svg>`;
}

export { neighbors };
