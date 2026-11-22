import * as H from './engine.js';
import { dieHtml, spin, store } from '../shared/dice.js';
import { mapSvg, neighbors } from '../shared/map-view.js';
import * as S from '../../../src/sound.js';

const SAVE = 'high-roller:profile';
const screen = document.getElementById('screen');
const soundBtn = document.getElementById('sound');

let profile = store.get(SAVE, null) ?? H.newProfile();
let run = null;
let busy = false;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function faceHtml(f, { lit = false, slot = null, tag = 'div' } = {}) {
  const label = H.faceText(f);
  const [word, num] = { hit: ['Hit', f.n], block: ['Block', ''], parry: ['Parry', f.n], heal: ['Heal', f.n], chip: ['Chip', `+${f.n}`], blank: ['—', ''] }[f.kind];
  const attrs = slot != null ? ` type="button" data-slot="${slot}" aria-label="Replace face ${slot + 1}: ${label}"` : ` aria-label="${label}"`;
  return `<${tag} class="face k-${f.kind}${lit ? ' lit' : ''}"${attrs}><span>${word}<br><b>${num}</b></span></${tag}>`;
}

function dieRow(die, { lit = null, pick = false } = {}) {
  return `<div class="faces">${die.map((f, i) => faceHtml(f, { lit: i === lit, slot: pick ? i : null, tag: pick ? 'button' : 'div' })).join('')}</div>`;
}

// ---------- lobby ----------

function lobbyHtml() {
  const ups = Object.entries(H.META)
    .map(([id, u]) => {
      const lv = profile.levels[id];
      const maxed = lv >= u.max;
      const can = !maxed && profile.chips >= H.metaCost(id, lv);
      return `<div class="up"><b>${u.name} <span class="lv">${lv}/${u.max}</span></b><p class="note">${u.text}</p>
        <button class="btn" type="button" data-meta="${id}" ${can ? '' : 'disabled'}>${maxed ? 'Maxed' : `${H.metaCost(id, lv)} chips`}</button></div>`;
    })
    .join('');
  return `<section class="screen lobby">
    <div class="box" style="display:grid;gap:12px;align-content:start">
      <h2>${profile.wins ? `You have beaten the House ${profile.wins} time${profile.wins > 1 ? 's' : ''}.` : 'Beat the House'}</h2>
      <p class="note">Your die is your whole character: six faces, no stats. In a fight you roll, then keep the face or pay a chip to reroll. The guard hits you unless the face blocks. Safes hold new faces; you choose which face to replace. Every chip you don't spend is yours to keep when the run ends.</p>
      <span class="label">Your starting die</span>
      ${dieRow(H.startDie(profile))}
      <div class="row"><button class="btn primary" type="button" data-act="start">Walk in · ${H.RULES.startNerve + 2 * profile.levels.nerve} Nerve, ${profile.levels.stake} chips</button></div>
      <p class="note">${profile.runs} run${profile.runs === 1 ? '' : 's'}, ${profile.wins} won.</p>
      <button class="btn ghost" type="button" data-act="wipe" style="justify-self:start">Wipe progress</button>
    </div>
    <div class="box" style="display:grid;gap:10px;align-content:start">
      <h2>The cashier <span class="chips">${profile.chips} chips</span></h2>
      <div class="ups">${ups}</div>
    </div>
  </section>`;
}

// ---------- a run ----------

function glyph(room) {
  switch (room.kind) {
    case 'guard':
      return room.foe.boss
        ? '<polygon class="g-foe" points="0,-24 20,0 0,24 -20,0"/><text class="g-num" y="5" text-anchor="middle">H</text>'
        : `<polygon class="g-foe" points="0,-17 14,0 0,17 -14,0"/><text class="g-num" y="5" text-anchor="middle">${room.foe.hp}</text>`;
    case 'safe':
      return '<rect class="g-ink" x="-13" y="-13" width="26" height="26"/><circle class="g-ink" r="6"/>';
    case 'bar':
      return '<path class="g-ink" d="M-12 -12H12L0 2ZM0 2V13M-7 13H7"/>';
    case 'elevator':
      return '<rect class="g-ink" x="-12" y="-15" width="24" height="30"/><path class="g-ink" d="M-5 -3L0 -8L5 -3M-5 3L0 8L5 3"/>';
    case 'tripped':
      return '<path class="g-soft" d="M-12 -12L12 12M12 -12L-12 12"/>';
    default:
      return '';
  }
}

const HERO = '<circle class="g-hero" r="12"/>';

function rollLine() {
  const r = run.roll;
  if (!r) return `<div class="result">${dieHtml(0)}<span class="note">Roll your die to see which face comes up.</span></div>`;
  const face = r.face;
  const note = r.kind === 'alarm' ? (r.ok ? 'Slipped past the alarm' : 'Caught by the alarm') : r.rerolled ? 'Rerolled' : 'Rolled';
  return `<div class="result">${dieHtml(r.die)}<div style="display:grid;gap:2px"><span class="note">${note} face ${r.die}</span><span class="what">${esc(H.faceText(face))}</span></div></div>`;
}

