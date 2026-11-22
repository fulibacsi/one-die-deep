// Browser view: renders the engine state and turns clicks and keys into
// engine actions. All rules live in game.js; nothing here changes the state
// except through its exported actions.
import * as G from './game.js';
import * as R from './rules.js';
import * as S from './sound.js';

const screen = document.getElementById('screen');
const depthEl = document.getElementById('depth');
const newRunBtn = document.getElementById('new-run');
const soundBtn = document.getElementById('sound');
const kitBtn = document.getElementById('details');
const app = document.querySelector('.app');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let state = null;
let picking = true;
let busy = false;
let kitOpen = false; // the gear sheet on phones

// What the last action changed, read once by the next render to pick
// one-shot animations: { before: snapshot(), events } or { arrive: true }.
let fx = null;
const happened = (type) => fx?.events?.filter((e) => e.type === type) ?? [];

function snapshot() {
  return {
    floor: state.floor,
    mode: G.mode(state),
    hp: state.hero.hp,
    foeHp: G.enemy(state)?.hp ?? null,
    seen: new Set(Object.keys(state.rooms).filter((k) => state.rooms[k].seen)),
  };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const plus = (bonus) => Object.entries(bonus).map(([k, v]) => `+${v} ${cap(k)}`).join(', ');

// ---------- glyphs (drawn around 0,0) ----------

function heroShape(classId, r) {
  if (classId === 'warrior') return `<rect class="g-hero" x="${-r}" y="${-r}" width="${2 * r}" height="${2 * r}"/>`;
  if (classId === 'rogue') {
    return `<polygon class="g-hero" points="0,${-r * 1.15} ${r * 1.15},${r * 0.85} ${-r * 1.15},${r * 0.85}"/>`;
  }
  return `<circle class="g-hero" r="${r * 1.12}"/>`;
}

// The hero on the map, gliding in from the room it left.
function heroOnMap(x, y, scale, from) {
  const glide = from && !(from.x === x && from.y === y) ? ' glide' : '';
  const vars = from ? `; --fx: ${from.x}px; --fy: ${from.y}px; --fs: ${from.scale}` : '';
  return `<g class="hero-g${glide}" style="transform: translate(${x}px, ${y}px) scale(${scale})${vars}">${heroShape(state.classId, 13)}</g>`;
}

function heroIcon(classId, size = 36) {
  return `<svg width="${size}" height="${size}" viewBox="-20 -20 40 40" aria-hidden="true">${heroShape(classId, 14)}</svg>`;
}

function foeShape(foe) {
  const r = 16;
  let out;
  if (foe.boss) {
    const pts = Array.from({ length: 8 }, (_, i) => {
      const a = Math.PI / 8 + (i * Math.PI) / 4;
      return `${(21 * Math.cos(a)).toFixed(1)},${(21 * Math.sin(a)).toFixed(1)}`;
    }).join(' ');
    out = `<polygon class="g-foe" points="${pts}"/>`;
  } else {
    out = `<polygon class="g-foe" points="0,${-r} ${r},0 0,${r} ${-r},0"/>`;
    if (foe.elite) out += `<polygon class="g-foe-line" points="0,${-r - 6} ${r + 6},0 0,${r + 6} ${-r - 6},0"/>`;
  }
  const letter = foe.name.replace('Elite ', '').replace('The ', '')[0];
  return `${out}<text class="g-letter" y="5" text-anchor="middle">${esc(letter)}</text>`;
}

function kindShape(kind) {
  switch (kind) {
    case 'chest':
      return '<rect class="g-ink" x="-14" y="-10" width="28" height="20"/><path class="g-ink" d="M-14 -2H14M0 -2V4"/>';
    case 'shrine':
      return '<path class="g-ink" d="M0 -15V15M-15 0H15"/>';
    case 'stairs':
      return '<path class="g-ink" d="M-16 14H-6V4H4V-6H14V-16"/>';
    case 'disarmed':
      return '<path class="g-spent" d="M-16 10L-8 -8L0 10L8 -8L16 10M-18 10H18"/>';
    default:
      return '';
  }
}

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function dieHtml(face, landed = false) {
  const on = new Set(PIPS[face] ?? []);
  const flourish = landed && face === 6 ? 'pop' : landed && face === 1 ? 'wobble' : '';
  const cls = ['die', face ? '' : 'blank', face === 6 ? 'six' : '', face === 1 ? 'one' : '', flourish].join(' ').trim();
  const label = face ? `The die shows ${face}` : 'The die has not been rolled yet';
  return `<div class="${cls}" id="die" role="img" aria-label="${label}">${Array.from({ length: 9 }, (_, i) => `<i class="${on.has(i) ? 'on' : ''}"></i>`).join('')}</div>`;
}

function showFace(die, face) {
  const on = new Set(PIPS[face]);
  [...die.children].forEach((pip, i) => pip.classList.toggle('on', on.has(i)));
}

// ---------- descriptions ----------

function roomName(room) {
  if (room.enemy) return room.enemy.name;
  return { stairs: 'Stairs down', chest: 'Chest', shrine: 'Shrine', disarmed: 'Disarmed trap' }[room.kind] ?? 'Empty room';
}

function roomTip(room) {
  const foe = room.enemy;
  if (foe) return `${foe.name}: Attack ${foe.attack}, Defense ${foe.defense}, HP ${foe.hp}, hits for ${foe.dmg}`;
  if (!room.visited && room.kind === 'trap') return 'Unexplored room';
  if (!room.visited && room.kind === 'empty') return 'Unexplored room';
  return roomName(room);
}

// ---------- map ----------

const CELL = 100;
const ROOM = 66;

function renderMap() {
  const reachable = new Set(G.mode(state) === 'explore' ? G.neighbors(state, state.pos) : []);
  const sameFloor = fx?.before && fx.before.floor === state.floor;
  const fresh = (k) => sameFloor && !fx.before.seen.has(k);
  const moved = [...happened('move'), ...happened('escape')].at(-1);
  const killed = happened('kill').at(-1);
  const struck = happened('hit').length > 0 && state.combat;
  const center = (k) => [state.rooms[k].x * CELL + CELL / 2, state.rooms[k].y * CELL + CELL / 2];
  let doors = '';
  let rooms = '';
  for (const [k, room] of Object.entries(state.rooms)) {
    if (!room.seen) continue;
    const cx = room.x * CELL + CELL / 2;
    const cy = room.y * CELL + CELL / 2;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const n = state.rooms[G.key(room.x + dx, room.y + dy)];
      if (!n?.seen) continue;
      const known = room.visited && n.visited;
      const [x1, y1] = [cx + (dx * ROOM) / 2, cy + (dy * ROOM) / 2];
      const [x2, y2] = [cx + dx * (CELL - ROOM / 2), cy + dy * (CELL - ROOM / 2)];
      const isNew = fresh(k) || fresh(G.key(room.x + dx, room.y + dy));
      doors += `<line class="door${known ? '' : ' unknown'}${isNew ? ' fresh' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
    }

    const here = k === state.pos;
    const hidden = !room.visited && room.kind === 'trap';
    const glyph = room.enemy ? foeShape(room.enemy) : hidden ? '' : kindShape(room.kind);
    let inner = `<rect class="room${room.visited ? '' : ' unknown'}${here ? ' here' : ''}" x="${cx - ROOM / 2}" y="${cy - ROOM / 2}" width="${ROOM}" height="${ROOM}"/>`;
    const hit = here && room.enemy && struck ? ' struck' : '';
    if (here && glyph) {
      inner += `<g class="glyph${hit}" transform="translate(${cx + 13} ${cy + 4}) scale(0.72)">${glyph}</g>`;
    } else if (glyph) {
      inner += `<g transform="translate(${cx} ${cy - (room.enemy ? 5 : 0)})">${glyph}</g>`;
    }
    if (killed?.at === k) {
      inner += `<g transform="translate(${cx} ${cy})"><circle class="burst" r="16"/><polygon class="burst burst-core" points="0,-14 14,0 0,14 -14,0"/></g>`;
    }
    if (room.enemy && !here) {
      inner += `<text class="g-tag" x="${cx}" y="${cy + 28}" text-anchor="middle">A${room.enemy.attack} D${room.enemy.defense}</text>`;
    }
    const tip = `<title>${esc(roomTip(room))}</title>`;
    const cls = fresh(k) ? ' class="fresh"' : '';
    rooms += reachable.has(k)
      ? `<g class="reach${fresh(k) ? ' fresh' : ''}" data-room="${k}" tabindex="0" role="button" aria-label="Move to: ${esc(roomTip(room))}">${tip}${inner}</g>`
      : `<g${cls}>${tip}${inner}</g>`;
  }

  // The hero is drawn last, on top, so it can glide across doors.
  const [hx, hy] = center(state.pos);
  const crowded = state.rooms[state.pos].enemy || kindShape(state.rooms[state.pos].kind) !== '';
  const [x, y, scale] = crowded ? [hx - 15, hy - 13, 0.7] : [hx, hy, 1];
  let from = null;
  if (moved && moved.from in state.rooms) {
    const [fx0, fy0] = center(moved.from);
    from = { x: fx0, y: fy0, scale };
  }
  const hero = heroOnMap(x, y, scale, from);
  // Frame the whole floor (not just what is seen, so the view holds still),
  // as a square of at least 3 cells.
  const all = Object.values(state.rooms);
  const [minX, maxX] = [Math.min(...all.map((r) => r.x)), Math.max(...all.map((r) => r.x))];
  const [minY, maxY] = [Math.min(...all.map((r) => r.y)), Math.max(...all.map((r) => r.y))];
  const span = Math.max(3, maxX - minX + 1, maxY - minY + 1);
  const x0 = (minX - (span - (maxX - minX + 1)) / 2) * CELL;
  const y0 = (minY - (span - (maxY - minY + 1)) / 2) * CELL;
  return `<svg viewBox="${x0} ${y0} ${span * CELL} ${span * CELL}" role="group" aria-label="Map of floor ${state.floor}">${doors}${rooms}${hero}</svg>`;
}

// ---------- sheet ----------

// A row of pips. With `before`, pips lost or gained since then flash.
function segs(kind, filled, total, before = filled) {
  const pip = (i) => [i < filled ? 'on' : '', i >= filled && i < before ? 'lost' : '', i >= before && i < filled ? 'gained' : ''].join(' ').trim();
  return `<div class="segs ${kind}">${Array.from({ length: total }, (_, i) => `<i class="${pip(i)}"></i>`).join('')}</div>`;
}

const float = (text, tone) => `<span class="float ${tone}" aria-hidden="true">${text}</span>`;

function renderSheet() {
  const { hero, classId } = state;
  const cls = R.CLASSES[classId];
  const need = R.xpToLevel(hero.level);
  const stats = R.STATS.map((s) => {
    const total = G.stat(state, s);
    const gear = total - hero.stats[s];
    return `<div title="${esc(R.STAT_INFO[s])}"><dt>${s}</dt><dd>${total}${gear ? `<small>+${gear}</small>` : ''}</dd></div>`;
  }).join('');
  const gear = Object.entries(hero.gear)
    .map(([slot, item]) => `<li><span class="label">${slot}</span><span>${item ? `${esc(item.name)} <span class="muted">${plus(item.bonus)}</span>` : '<span class="muted">none</span>'}</span></li>`)
    .join('');
  const skills = cls.skills
    .map((id, i) => {
      const sk = R.SKILLS[id];
      const known = hero.skills.includes(id);
      return `<li class="${known ? '' : 'locked'}"><span><b>${sk.name}</b> ${known ? '' : `<span class="label">level ${R.SKILL_LEVELS[i]}</span>`}</span><span class="muted">${sk.text}</span></li>`;
    })
    .join('');
  const hpBefore = fx?.before?.floor === state.floor ? fx.before.hp : hero.hp;
  const hurtBy = happened('hurt').reduce((n, e) => n + e.amount, 0);
  const healedBy = happened('heal').reduce((n, e) => n + e.amount, 0);
  let floats = '';
  if (hurtBy) floats += float(`−${hurtBy}`, 'bad');
  else if (happened('ward').length) floats += float('Ward', 'good');
  else if (happened('block').length) floats += float('Block', 'good');
  if (healedBy) floats += float(`+${healedBy}`, 'good');
  const leveled = happened('levelup').length ? ' pulse' : '';
  return `<aside class="sheet box vitals${hurtBy ? ' shake' : ''}" aria-label="Your hero">
    <div class="who">${heroIcon(classId, 40)}<div><div class="who-name">${cls.name}</div><div class="label${leveled}">Level ${hero.level}</div></div></div>
    <div class="track t-hp"><div class="track-head"><span class="label">HP</span><span class="num">${hero.hp} / ${G.maxHp(state)}</span></div>${segs('hp', hero.hp, G.maxHp(state), hpBefore)}${floats}</div>
    <div class="track t-focus"><div class="track-head"><span class="label">Focus</span><span class="num">${hero.focus} / ${G.maxFocus(state)}</span></div>${segs('focus', hero.focus, G.maxFocus(state))}</div>
    <div class="track t-xp"><div class="track-head"><span class="label">XP</span><span class="num">${hero.xp} / ${need}</span></div><div class="xpbar"><b style="width:${(100 * hero.xp) / need}%"></b></div></div>
    <dl class="stats">${stats}</dl>
  </aside>
  <aside class="sheet box kit" id="kit" aria-label="Gear, skills and log">
    <div class="kit-head"><span class="label">Gear and skills</span><button class="btn ghost" type="button" data-act="close-kit">Close</button></div>
    <ul class="list">${gear}<li><span class="label">potions</span><span class="num">${hero.potions} / ${R.MAX_POTIONS}</span></li></ul>
    <ul class="list skills">${skills}</ul>
    <div class="kit-log"><span class="label">Log</span><ul class="log">${state.log.slice(-12).reverse().map((line) => `<li>${esc(line)}</li>`).join('')}</ul></div>
  </aside>`;
}

// ---------- panel ----------

const LOOT_NAMES = { potion: 'Potion', weapon: 'Weapon', armor: 'Armor', charm: 'Charm', rare: 'Rare item, one tier up' };

function lootTable(die) {
  const rows = [];
  R.LOOT_TABLE.forEach((v, i) => {
    const last = rows.at(-1);
    if (last?.v === v) last.to = i + 1;
    else rows.push({ v, from: i + 1, to: i + 1 });
  });
  return `<div class="table6"><span class="label">Loot table</span>${rows
    .map((r) => `<div class="${die >= r.from && die <= r.to ? 'hit' : ''}"><span class="num">${r.from === r.to ? r.from : `${r.from}–${r.to}`}</span><span>${LOOT_NAMES[r.v]}</span></div>`)
    .join('')}</div>`;
}

function checkHtml(die, c) {
  if (c.skipped) return `<div class="check"><span class="label">${c.label}</span><span class="math">not needed, the foe fell</span></div>`;
  const parts = c.parts.map(([name, v]) => ` + ${esc(name)} ${v}`).join('');
  const met = c.total >= c.target;
  const natural = (die === 1 && met) || (die === 6 && !met) ? `, but a ${die} always ${die === 6 ? 'succeeds' : 'fails'}` : '';
  const ward = c.ward ? ', Ward stops it' : '';
  return `<div class="check ${c.ok ? 'ok' : 'no'}"><span class="label">${c.label}</span><span class="math">${die}${parts} = ${c.total} ${met ? '≥' : '<'} ${c.targetLabel} ${c.target}${natural}${ward}</span></div>`;
}

// The headline of a roll: what happened, in two words or fewer per check.
function verdict(roll) {
  const chip = (ok, text) => `<span class="${ok ? 'ok' : 'no'}">${text}</span>`;
  if (roll.kind === 'loot') return chip(true, LOOT_NAMES[roll.found]);
  if (roll.kind === 'trap') return roll.checks[0].ok ? chip(true, 'Spotted') : chip(false, `Sprung −${roll.taken}`);
  if (roll.kind === 'flee') return roll.checks[0].ok ? chip(true, 'Escaped') : chip(false, `Caught −${roll.taken}`);
  const [hit, block] = roll.checks;
  let out = hit.ok ? chip(true, `${hit.crit ? 'Crit' : 'Hit'} −${roll.damage}`) : chip(false, 'Miss');
  if (block.skipped) out += chip(true, 'Foe falls');
  else if (block.ward) out += chip(true, 'Warded');
  else out += block.ok ? chip(true, 'Blocked') : chip(false, `Hurt −${roll.taken}`);
  return out;
}

function rollHtml(roll) {
  if (!roll) {
    return `<div class="roll"><div class="roll-top">${dieHtml(0)}<div class="verdict"><span class="note">Every random thing in the dungeon is one roll of this die.</span></div></div></div>`;
  }
  const body = roll.kind === 'loot' ? lootTable(roll.die) : `<div class="checks">${roll.checks.map((c) => checkHtml(roll.die, c)).join('')}</div>`;
  const landed = fx?.rolled === roll.n;
  return `<div class="roll"><div class="roll-top">${dieHtml(roll.die, landed)}<div class="verdict">${verdict(roll)}</div></div>${body}</div>`;
}

function potionButton() {
  const { hero } = state;
  const ok = hero.potions > 0 && hero.hp < G.maxHp(state);
  return `<button class="btn" type="button" data-act="potion" ${ok ? '' : 'disabled'}>Potion ×${hero.potions} <span class="muted wide-only">+${R.POTION_HEAL} HP</span> <kbd>P</kbd></button>`;
}

function combatHtml() {
  const foe = G.enemy(state);
  const { fight } = state.combat;
  const { hero } = state;
  const mod = (v) => (v ? ` <span class="muted">(${v > 0 ? '+' : ''}${v})</span>` : '');
  const hits = happened('hit');
  const dealt = hits.reduce((n, e) => n + e.damage, 0) + happened('poison').reduce((n, e) => n + e.damage, 0);
  const crit = hits.some((e) => e.crit);
  const foeBefore = fx?.before?.foeHp ?? foe.hp;
  const floats = dealt ? float(`${crit ? 'Crit ' : ''}−${dealt}`, crit ? 'crit' : 'bad') : happened('miss').length ? float('Miss', 'soft') : '';
  const skills = hero.skills
    .map((id, i) => {
      const sk = R.SKILLS[id];
      return `<button class="btn skill-btn" type="button" data-skill="${id}" ${hero.focus < 1 ? 'disabled' : ''}>
        <b>${sk.name} <kbd>${i + 1}</kbd></b><span>${sk.text}</span><span class="cost">1 Focus</span></button>`;
    })
    .join('');
  return {
    head: `<div class="foe-card${dealt ? ' struck' : ''}">
      ${floats}
      <h2>${esc(foe.name)}</h2>
      <div class="foe-stats"><span>Attack <b>${foe.attack + fight.attack}</b>${mod(fight.attack)}</span><span>Defense <b>${foe.defense + fight.defense}</b></span><span>Hits for <b>${foe.dmg}</b></span></div>
      ${segs('foe', foe.hp, foe.maxHp, foeBefore)}
      ${fight.ward ? `<p class="note">Ward: blocks the next ${fight.ward} hit${fight.ward > 1 ? 's' : ''}.</p>` : ''}
      ${fight.poison ? `<p class="note">Poisoned: loses ${fight.poison} HP after each roll.</p>` : ''}
      ${fight.dmg ? `<p class="note">Your hits deal +${fight.dmg}.</p>` : ''}
    </div>`,
    actions: `<div class="actions">
      <div class="row main-row"><button class="btn primary" type="button" data-act="attack">Attack <kbd>Space</kbd></button></div>
      ${skills ? `<div class="row skill-row">${skills}</div>` : ''}
      <div class="row aux-row"><button class="btn" type="button" data-act="flee" title="Roll + Grit must meet the foe's Attack">Flee <kbd>F</kbd></button>${potionButton()}</div>
    </div>`,
  };
}

function exploreHtml() {
  const room = state.rooms[state.pos];
  const stairs = room.kind === 'stairs';
  return {
    head: `<h2>${stairs ? 'Stairs down' : `Floor ${state.floor}`}</h2>`,
    actions: `<div class="actions">
      <p class="note">Move with the arrow keys, or tap a room next to yours. Rooms you can see show what waits inside, except traps.</p>
      <div class="row">${stairs ? `<button class="btn primary" type="button" data-act="descend">Descend to floor ${state.floor + 1} <kbd>D</kbd></button>` : ''}${potionButton()}</div>
    </div>`,
  };
}

function levelHtml() {
  const { level } = state.prompts[0];
  const unlock = R.SKILL_LEVELS.indexOf(level);
  const sk = unlock > 0 ? R.SKILLS[R.CLASSES[state.classId].skills[unlock]] : null;
  const buttons = R.STATS.map((s, i) => {
    const now = G.stat(state, s);
    return `<button class="btn" type="button" data-stat="${s}"><b>${cap(s)} ${now} → ${now + 1} <kbd>${i + 1}</kbd></b><span>${R.STAT_INFO[s]}</span></button>`;
  }).join('');
  return {
    head: `<h2>Level ${level}</h2>`,
    actions: `<div class="actions">
      <p class="note">Raise one stat by 1. Your HP and Focus refill, and max HP grows by ${R.HP_PER_LEVEL}.</p>
      ${sk ? `<p class="note">New skill: <b>${sk.name}</b>. ${sk.text}</p>` : ''}
      <div class="choice">${buttons}</div>
    </div>`,
  };
}

function lootHtml() {
  const { item } = state.prompts[0];
  const current = state.hero.gear[item.slot];
  const diff = R.STATS.map((s) => {
    const change = (item.bonus[s] ?? 0) - (current?.bonus[s] ?? 0);
    return change ? `${cap(s)} ${G.stat(state, s)} → ${G.stat(state, s) + change}` : '';
  })
    .filter(Boolean)
    .join(', ');
  return {
    head: `<h2>${item.rare ? 'Rare loot' : 'Loot'}</h2>`,
    actions: `<div class="actions">
      <div class="item${item.rare ? ' rare' : ''}"><span class="label">${item.slot}</span><b>${esc(item.name)}</b><span>${plus(item.bonus)}</span></div>
      <p class="note">${current ? `Replaces your ${esc(current.name)} (${plus(current.bonus)}).` : `Your ${item.slot} slot is empty.`}${diff ? ` ${diff}.` : ''}</p>
      <div class="row"><button class="btn primary" type="button" data-act="take">Equip <kbd>E</kbd></button><button class="btn" type="button" data-act="leave">Leave it <kbd>L</kbd></button></div>
    </div>`,
  };
}

function endHtml(m) {
  const { hero, classId } = state;
  const name = R.CLASSES[classId].name;
  const again = Object.entries(R.CLASSES)
    .map(([id, c]) => `<button class="btn${id === classId ? ' primary' : ''}" type="button" data-class="${id}">${c.name}</button>`)
    .join('');
  return {
    head: `<h2>${m === 'won' ? 'The Hollow King falls' : `You died on floor ${state.floor}`}</h2>`,
    actions: `<div class="actions">
      <p class="note">${m === 'won' ? `You cleared all ${R.FLOORS} floors.` : `${state.floor - 1} of ${R.FLOORS} floors cleared.`} Level ${hero.level} ${name}, ${state.tally.kills} kills.</p>
      <span class="label">Play again as</span>
      <div class="row">${again}</div>
    </div>`,
  };
}

function renderPanel() {
  const m = G.mode(state);
  const view = { combat: combatHtml, levelup: levelHtml, loot: lootHtml, dead: endHtml, won: endHtml }[m] ?? exploreHtml;
  const { head, actions } = view(m);
  const log = state.log.slice(-6).reverse().map((line) => `<li>${esc(line)}</li>`).join('');
  // A new situation (fight, loot, level-up, ...) slides in.
  const enter = fx?.before && fx.before.mode !== m ? ' enter' : '';
  const celebrate = m === 'levelup' && enter ? ' celebrate' : '';
  return `<section class="panel box mode-${m}${celebrate}" aria-label="Encounter"><div class="${enter.trim()}">${head}</div>${rollHtml(state.roll)}<div class="${enter.trim()}">${actions}</div><ul class="log" aria-live="polite">${log}</ul></section>`;
}

// ---------- screens ----------

function renderDepth() {
  if (!state || picking) {
    depthEl.innerHTML = '';
    return;
  }
  const steps = Array.from({ length: R.FLOORS }, (_, i) => `<i class="${i + 1 < state.floor ? 'done' : i + 1 === state.floor ? 'here' : ''}"></i>`).join('');
  depthEl.innerHTML = `<span>Floor ${state.floor} of ${R.FLOORS}</span><span class="depth-steps" aria-hidden="true">${steps}</span>`;
}

function renderStart() {
  const cards = Object.entries(R.CLASSES)
    .map(([id, c]) => {
      const first = R.SKILLS[c.skills[0]];
      return `<button class="class-card" type="button" data-class="${id}">
        <div class="who">${heroIcon(id, 36)}<div class="who-name">${c.name}</div></div>
        <div>${c.blurb}</div>
        <div class="mini"><span>HP <b>${c.hp}</b></span>${R.STATS.map((s) => `<span>${cap(s)} <b>${c.stats[s]}</b></span>`).join('')}</div>
        <div class="muted"><b>${first.name}:</b> ${first.text}</div>
      </button>`;
    })
    .join('');
  const resume = state && !state.over ? '<button class="btn" type="button" data-act="resume">Back to your run</button>' : '';
  return `<div class="start">
    <section class="box" aria-label="Choose a class">
      <h2>Choose a class</h2>
      <p class="note">Six floors down, the Hollow King waits.</p>
      <div class="classes" style="margin-top:14px">${cards}</div>
      ${resume ? `<div style="margin-top:14px">${resume}</div>` : ''}
    </section>
    <section class="box rules" aria-label="How to play">
      <span class="label">How to play</span>
      <p><strong>One die decides everything.</strong> Each combat round you roll a single d6 and check it twice: roll + <strong>Might</strong> against the foe's <strong>Defense</strong> to hit, and roll + <strong>Grit</strong> against its <strong>Attack</strong> to block. Meet the number and you succeed.</p>
      <p>A 1 always fails both checks. A 6 always succeeds and your hit deals double.</p>
      <p><strong>Wits</strong> is your Focus. Each skill costs 1 Focus. Focus refills on every new floor, at shrines and when you level up.</p>
      <p>Kill monsters for XP. Each level adds 1 to a stat of your choice, refills HP and Focus, and some levels teach a new skill. Chests and elites roll on the loot table.</p>
      <p>You see what waits in the rooms next to you, except traps. Take the stairs when you are ready.</p>
    </section>
  </div>`;
}

function render() {
  const inRun = state && !picking;
  newRunBtn.hidden = !inRun;
  app.classList.toggle('playing', Boolean(inRun));
  if (!inRun) kitOpen = false;
  kitBtn.setAttribute('aria-expanded', String(kitOpen));
  renderDepth();
  if (!inRun) {
    screen.innerHTML = renderStart();
    return;
  }
  const hurt = happened('hurt').reduce((n, e) => n + e.amount, 0);
  const shake = hurt >= 2 ? ' shake-hard' : hurt ? ' shake-soft' : '';
  const arrive = fx?.arrive || happened('descend').length ? ' arriving' : '';
  screen.innerHTML = `<div class="board${shake}${kitOpen ? ' show-kit' : ''}">${renderSheet()}<section class="map-area" aria-label="Dungeon map"><div class="map-wrap${arrive}">${renderMap()}</div></section>${renderPanel()}</div>`;
  fx = null;
}

// ---------- input ----------

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function act(fn) {
  if (busy || !state) return;
  const before = snapshot();
  const rollBefore = state.roll?.n ?? 0;
  fn(state);
  const rolled = (state.roll?.n ?? 0) !== rollBefore ? state.roll.n : null;
  busy = true;
  if (rolled) await spin(state.roll.die);
  // Leaving a floor: the old map sinks away before the new one is drawn.
  if (state.events.some((e) => e.type === 'descend') && !reduceMotion) {
    document.querySelector('.map-wrap')?.classList.add('leaving');
    await wait(260);
  }
  busy = false;
  fx = { before, events: state.events, rolled };
  render();
  S.playEvents(state.events);
}

function spin(face) {
  const die = document.getElementById('die');
  if (!die || reduceMotion) {
    S.play('land');
    return Promise.resolve();
  }
  die.classList.remove('blank', 'six', 'one');
  die.classList.add('rolling');
  const timer = setInterval(() => {
    showFace(die, 1 + Math.floor(Math.random() * 6));
    S.play('tick');
  }, 55);
  return new Promise((resolve) =>
    setTimeout(() => {
      clearInterval(timer);
      showFace(die, face);
      S.play('land');
      resolve();
    }, 420),
  );
}

function start(classId) {
  state = G.newGame(classId, Date.now());
  picking = false;
  fx = { arrive: true };
  render();
  S.play('descend');
}

const ACTIONS = {
  attack: G.attack,
  flee: G.flee,
  potion: G.drinkPotion,
  descend: G.descend,
  take: G.takeLoot,
  leave: G.leaveLoot,
};

screen.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-room],[data-class],[data-skill],[data-stat]');
  if (!el) return;
  const { act: name, room, class: classId, skill, stat } = el.dataset;
  if (classId) start(classId);
  else if (name === 'close-kit') toggleKit(false);
  else if (name === 'resume') {
    picking = false;
    render();
  } else if (name) act(ACTIONS[name]);
  else if (room) act((s) => G.move(s, room));
  else if (skill) act((s) => G.useSkill(s, skill));
  else if (stat) act((s) => G.chooseStat(s, stat));
});

function toggleKit(open = !kitOpen) {
  kitOpen = open;
  kitBtn.setAttribute('aria-expanded', String(kitOpen));
  document.querySelector('.board')?.classList.toggle('show-kit', kitOpen);
  if (kitOpen) document.querySelector('#kit .btn')?.focus();
}
kitBtn.addEventListener('click', () => toggleKit());

newRunBtn.addEventListener('click', () => {
  picking = true;
  render();
});

// Audio may only start after a gesture; every gesture also resumes it.
for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => S.unlock(), { capture: true });

function renderSound() {
  const on = !S.isMuted();
  const waves = on
    ? '<path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" fill="none" stroke="currentColor" stroke-width="1.4"/>'
    : '<path d="M11 5.5l4 5M15 5.5l-4 5" stroke="currentColor" stroke-width="1.6"/>';
  soundBtn.setAttribute('aria-pressed', String(on));
  soundBtn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  soundBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/>${waves}</svg><span class="wide-only">${on ? 'Sound on' : 'Sound off'}</span>`;
}
soundBtn.addEventListener('click', () => {
  S.setMuted(!S.isMuted());
  renderSound();
});
renderSound();

const MOVES = { ArrowUp: [0, -1], ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0] };

document.addEventListener('keydown', (e) => {
  if (!state || picking || e.metaKey || e.ctrlKey || e.altKey) return;
  if (kitOpen && e.key === 'Escape') {
    toggleKit(false);
    kitBtn.focus();
    return;
  }
  const m = G.mode(state);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const room = e.target.closest?.('[data-room]');
  if (room && (key === 'Enter' || key === ' ')) {
    e.preventDefault();
    act((s) => G.move(s, room.dataset.room));
    return;
  }
  if (e.target.closest?.('button')) {
    if (key === 'Enter' || key === ' ') return; // let the focused button act
  }
  let handled = true;
  if (m === 'explore' && MOVES[key]) {
    const { x, y } = state.rooms[state.pos];
    act((s) => G.move(s, G.key(x + MOVES[key][0], y + MOVES[key][1])));
  } else if (m === 'combat' && (key === ' ' || key === 'Enter')) act(G.attack);
  else if (m === 'combat' && /^[1-3]$/.test(key)) {
    const id = state.hero.skills[Number(key) - 1];
    if (id) act((s) => G.useSkill(s, id));
  } else if (m === 'combat' && key === 'f') act(G.flee);
  else if ((m === 'combat' || m === 'explore') && key === 'p') act(G.drinkPotion);
  else if (m === 'explore' && key === 'd') act(G.descend);
  else if (m === 'levelup' && /^[1-3]$/.test(key)) act((s) => G.chooseStat(s, R.STATS[Number(key) - 1]));
  else if (m === 'loot' && key === 'e') act(G.takeLoot);
  else if (m === 'loot' && key === 'l') act(G.leaveLoot);
  else handled = false;
  if (handled) e.preventDefault();
});

// Keep the run across live updates of the page.
window.claude?.hot?.snapshot?.(() => ({ state, picking }));
function boot(data) {
  state = data?.state ?? null;
  picking = data?.picking ?? !state;
  render();
}
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
