import * as N from './engine.js';
import { dieHtml, spin, store } from '../shared/dice.js';
import { mapSvg, neighbors } from '../shared/map-view.js';
import * as S from '../../../src/sound.js';

const SAVE = 'starhold:v1';
const screen = document.getElementById('screen');
const soundBtn = document.getElementById('sound');

let profile = store.get(SAVE, null) ?? N.newProfile();
let campaign = null;
let last = null; // what the last campaign took and shipped home, shown once on the hub
let busy = false;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const range = (a, b) => (a > b ? 'never' : a === b ? `${a}` : `${a}–${b}`);
const dice = (n) => `${n} ${n === 1 ? 'die' : 'dice'}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const LETTER = { alloys: 'A', fuel: 'F', labor: 'L' };
const amounts = (obj) => Object.entries(obj).filter(([, n]) => n).map(([r, n]) => `+${n} ${N.RESOURCES[r].toLowerCase()}`).join(', ') || 'nothing';

function resources(values, notes = {}) {
  return `<div class="res">${Object.entries(N.RESOURCES)
    .map(([r, name]) => `<span class="${r}"><i></i>${name} <b>${values[r]}</b>${notes[r] ? ` <small>${notes[r]}</small>` : ''}</span>`)
    .join('')}</div>`;
}

// Aggression on the die's faces.
function strip(a) {
  const cells = [1, 2, 3, 4, 5, 6].map((f) => `<span class="${f === a ? 'zd' : f < a ? 'prg' : 'ens'}">${f}</span>`).join('');
  return `<div class="strip" aria-label="Aggression ${a}: Purge hits on ${range(1, a - 1)}, either on ${a}, Enslave hits on ${range(a + 1, 6)}">${cells}</div>
    <div class="legend"><span>Purge &lt; ${a}</span><span>Either ${a}</span><span>Enslave &gt; ${a}</span></div>`;
}

// ---------- the map ----------

const pts = (list) => list.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const triangle = (r, cls) => `<polygon class="${cls}" points="${pts([[0, -r], [r * 0.95, r * 0.65], [-r * 0.95, r * 0.65]])}"/>`;
const star = (r, cls) =>
  `<polygon class="${cls}" points="${pts(Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const d = i % 2 ? r * 0.45 : r;
    return [d * Math.cos(a), d * Math.sin(a)];
  }))}"/>`;

function glyph(sys) {
  if (sys.kind === 'home') return star(20, 'g-home');
  if (sys.owned) {
    const [r, n] = Object.entries(N.yields(sys))[0];
    return `<circle class="g-${r}" r="14"/><text class="g-num" y="6" text-anchor="middle">${LETTER[r]}</text><text class="g-tag" y="37" text-anchor="middle">+${n}</text>`;
  }
  if (sys.species) {
    const core = sys.kind === 'core';
    // In the triangle: strength. Under it: the planet's resource, and how hard they strike back.
    return `${triangle(core ? 26 : 19, 'g-foe')}<text class="g-num" y="${core ? 9 : 8}" text-anchor="middle">${sys.species.strength}</text><text class="g-tag" y="38" text-anchor="middle">${core ? '' : `${LETTER[sys.planet]} `}−${sys.species.strike}</text>`;
  }
  const ring = `<circle class="g-ring g-${sys.planet}" r="12"/><text class="g-tag" y="6" text-anchor="middle">${LETTER[sys.planet]}</text>`;
  if (sys.kind === 'derelict') return `${ring}<path class="g-ink" d="M-20 -20L-12 -12M14 -18L20 -12M-18 16L-12 12"/>`;
  return ring;
}

const HERO = '<polygon class="g-hero" points="-10,-13 13,0 -10,13"/>';
const classOf = (sys) => (sys.owned ? 'owned' : '');

// ---------- between campaigns ----------