function panelHtml() {
  const m = H.mode(run);
  const room = run.rooms[run.pos];
  let head = '';
  let actions = '';
  if (m === 'fight' || m === 'decide') {
    const { foe } = room;
    const hp = Array.from({ length: foe.max }, (_, i) => `<i class="${i < foe.hp ? '' : 'off'}"></i>`).join('');
    head = `<h2>${esc(foe.name)}</h2><div class="hp" aria-label="${foe.hp} of ${foe.max}">${hp}</div><p class="note">Hits for ${foe.dmg} each round unless your face blocks.</p>`;
    actions =
      m === 'fight'
        ? '<div class="row"><button class="btn primary" type="button" data-act="roll">Roll</button></div>'
        : `<div class="row"><button class="btn primary" type="button" data-act="keep">Keep ${esc(H.faceText(run.die[run.combat.face]))}</button>
           <button class="btn" type="button" data-act="reroll" ${run.chips < 1 ? 'disabled' : ''}>Reroll <small>1 chip</small></button></div>`;
  } else if (m === 'offer') {
    head = `<h2>A new face</h2><div class="offer">${faceHtml(run.offer)}<p class="note">Tap the face on your die it should replace, or leave it.</p></div>`;
    actions = `${dieRow(run.die, { pick: true })}<div class="row"><button class="btn ghost" type="button" data-act="leave">Leave it</button></div>`;
  } else if (m === 'explore') {
    head = `<h2>${room.kind === 'elevator' ? 'The elevator' : H.FLOOR_NAMES[run.floor - 1]}</h2><p class="note">Tap a room next to yours to move.${run.floor < H.FLOORS && room.kind === 'elevator' ? ' Going down refills your Nerve.' : ''}</p>`;
    if (room.kind === 'elevator') actions = '<div class="row"><button class="btn primary" type="button" data-act="descend">Go down</button></div>';
  } else {
    head = `<h2>${m === 'won' ? 'You beat the House' : 'Bust'}</h2><p class="note">You leave with <span class="chips">${run.chips} chips</span>.</p>`;
    actions = '<div class="row"><button class="btn primary" type="button" data-act="cash">Cash out</button></div>';
  }
  const log = run.log.slice(-5).reverse().map((l) => `<li>${esc(l)}</li>`).join('');
  return `<section class="panel box">${head}${rollLine()}${actions}<ul class="log">${log}</ul></section>`;
}

function runHtml() {
  const reachable = new Set(H.mode(run) === 'explore' ? neighbors(run.rooms, run.pos) : []);
  const pips = Array.from({ length: run.maxNerve }, (_, i) => `<i class="${i < run.nerve ? 'on' : ''}"></i>`).join('');
  const lit = H.mode(run) === 'decide' ? run.combat.face : null;
  return `<section class="screen run">
    <div class="hud box">
      <div class="line">
        <span><span class="label">Floor</span> <b class="num">${run.floor}/${H.FLOORS}</b> <span class="note">${H.FLOOR_NAMES[run.floor - 1]}</span></span>
        <span style="display:grid;gap:3px"><span class="label">Nerve ${run.nerve}/${run.maxNerve}</span><span class="pips">${pips}</span></span>
        <span><span class="label">Chips</span> <span class="chips">${run.chips}</span></span>
      </div>
      ${dieRow(run.die, { lit })}
    </div>
    <div class="map">${mapSvg({ rooms: run.rooms, pos: run.pos, glyph, hero: HERO, reachable, label: `Floor ${run.floor}` })}</div>
    ${panelHtml()}
  </section>`;
}

function render() {
  screen.innerHTML = run ? runHtml() : lobbyHtml();
}

// ---------- input ----------

const SOUNDS = { move: 'step', encounter: 'encounter', loot: 'chest', disarm: 'disarm', heal: 'heal', descend: 'descend', hit: 'hit', block: 'block', hurt: 'hurt', kill: 'kill', chip: 'equip', reroll: 'tick', equip: 'equip', dead: 'descend', won: 'crit' };

async function act(fn) {
  if (busy || !run) return;
  const before = run.roll?.n ?? 0;
  fn(run);
  if ((run.roll?.n ?? 0) !== before) {
    busy = true;
    await spin(document.querySelector('.panel .die'), run.roll.die, () => S.play('tick'));
    S.play('land');
    busy = false;
  }
  render();
  run.events.forEach((e, n) => SOUNDS[e.type] && setTimeout(() => S.play(SOUNDS[e.type]), 80 * n));
}

screen.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act],[data-room],[data-meta],[data-slot]');
  if (!el) return;
  const { act: name, room, meta, slot } = el.dataset;
  if (meta) {
    H.buyMeta(profile, meta);
    store.set(SAVE, profile);
    S.play('equip');
    render();
  } else if (name === 'start') {
    run = H.newRun(profile, Date.now());
    S.play('descend');
    render();
  } else if (name === 'cash') {
    H.settle(profile, run);
    store.set(SAVE, profile);
    run = null;
    render();
  } else if (name === 'wipe') {
    profile = H.newProfile();
    store.set(SAVE, profile);
    render();
  } else if (room) act((r) => H.move(r, room));
  else if (slot != null) act((r) => H.takeFace(r, Number(slot)));
  else if (name === 'leave') act((r) => H.takeFace(r, null));
  else if (name === 'roll') act(H.roll);
  else if (name === 'reroll') act(H.reroll);
  else if (name === 'keep') act(H.keep);
  else if (name === 'descend') act(H.descend);
});

screen.addEventListener('keydown', (e) => {
  const room = e.target.closest?.('[data-room]');
  if (room && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    act((r) => H.move(r, room.dataset.room));
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
