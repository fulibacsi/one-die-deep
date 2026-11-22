import * as S from './engine.js';
import { dieHtml, spin } from '../shared/dice.js';
import * as Snd from '../../src/sound.js';

const screen = document.getElementById('screen');
const soundBtn = document.getElementById('sound');
let game = S.newGame(Date.now());
let marking = false;
let busy = false;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function cellHtml(cell, i) {
  if (!cell.open) {
    return `<button class="cell${cell.mark ? ' mark' : ''}" type="button" data-cell="${i}" aria-label="Dark water${cell.mark ? ', marked' : ''}"></button>`;
  }
  let inner;
  let label;
  if (cell.power) {
    const boss = cell.power === S.RULES.leviathan;
    inner = `<span class="foe${boss ? ' boss' : ''}">${cell.power}</span>`;
    label = `Defeated ${boss ? 'Leviathan' : S.NAMES[cell.power]}, power ${cell.power}`;
  } else {
    const e = S.shownEcho(game, i);
    inner = `<span class="${e === 0 ? 'e0' : e >= 10 ? 'ehi' : ''}">${e}</span>${cell.pearl ? '<i class="pearl"></i>' : ''}`;
    label = `Echo ${e}${cell.pearl ? ', pearl taken' : ''}`;
  }
  return `<div class="cell open" role="img" aria-label="${label}">${inner}</div>`;
}

function fightHtml() {
  const r = game.roll;
  if (!r) return `<div class="fight">${dieHtml(0)}<span class="note">Fights are one roll: the hull takes power minus the roll.</span></div>`;
  return `<div class="fight">${dieHtml(r.die)}<div style="display:grid;gap:2px">
    <span class="what ${r.dmg ? 'bad' : 'ok'}">${r.dmg ? `Hull −${r.dmg}` : 'No damage'}</span>
    <span class="math">power ${r.power} − roll ${r.die} = ${r.power - r.die}${r.power - r.die < 0 ? ', so 0' : ''}</span></div></div>`;
}

function render() {
  const need = S.xpToLevel(game.level);
  const max = S.maxHull(game.level);
  const pips = Array.from({ length: max }, (_, i) => `<i class="${i < game.hull ? 'on' : ''}"></i>`).join('');
  const left = game.cells.filter((c) => !c.open && c.power).length;
  const status = game.over
    ? `<h2>${game.over === 'won' ? 'The Leviathan is down' : 'The hull gives way'}</h2>
       <p class="note">${game.over === 'won' ? `Level ${game.level}, ${game.pings} pings.` : `${left} creatures were still out there.`}</p>
       <div class="row"><button class="btn primary" type="button" data-act="new">Dive again</button></div>`
    : `<h2>The trench</h2>
       <p class="note">Open water shows the total power of the creatures in the eight cells around it. Pinging a creature fights it. Level-ups repair the hull, so fight the small ones first.</p>
       <div class="row"><button class="btn${marking ? ' on' : ''}" type="button" data-act="mark" aria-pressed="${marking}">${marking ? 'Marking: tap to flag' : 'Mark mode'}</button></div>`;
  const log = game.log.slice(-5).reverse().map((l) => `<li>${esc(l)}</li>`).join('');
  screen.innerHTML = `
    <div class="hud box">
      <div><span class="label">Level</span> <b class="num">${game.level}</b></div>
      <div class="grow"><span class="label">Hull ${game.hull}/${max}</span><div class="pips">${pips}</div></div>
      <div class="grow"><span class="label">XP ${game.xp}/${need}</span><div class="bar"><b style="width:${(100 * game.xp) / need}%"></b></div></div>
      <div><span class="label">Creatures left</span> <b class="num">${left}</b></div>
    </div>
    <div class="board"><div class="grid" role="grid" aria-label="The trench, 8 by 8">${game.cells.map(cellHtml).join('')}</div></div>
    <section class="panel box">${fightHtml()}${status}<ul class="log">${log}</ul></section>`;
}

const SOUNDS = { move: 'step', heal: 'heal', hurt: 'hurt', block: 'block', kill: 'kill', levelup: 'skill', dead: 'descend', won: 'crit' };

async function ping(i) {
  if (busy) return;
  if (marking) {
    S.mark(game, i);
    render();
    return;
  }
  const before = game.roll?.n ?? 0;
  S.ping(game, i);
  if ((game.roll?.n ?? 0) !== before) {
    busy = true;
    Snd.play('encounter');
    await spin(document.querySelector('.panel .die'), game.roll.die, () => Snd.play('tick'));
    Snd.play('land');
    busy = false;
  }
  render();
  game.events.forEach((e, n) => SOUNDS[e.type] && setTimeout(() => Snd.play(SOUNDS[e.type]), 80 * n));
}

screen.addEventListener('click', (e) => {
  const el = e.target.closest('[data-cell],[data-act]');
  if (!el) return;
  if (el.dataset.cell) ping(Number(el.dataset.cell));
  else if (el.dataset.act === 'mark') {
    marking = !marking;
    render();
  } else if (el.dataset.act === 'new') {
    game = S.newGame(Date.now());
    marking = false;
    render();
  }
});
screen.addEventListener('contextmenu', (e) => {
  const el = e.target.closest('[data-cell]');
  if (!el) return;
  e.preventDefault();
  S.mark(game, Number(el.dataset.cell));
  render();
});

for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, () => Snd.unlock(), { capture: true });
function renderSound() {
  soundBtn.setAttribute('aria-pressed', String(!Snd.isMuted()));
  soundBtn.textContent = Snd.isMuted() ? 'Sound off' : 'Sound on';
}
soundBtn.addEventListener('click', () => {
  Snd.setMuted(!Snd.isMuted());
  renderSound();
});
renderSound();
render();
