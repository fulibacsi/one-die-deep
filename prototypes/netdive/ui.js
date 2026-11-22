import * as N from './engine.js';
import { dieHtml, spin, store } from '../shared/dice.js';
import { mapSvg, neighbors } from '../shared/map-view.js';
import * as S from '../../src/sound.js';

const SAVE = 'netdive:profile';
const screen = document.getElementById('screen');
const soundBtn = document.getElementById('sound');

let profile = store.get(SAVE, null) ?? N.newProfile();
let dive = null;
let busy = false;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const range = (a, b) => (a > b ? 'never' : a === b ? `${a}` : `${a}–${b}`);

// The single stat, drawn as the six faces of the die.
function strip(bias, zeroDays) {
  const cells = [1, 2, 3, 4, 5, 6]
    .map((f) => `<span class="${zeroDays.includes(f) ? 'zd' : f < bias ? 'brk' : 'gh'}">${f}</span>`)
    .join('');
  return `<div class="strip" aria-label="Break wins on ${range(1, bias - 1)}, zero-day on ${zeroDays.join(' or ')}, ghost wins on ${range(bias + 1, 6)}">${cells}</div>
    <div class="legend"><span>Break &lt; ${bias}</span><span>Zero-day ${zeroDays.join('/')}</span><span>Ghost &gt; ${bias}</span></div>`;
}

// ---------- between dives ----------

function hubHtml() {
  const [lo, hi] = N.biasRange(profile);
  const zeroDays = profile.levels.exploit ? [profile.bias, profile.bias + 1] : [profile.bias];
  const biasCtl =
    lo === hi
      ? '<p class="note">Buy the Bias tuner to change it.</p>'
      : `<div class="row">${Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
          .map((b) => `<button class="btn${b === profile.bias ? ' primary' : ''}" type="button" data-bias="${b}">${b}</button>`)
          .join('')}</div>`;
  const ups = Object.entries(N.UPGRADES)
    .map(([id, u]) => {
      const lv = profile.levels[id];
      const maxed = lv >= u.max;
      return `<div class="up"><b>${u.name} <span class="lv">${lv}/${u.max}</span></b><p class="note">${u.text}</p>
        <button class="btn" type="button" data-buy="${id}" ${N.canBuy(profile, id) ? '' : 'disabled'}>${maxed ? 'Maxed' : `${N.cost(id, lv)} data`}</button></div>`;
    })
    .join('');
  const intro = profile.dives
    ? `<p class="note">${profile.dives} dive${profile.dives > 1 ? 's' : ''}, ${profile.earned} data earned, deepest layer ${profile.deepest} of ${N.LAYERS}.</p>`
    : `<p class="note">Crack the Core on layer ${N.LAYERS}. Each dive lasts until your cycles run out; every move and roll costs one. You keep every bit of data you pull out, and spend it here on your rig.</p>`;
  return `<section class="screen hub">
    <div class="box" style="display:grid;gap:12px;align-content:start">
      <h2>${profile.won ? 'Core cracked. The network is yours.' : 'Your rig'}</h2>
      ${intro}
      <div><span class="label">Bias</span> <span class="num" style="font-size:22px">${profile.bias}</span></div>
      <p class="note">One stat. Against ICE, <b>Break</b> wins on a roll under your Bias and earns data. <b>Ghost</b> wins on a roll over it and only gets you past. Rolling your Bias exactly is a zero-day: the ICE crashes and pays out.</p>
      ${strip(profile.bias, zeroDays)}
      ${biasCtl}
      <div class="row"><button class="btn primary" type="button" data-act="dive">Dive · ${N.maxCycles(profile)} cycles from layer ${N.startLayer(profile)}</button></div>
      <div><span class="label">Data</span> <span class="num" style="font-size:22px">${profile.data}</span></div>
      <button class="btn ghost" type="button" data-act="wipe" style="justify-self:start">Wipe progress</button>
    </div>
    <div class="box" style="display:grid;gap:10px;align-content:start"><h2>Upgrades</h2><div class="ups">${ups}</div></div>
  </section>`;
}

