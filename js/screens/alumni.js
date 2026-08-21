// 校友錄：所有畢業的球員和經理，整理起來給玩家回顧。
// 純顯示用，不影響任何數值。

import { positionById, grade } from '../data/abilities.js';
import { graduatePathById } from '../rules/roguelike.js';
import { calendarYear } from '../rules/game.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

// 目前選的畢業年份篩選——只是畫面狀態，不用存進存檔
let yearFilter = 'all';

function playerRow(a) {
  const pos = positionById(a.position);
  const outcome = a.drafted
    ? `<span class="alumnus__drafted">⚾ 被 ${a.drafted.team} 選走</span>`
    : `<span class="alumnus__path">${graduatePathById(a.path)?.label || ''}</span>`;
  return `
    <li class="alumnus">
      <span class="alumnus__role">${pos ? pos.short : ''}</span>
      <span class="alumnus__name">${a.name}</span>
      <span class="alumnus__talent">${stars(a.talent)}</span>
      <span class="alumnus__ovr g g--${grade(a.overall)}">${grade(a.overall)}</span>
      <span class="alumnus__year">${calendarYear(a.year)} 年畢業</span>
      ${outcome}
      <p class="alumnus__career">生涯戰績：${a.career}</p>
    </li>`;
}

function managerRow(a) {
  return `
    <li class="alumnus alumnus--manager">
      <span class="alumnus__role">經理</span>
      <span class="alumnus__name">${a.name}</span>
      <span class="alumnus__year">${calendarYear(a.year)} 年畢業</span>
      <span class="alumnus__path">${graduatePathById(a.path)?.label || ''}</span>
      ${a.skill ? `<p class="alumnus__career">特殊能力：${a.skill}</p>` : ''}
    </li>`;
}

export function renderAlumni(root, game) {
  const alumni = [...(game.alumni || [])]
    .sort((a, b) => b.year - a.year || a.name.localeCompare(b.name));

  if (!alumni.length) {
    root.innerHTML = `
      <div class="alumni">
        <p class="muted">還沒有人畢業。等第一批三年級畢業之後，這裡就會開始有紀錄。</p>
      </div>`;
    return;
  }

  // 篩選過的年份如果已經不存在（例如重新開局），就退回「全部」
  const years = [...new Set(alumni.map((a) => a.year))].sort((a, b) => b - a);
  if (yearFilter !== 'all' && !years.includes(yearFilter)) yearFilter = 'all';
  const shown = yearFilter === 'all' ? alumni : alumni.filter((a) => a.year === yearFilter);

  const draftedCount = shown.filter((a) => a.drafted).length;
  const managerCount = shown.filter((a) => a.role === 'manager').length;

  const yearChips = ['all', ...years].map((y) => `
    <button type="button" class="chip${y === yearFilter ? ' is-active' : ''}" data-year="${y}">
      ${y === 'all' ? '全部' : `${calendarYear(y)} 年`}
    </button>`).join('');

  root.innerHTML = `
    <div class="alumni">
      <div class="chips">${yearChips}</div>
      <ul class="tally">
        <li><b>${shown.length}</b><span>畢業校友</span></li>
        <li><b>${draftedCount}</b><span>進入職棒</span></li>
        <li><b>${managerCount}</b><span>畢業經理</span></li>
      </ul>
      <ul class="alumni-list">
        ${shown.map((a) => (a.role === 'manager' ? managerRow(a) : playerRow(a))).join('')}
      </ul>
    </div>`;

  root.querySelectorAll('[data-year]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const y = btn.dataset.year;
      yearFilter = y === 'all' ? 'all' : Number(y);
      renderAlumni(root, game);
    });
  });
}
