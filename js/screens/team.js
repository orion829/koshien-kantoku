import { UI } from '../strings.js';
import { save } from '../state.js';
import { renderWeek } from './week.js';
import { renderRoster } from './roster.js';
import { renderSchedule } from './schedule.js';
import { radarSVG } from './radar.js';
import { renderTimeline } from './timeline.js';
import { teamStrength } from '../rules/game.js';
import { efficiency, moraleLabel } from '../rules/morale.js';

const TABS = [
  { id: 'week', name: '本週', render: renderWeek },
  { id: 'roster', name: '選手名單', render: renderRoster },
  { id: 'schedule', name: '賽程表', render: renderSchedule },
];

/** 士氣一直顯示在主畫面上，不用切到「本週」才看得到 */
function moraleBadge(game) {
  const c = game.morale.weeksSinceMatch;
  const eff = efficiency(c);
  const cls = eff === 1 ? 'good' : eff >= 0.75 ? 'mid' : eff >= 0.5 ? 'bad' : 'worse';
  return `
    <span class="morale-badge morale-badge--${cls}">
      <i>士氣</i><b>${moraleLabel(c)}</b><em>練習效率 ${Math.round(eff * 100)}%</em>
    </span>`;
}

/** 傳承點數也常駐顯示——這是「學校一年比一年強」最直接的證據 */
function legacyBadge(game) {
  const pts = game.legacyPoints || 0;
  const levels = Object.values(game.upgrades || {}).reduce((a, b) => a + b, 0);
  return `
    <span class="legacy-badge">
      <i>傳承點數</i><b>${pts}</b>
      ${levels ? `<em>已升級 ${levels} 級</em>` : ''}
    </span>`;
}

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
          <div id="moraleBadge">${moraleBadge(game)}</div>
          <div id="legacyBadge">${legacyBadge(game)}</div>
        </div>
        <div class="masthead__radar" id="radarBox">${radarSVG(game.team.players)}</div>

        <div class="menu" id="menu">
          <button type="button" class="menu__btn" id="menuBtn" aria-label="選單">⋯</button>
          <div class="menu__panel" id="menuPanel" hidden>
            <button type="button" class="menu__item menu__item--danger" id="resetBtn">
              ${UI.resetBtn}
            </button>
          </div>
        </div>
      </header>

      <div id="timelineBox">${renderTimeline(game)}</div>

      <nav class="tabs" id="tabs">
        ${TABS.map((t) => `<button type="button" class="tab" data-tab="${t.id}">${t.name}</button>`).join('')}
      </nav>

      <div id="tabContent"></div>
    </div>`;

  const content = root.querySelector('#tabContent');
  const tabs = root.querySelector('#tabs');

  // 做完一個行動之後：存檔、重畫
  function afterAction() {
    save(game);
    // 能力變了，雷達圖、戰力、時間線都要跟著更新
    root.querySelector('#radarBox').innerHTML = radarSVG(game.team.players);
    root.querySelector('#teamStr').textContent = teamStrength(game.team.players);
    root.querySelector('#timelineBox').innerHTML = renderTimeline(game);
    root.querySelector('#moraleBadge').innerHTML = moraleBadge(game);
    root.querySelector('#legacyBadge').innerHTML = legacyBadge(game);
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

  // 「重新開始」藏在選單裡，而且要按兩次才會真的重來 ——
  // 不小心點到選單按鈕不會炸掉存檔，要點兩下才行。
  const menu = root.querySelector('#menu');
  const menuBtn = root.querySelector('#menuBtn');
  const menuPanel = root.querySelector('#menuPanel');
  const resetBtn = root.querySelector('#resetBtn');
  let confirming = false;

  function closeMenu() {
    menuPanel.hidden = true;
    confirming = false;
    resetBtn.textContent = UI.resetBtn;
    resetBtn.classList.remove('is-confirm');
  }

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuPanel.hidden = !menuPanel.hidden;
    if (menuPanel.hidden) closeMenu();
  });

  resetBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!confirming) {
      confirming = true;
      resetBtn.textContent = UI.resetConfirm;
      resetBtn.classList.add('is-confirm');
      return;
    }
    onReset();
  });

  // 用當時抓到的 menu 節點判斷，而不是每次重查 root ——
  // 重來一局之後 root 會被 setup 畫面整個換掉，重查會抓到 null。
  document.addEventListener('click', (e) => {
    if (!menuPanel.hidden && !menu.contains(e.target)) closeMenu();
  });

  draw();
}
