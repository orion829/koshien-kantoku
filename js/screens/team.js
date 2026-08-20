import { UI } from '../strings.js';
import { save } from '../state.js';
import { renderWeek } from './week.js';
import { renderRoster } from './roster.js';
import { renderSchedule } from './schedule.js';
import { radarSVG } from './radar.js';
import { teamStrength } from '../rules/game.js';

const TABS = [
  { id: 'week', name: '本週', render: renderWeek },
  { id: 'roster', name: '選手名單', render: renderRoster },
  { id: 'schedule', name: '賽程表', render: renderSchedule },
];

/** 上任之後的主畫面 */
export function renderTeam(root, game, onReset) {
  let active = TABS[0].id;

  root.innerHTML = `
    <div class="screen">
      <header class="masthead masthead--team">
        <div>
          <h1 class="masthead__title">${game.school.name}</h1>
          <p class="masthead__sub">${game.school.prefectureName}　監督 ${game.manager.name}</p>
          <p class="masthead__meta">
            ${game.difficulty.teams} ${UI.unitTeam}／${UI.toKoshien}
            ${game.difficulty.wins} ${UI.unitWin}
            ・<span class="tier">${game.difficulty.tier}</span>
          </p>
          <p class="masthead__str">戰力 <b id="teamStr">${teamStrength(game.team.players)}</b></p>
        </div>
        <div class="masthead__radar" id="radarBox">${radarSVG(game.team.players)}</div>
      </header>

      <nav class="tabs" id="tabs">
        ${TABS.map((t) => `<button type="button" class="tab" data-tab="${t.id}">${t.name}</button>`).join('')}
      </nav>

      <div id="tabContent"></div>

      <button type="button" class="btn btn--ghost btn--wide" id="resetBtn">${UI.resetBtn}</button>
    </div>`;

  const content = root.querySelector('#tabContent');
  const tabs = root.querySelector('#tabs');

  // 做完一個行動之後：存檔、重畫
  function afterAction() {
    save(game);
    // 能力變了，雷達圖和戰力要跟著更新
    root.querySelector('#radarBox').innerHTML = radarSVG(game.team.players);
    root.querySelector('#teamStr').textContent = teamStrength(game.team.players);
    draw();
  }

  function draw() {
    tabs.querySelectorAll('.tab').forEach((b) => {
      b.classList.toggle('is-active', b.dataset.tab === active);
    });
    TABS.find((t) => t.id === active).render(content, game, afterAction);
    content.scrollIntoView({ block: 'nearest' });
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