// ---------- during a dive ----------

function hexagon(r, cls) {
  const pts = Array.from({ length: 6 }, (_, i) => `${(r * Math.cos((Math.PI / 3) * i)).toFixed(1)},${(r * Math.sin((Math.PI / 3) * i)).toFixed(1)}`).join(' ');
  return `<polygon class="${cls}" points="${pts}"/>`;
}

function glyph(node) {
  switch (node.kind) {
    case 'ice':
      return `${hexagon(node.ice.core ? 24 : 18, 'g-ice')}<text class="g-num" y="6" text-anchor="middle">${node.ice.layers}</text>`;
    case 'ghosted':
      return hexagon(18, 'g-ice-off');
    case 'cache':
      return node.visited || node.seen ? '<rect class="g-ink" x="-11" y="-11" width="22" height="22"/><path class="g-ink" d="M-11 0H11"/>' : '';
    case 'trace':
      return ''; // hidden until it fires
    case 'tripped':
      return '<path class="g-soft" d="M-12 -12L12 12M12 -12L-12 12"/>';
    case 'backdoor':
      return '<path class="g-ink" d="M-8 -14H8V14H-8M-2 0H-16M-10 -6L-16 0L-10 6"/>';
    case 'uplink':
      return '<path class="g-ink" d="M-12 -8L0 6L12 -8M-12 4L0 18L12 4"/>';
    default:
      return '';
  }
}

const HERO = '<polygon class="g-hero" points="-10,-13 13,0 -10,13"/>';

function rollHtml() {
  const r = dive.roll;
  if (!r) return `<div class="result">${dieHtml(0)}<span class="note">Every outcome is one roll of this die.</span></div>`;
  let what = '';
  if (r.kind === 'cache') what = `<span class="what ok">Cache · ${r.die} × layer</span>`;
  else if (r.kind === 'trace') what = r.ok ? '<span class="what ok">Unseen</span>' : '<span class="what bad">Traced −3</span>';
  else {
    const verb = r.kind === 'break' ? 'Break' : 'Ghost';
    what =
      r.outcome === 'zero-day'
        ? '<span class="what zero">Zero-day</span>'
        : r.outcome === 'success'
          ? `<span class="what ok">${verb} works</span>`
          : `<span class="what bad">${verb} fails</span>`;
    if (r.rerolled) what += `<span class="note">Buffer rerolled a ${r.rerolled}.</span>`;
  }
  return `<div class="result">${dieHtml(r.die)}<div style="display:grid;gap:2px">${what}</div></div>`;
}

function panelHtml() {
  const m = N.mode(dive);
  const here = dive.rooms[dive.pos];
  let head;
  let actions;
  if (m === 'ice') {
    const { ice } = here;
    const pips = Array.from({ length: ice.max }, (_, i) => `<i class="${i < ice.layers ? '' : 'off'}"></i>`).join('');
    head = `<h2>${esc(ice.name)}</h2><div class="layers" aria-label="${ice.layers} of ${ice.max} layers left">${pips}</div>
      <p class="note">${ice.core ? 'Break all six layers to win.' : 'Break pays data when it crashes; Ghost only gets you past.'} A failed roll costs ${Math.max(1, ice.counter - dive.firewall)} extra cycle${ice.counter - dive.firewall > 1 ? 's' : ''}.</p>`;
    actions = `<div class="row">
      <button class="btn primary" type="button" data-act="break">Break <small>wins on ${range(1, dive.bias - 1)}</small></button>
      <button class="btn" type="button" data-act="ghost" ${ice.core ? 'disabled' : ''}>Ghost <small>wins on ${range(dive.bias + 1, 6)}</small></button>
    </div>`;
  } else if (m === 'explore') {
    head = `<h2>${here.kind === 'uplink' ? 'Uplink to the next layer' : 'Node clear'}</h2><p class="note">Tap a node next to you to move. Each move costs a cycle.</p>`;
    actions = `<div class="row">${here.kind === 'uplink' ? `<button class="btn primary" type="button" data-act="descend">Descend to layer ${dive.layer + 1}</button>` : ''}<button class="btn ghost" type="button" data-act="jackout">Jack out</button></div>`;
  } else {
    const title = { won: 'Core cracked', out: 'Disconnected', jacked: 'Jacked out' }[m];
    head = `<h2>${title}</h2><p class="note">You bring back <b>${dive.data}</b> data from layer ${dive.layer}.</p>`;
    actions = '<div class="row"><button class="btn primary" type="button" data-act="home">Back to the rig</button></div>';
  }
  const log = dive.log.slice(-5).reverse().map((l) => `<li>${esc(l)}</li>`).join('');
  return `<section class="panel box">${head}${rollHtml()}${actions}<ul class="log">${log}</ul></section>`;
}

