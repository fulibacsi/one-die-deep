// Shared by the prototypes: a seeded d6 stored in plain state, the map
// generator, and the die widget. Same die and walk as the main game.

// mulberry32, stepped on state.seed so runs are reproducible.
export function d6(state) {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  let t = state.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return 1 + Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * 6);
}

export const key = (x, y) => `${x},${y}`;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export function neighbors(rooms, k) {
  const { x, y } = rooms[k];
  return DIRS.map(([dx, dy]) => key(x + dx, y + dy)).filter((n) => rooms[n]);
}

/** A random walk on a grid, decided by d6 rolls (5-6 rerolled), like the main game. */
export function makeFloor(state, count = 9, grid = 5) {
  const rooms = {};
  const order = [];
  const add = (x, y) => {
    const k = key(x, y);
    if (!rooms[k]) {
      rooms[k] = { x, y, seen: false, visited: false };
      order.push(k);
    }
  };
  let x = Math.floor(grid / 2);
  let y = x;
  add(x, y);
  while (order.length < count) {
    const die = d6(state);
    if (die > 4) continue;
    const [dx, dy] = DIRS[die - 1];
    if (x + dx < 0 || y + dy < 0 || x + dx >= grid || y + dy >= grid) continue;
    x += dx;
    y += dy;
    add(x, y);
  }
  const dist = { [order[0]]: 0 };
  const queue = [order[0]];
  while (queue.length) {
    const k = queue.shift();
    for (const n of neighbors(rooms, k)) if (!(n in dist)) (dist[n] = dist[k] + 1), queue.push(n);
  }
  const exit = order.reduce((a, b) => (dist[b] > dist[a] ? b : a));
  return { rooms, order, start: order[0], exit };
}

export function reveal(rooms, k) {
  rooms[k].visited = true;
  rooms[k].seen = true;
  for (const n of neighbors(rooms, k)) rooms[n].seen = true;
}

// ---------- the die widget (browser only) ----------

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function dieHtml(face, extra = '') {
  const on = new Set(PIPS[face] ?? []);
  const label = face ? `The die shows ${face}` : 'The die has not been rolled yet';
  return `<div class="die ${face ? '' : 'blank'} ${extra}" role="img" aria-label="${label}">${Array.from({ length: 9 }, (_, i) => `<i class="${on.has(i) ? 'on' : ''}"></i>`).join('')}</div>`;
}

export function showFace(die, face) {
  const on = new Set(PIPS[face] ?? []);
  [...die.children].forEach((pip, i) => pip.classList.toggle('on', on.has(i)));
}

/** Tumbles a rendered die for a moment, then settles on `face`. */
export function spin(die, face, onTick = () => {}) {
  if (!die || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  die.classList.remove('blank');
  die.classList.add('rolling');
  const timer = setInterval(() => {
    showFace(die, 1 + Math.floor(Math.random() * 6));
    onTick();
  }, 55);
  return new Promise((resolve) =>
    setTimeout(() => {
      clearInterval(timer);
      showFace(die, face);
      resolve();
    }, 380),
  );
}

/** Reads and writes per-browser progress, tolerating blocked storage. */
export const store = {
  get(name, fallback) {
    try {
      const raw = localStorage.getItem(name);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  set(name, value) {
    try {
      localStorage.setItem(name, JSON.stringify(value));
    } catch {
      // Not saved; the game still works for this visit.
    }
  },
};