function hubHtml() {
  const p = profile;
  const [lo, hi] = N.aggressionRange(p);
  const rate = N.income(p);
  const aggCtl =
    lo === hi
      ? '<p class="note">Buy War doctrine to choose it.</p>'
      : `<div class="row">${Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
          .map((a) => `<button class="btn${a === p.aggression ? ' primary' : ''}" type="button" data-agg="${a}">${a}</button>`)
          .join('')}</div>`;
  const ups = Object.entries(N.UPGRADES)
    .map(([id, u]) => {
      const lv = p.levels[id];
      const maxed = lv >= u.max;
      return `<div class="up"><b>${u.name} <span class="lv">${lv}/${u.max}</span></b><p class="note">${u.text}</p>
        <button class="btn" type="button" data-buy="${id}" ${N.canBuy(p, id) ? '' : 'disabled'}>${maxed ? 'Maxed' : `${N.cost(id, lv)} ${N.RESOURCES[u.pay].toLowerCase()}`}</button></div>`;
    })
    .join('');
  const intro = p.campaigns
    ? `<p class="note">${plural(p.campaigns, 'campaign')}. You hold ${N.held(p)} of ${N.SYSTEMS} systems.</p>`
    : '<p class="note">Take the Precursor throneworld at the far end of the galaxy. A campaign lasts until your supply runs out or you recall the fleet. Systems you take stay yours, and after every campaign each one ships its output home.</p>';
  const shipped = last
    ? `<p class="note"><b>Last campaign:</b> ${last.taken.length ? `took ${plural(last.taken.length, 'system')}` : 'took no systems'}. Your empire shipped home ${amounts(last.got)}.</p>`
    : '';
  return `<section class="screen hub">
    <div class="box" style="display:grid;gap:12px;align-content:start">
      <h2>${p.won ? 'The galaxy is yours.' : 'Your empire'}</h2>
      ${intro}${shipped}
      <div><span class="label">Stockpile, and income per campaign</span>${resources(p.stock, Object.fromEntries(Object.entries(rate).map(([r, n]) => [r, `+${n}`])))}</div>
      <div class="map">${mapSvg({ rooms: p.rooms, pos: p.home, glyph, hero: HERO, shape: 'circle', label: 'Your galaxy', classOf })}</div>
      <div class="row"><button class="btn primary" type="button" data-act="launch">Launch a campaign · ${N.maxSupply(p)} supply</button></div>
      <button class="btn ghost" type="button" data-act="wipe" style="justify-self:start">New galaxy</button>
    </div>
    <div class="box" style="display:grid;gap:12px;align-content:start">
      <h2>Your fleet</h2>
      <div><span class="label">Aggression</span> <span class="num" style="font-size:22px">${p.aggression}</span></div>
      <p class="note">Two actions, rolled as in Lasers &amp; Feelings. Pick one, then roll its dice: each die under your Aggression is a hit for <b>Purge</b>, each one over it a hit for <b>Enslave</b>, and your Aggression exactly is a hit for either. 0 hits fail and the defenders strike back. 1 hit takes 1 strength, but they still strike back. 2 hits take 1 strength clean, and 3 take 2. A hit moves your Aggression one step toward the other action.</p>
      <p class="note">The final blow decides their fate. A purged world yields its planet's alloys or fuel, an enslaved one yields labor. Defenders you don't finish regroup between campaigns.</p>
      ${strip(p.aggression)}
      <p class="note">You roll <b>${dice(1 + p.levels.warfleet)}</b> to Purge and <b>${dice(1 + p.levels.overseers)}</b> to Enslave.</p>
      ${aggCtl}
      <h2>Upgrades</h2>
      <div class="ups">${ups}</div>
    </div>
  </section>`;
}

// ---------- during a campaign ----------

const OUTCOME = {
  fail: ['bad', 'Fails', 'and they strike back'],
  scrape: ['ok', '1 hit', '−1 strength, but they strike back'],
  clean: ['ok', '2 hits', '−1 strength, clean'],
  double: ['zero', '3 hits', '−2 strength'],
};