function diveHtml() {
  const reachable = new Set(N.mode(dive) === 'explore' ? neighbors(dive.rooms, dive.pos) : []);
  return `<section class="screen dive">
    <div class="hud box">
      <div><span class="label">Layer</span> <b class="num">${dive.layer}/${N.LAYERS}</b> <span class="note">${N.LAYER_NAMES[dive.layer - 1]}</span></div>
      <div class="grow"><span class="label">Cycles ${dive.cycles}/${dive.max}</span><div class="bar"><b style="width:${(100 * dive.cycles) / dive.max}%"></b></div></div>
      <div><span class="label">Data</span> <b class="num">${dive.data}</b></div>
      <div style="min-width:180px">${strip(dive.bias, dive.zeroDays)}</div>
    </div>
    <div class="map">${mapSvg({ rooms: dive.rooms, pos: dive.pos, glyph, hero: HERO, reachable, shape: 'circle', label: `Layer ${dive.layer}` })}</div>
    ${panelHtml()}
  </section>`;
}

function render() {
  screen.innerHTML = dive ? diveHtml() : hubHtml();
}

// ---------- input ----------

const SOUNDS = { move: 'step', encounter: 'encounter', hit: 'hit', kill: 'kill', ghost: 'escape', hurt: 'hurt', trace: null, backdoor: 'heal', descend: 'descend', data: 'chest', disconnected: 'hurt', won: 'crit', jackout: 'escape' };

async function act(fn) {
  if (busy || !dive) return;
  const before = dive.roll?.n ?? 0;
  fn(dive);
  if ((dive.roll?.n ?? 0) !== before) {
    busy = true;
    await spin(document.querySelector('.panel .die'), dive.roll.die, () => S.play('tick'));
    S.play('land');
    busy = false;
  }
  render();
  let at = 0;
  for (const e of dive.events) {
    const name = e.type === 'trace' ? (e.ok ? 'disarm' : 'sprung') : e.type === 'kill' && e.zeroDay ? 'crit' : SOUNDS[e.type];
    if (name) setTimeout(() => S.play(name), (at += 80));
  }
}

screen.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-room],[data-buy],[data-bias]');
  if (!el) return;
  const { act: name, room, buy, bias } = el.dataset;
  if (buy) {
    N.buy(profile, buy);
    store.set(SAVE, profile);
    S.play('equip');
    render();
  } else if (bias) {
    N.setBias(profile, Number(bias));
    store.set(SAVE, profile);
    render();
  } else if (name === 'dive') {
    dive = N.startDive(profile, Date.now());
    S.play('descend');
    render();
  } else if (name === 'home') {
    N.settle(profile, dive);
    store.set(SAVE, profile);
    dive = null;
    render();
  } else if (name === 'wipe') {
    profile = N.newProfile();
    store.set(SAVE, profile);
    render();
  } else if (room) act((d) => N.move(d, room));
  else if (name === 'break' || name === 'ghost') act((d) => N.attempt(d, name));
  else if (name === 'descend') act(N.descend);
  else if (name === 'jackout') act(N.jackOut);
});

screen.addEventListener('keydown', (e) => {
  const room = e.target.closest?.('[data-room]');
  if (room && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    act((d) => N.move(d, room.dataset.room));
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
