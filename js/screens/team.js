import { UI } from '../strings.js';
import { renderRoster } from './roster.js';
import { renderSchedule } from './schedule.js';

const TABS = [
  { id: 'roster', name: '選手名單', render: renderRoster },
  { id: 'schedule', name: '賽程表', render: renderSchedule },
];

/** 上任之後的主畫面。目前有兩個分頁，主要玩法做好之後會再加。 */
export function renderTeam(root, game, onReset) {
  let active = TABS[0].id;

  root.innerHTML = `
    <div class="screen">
      <header class="masthead masthead--compact">
        <h1 class="masthead__title">${game.school.name}</h1>
        <p class="masthead__sub">${game.school.prefectureName}　監督 ${game.manager.name}</p>
        <p class="masthead__meta">
          ${game.difficulty.teams} ${UI.unitTeam}／${UI.toKoshien}
          ${game.difficulty.wins} ${UI.unitWin}
          ・<span class="tier">${game.difficulty.tier}</span>
        </p>
      </header>

      <nav class="tabs" id="tabs">
        ${TABS.map((t) => `<button type="button" class="tab" data-tab="${t.id}">${t.name}</button>`).join('')}
      </nav>

      <div id="tabContent"></div>

      <button type="button" class="btn btn--ghost btn--wide" id="resetBtn">${UI.resetBtn}</button>
    </div>`;

  const content = root.querySelector('#tabContent');
  const tabs = root.querySelector('#tabs');

  function draw() {
    tabs.querySelectorAll('.tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === active);
    });
    TABS.find((t) => t.id === active).render(content, game);
  }

  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b || b.dataset.tab === active) return;
    active = b.dataset.tab;
    draw();
  });

  root.querySelector('#resetBtn').addEventListener('click', onReset);
  draw();
}