function rollHtml() {
  const r = campaign.roll;
  if (!r) return `<div class="result"><div class="dice">${dieHtml(0)}</div><span class="note">Battles are rolled with this die.</span></div>`;
  const faces = r.dice.map((die, i) => dieHtml(die, r.hits[i] ? (die === r.aggression ? 'hit zd' : 'hit') : 'miss')).join('');
  const [tone, head, tail] = OUTCOME[r.outcome];
  let what = `<span class="what ${tone}">${N.ACTIONS[r.kind]}: ${head}</span><span class="note">${tail}</span>`;
  if (r.aggressionTo != null && r.aggressionTo !== r.aggression) what += `<span class="note">Aggression ${r.aggression} → ${r.aggressionTo}</span>`;
  return `<div class="result"><div class="dice">${faces}</div><div style="display:grid;gap:2px">${what}</div></div>`;
}

function panelHtml() {
  const c = campaign;
  const m = N.mode(c);
  const here = c.rooms[c.pos];
  let head;
  let actions;
  if (m === 'battle') {
    const s = here.species;
    const core = here.kind === 'core';
    const pips = Array.from({ length: s.max }, (_, i) => `<i class="${i < s.strength ? '' : 'off'}"></i>`).join('');
    const f = N.fates(here);
    const fate = core
      ? 'Take the throneworld and the galaxy is yours.'
      : `<b>The final blow decides their fate.</b> Purge: ${amounts(f.purge)}, enslave: ${amounts(f.enslave)}, per campaign.`;
    // Your Aggression counts for either action, so each hits on one run of faces.
    const button = (id, faces) =>
      `<button class="btn attack" type="button" data-act="${id}"><span>${N.ACTIONS[id]} · ${dice(c.dice[id])}</span><small>a die hits on ${faces}</small></button>`;
    // The buttons come first, so on a phone they sit right under the map.
    head = `<div class="title-row"><h2>${core ? 'The Precursor throneworld' : `The ${esc(s.name)}`}</h2><div class="layers" aria-label="Strength ${s.strength} of ${s.max}">${pips}</div></div>
      <div class="row">${button('purge', range(1, c.aggression))}${button('enslave', range(c.aggression, 6))}<button class="btn ghost small" type="button" data-act="recall">Recall</button></div>`;
    actions = `<p class="note">Hits: 0 fail, 1 takes 1 strength, and both mean they strike back −${s.strike}. 2 take 1 clean, 3 take 2.</p><p class="note">${fate}</p>`;
  } else if (m === 'explore') {
    head = `<h2>${here.kind === 'home' ? 'Homeworld' : 'In orbit'}</h2><p class="note">Tap a system to fly there. Flying through your own systems is free; any other system costs 1 supply.</p>`;
    actions = '<div class="row"><button class="btn ghost" type="button" data-act="recall">Recall the fleet</button></div>';
  } else {
    const title = { won: 'The galaxy is yours', out: 'Out of supply', recalled: 'Fleet recalled' }[m];
    const count = (fate) => c.taken.filter((t) => t === fate).length;
    const detail = c.taken.length
      ? `: ${['claimed', 'purged', 'enslaved'].filter((f) => count(f)).map((f) => `${count(f)} ${f}`).join(', ')}`
      : '';
    head = `<h2>${title}</h2><p class="note">This campaign took ${plural(c.taken.length, 'system')}${detail}. Back home, every system you hold ships its output.</p>`;
    actions = '<div class="row"><button class="btn primary" type="button" data-act="home">Back to your empire</button></div>';
  }
  const log = c.log.slice(-5).reverse().map((l) => `<li>${esc(l)}</li>`).join('');
  return `<section class="panel box">${head}${rollHtml()}${actions}<ul class="log">${log}</ul></section>`;
}

function campaignHtml() {
  const c = campaign;
  const reachable = new Set(Object.keys(c.rooms).filter((k) => N.route(c, k)));
  const next = new Set(neighbors(c.rooms, c.pos).filter((k) => reachable.has(k)));
  return `<section class="screen campaign">
    <div class="hud box">
      <div><span class="label">Held</span> <b class="num">${N.held(profile)}/${N.SYSTEMS}</b></div>
      <div class="grow"><span class="label">Supply ${c.supply}/${c.max}</span><div class="bar"><b style="width:${(100 * c.supply) / c.max}%"></b></div></div>
      <div style="min-width:180px">${strip(c.aggression)}</div>
    </div>
    <div class="map">${mapSvg({ rooms: c.rooms, pos: c.pos, glyph, hero: HERO, reachable, next, shape: 'circle', label: 'The galaxy', classOf })}</div>
    ${panelHtml()}
  </section>`;
}

function render() {
  screen.innerHTML = campaign ? campaignHtml() : hubHtml();
}

// ---------- input ----------

const SOUNDS = { move: 'step', encounter: 'encounter', hit: 'hit', hurt: 'hurt', derelict: 'heal', out: 'hurt', won: 'crit', recall: 'escape' };
const TAKE_SOUNDS = { claimed: 'chest', purged: 'kill', enslaved: 'skill' };

async function act(fn) {
  if (busy || !campaign) return;
  busy = true;
  await show(fn);
  busy = false;
}

// Runs one engine action and shows what it did.
async function show(fn) {
  const before = campaign.roll?.n ?? 0;
  fn(campaign);
  if ((campaign.roll?.n ?? 0) !== before) {
    // Lay out a blank die for each one rolled, then tumble them together.
    const faces = campaign.roll.dice;
    const box = document.querySelector('.panel .result .dice');
    if (box) box.innerHTML = faces.map(() => dieHtml(0)).join('');
    const els = [...document.querySelectorAll('.panel .result .die')];
    await Promise.all(faces.map((face, i) => spin(els[i], face, i ? undefined : () => S.play('tick'))));
    S.play('land');
  }
  render();
  let at = 0;
  for (const e of campaign.events) {
    const name = e.type === 'take' ? TAKE_SOUNDS[e.fate] : e.type === 'hit' && e.double ? 'crit' : SOUNDS[e.type];
    if (name) setTimeout(() => S.play(name), (at += 80));
  }
}

// Flies to a system one move at a time, and stops if a move leads into
// anything but more flying.
async function travel(k) {
  const steps = campaign && N.route(campaign, k);
  if (busy || !steps) return;
  busy = true;
  for (const [i, step] of steps.entries()) {
    if (i) await new Promise((resolve) => setTimeout(resolve, 160));
    await show((c) => N.move(c, step));
    if (campaign.pos !== step || N.mode(campaign) !== 'explore') break;
  }
  busy = false;
}

screen.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-room],[data-buy],[data-agg]');
  if (!el) return;
  const { act: name, room, buy, agg } = el.dataset;
  if (buy) {
    N.buy(profile, buy);
    store.set(SAVE, profile);
    S.play('equip');
    render();
  } else if (agg) {
    N.setAggression(profile, Number(agg));
    store.set(SAVE, profile);
    render();
  } else if (name === 'launch') {
    campaign = N.launch(profile);
    last = null;
    S.play('descend');
    render();
  } else if (name === 'home') {
    last = { taken: campaign.taken, got: N.settle(profile, campaign) };
    store.set(SAVE, profile);
    campaign = null;
    render();
  } else if (name === 'wipe') {
    profile = N.newProfile();
    last = null;
    store.set(SAVE, profile);
    render();
  } else if (room) travel(room);
  else if (name === 'purge' || name === 'enslave') act((c) => N.attempt(c, name));
  else if (name === 'recall') act(N.recall);
});

screen.addEventListener('keydown', (e) => {
  const room = e.target.closest?.('[data-room]');
  if (room && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    travel(room.dataset.room);
  }
});

for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => S.unlock(), { capture: true });
function renderSound() {
  soundBtn.setAttribute('aria-pressed', String(!S.isMuted()));
  soundBtn.textContent = S.isMuted() ? 'Sound off' : 'Sound on';
}
soundBtn.addEventListener('click', () => {
  S.setMuted(!S.isMuted());
  renderSound();
});
renderSound();
render();
