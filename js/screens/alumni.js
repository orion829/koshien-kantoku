// 校友錄：所有畢業的球員和經理，整理起來給玩家回顧。
// 純顯示用，不影響任何數值。

import { positionById } from '../data/abilities.js';
import { graduatePathById } from '../rules/roguelike.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

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
      <span class="alumnus__year">${a.year} 年畢業</span>
      ${outcome}
      <p class="alumnus__career">生涯戰績：${a.career}</p>
    </li>`;
}

function managerRow(a) {
  return `
    <li class="alumnus alumnus--manager">
      <span class="alumnus__role">經理</span>
      <span class="alumnus__name">${a.name}</span>
      <span class="alumnus__year">${a.year} 年畢業</span>
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

  const draftedCount = alumni.filter((a) => a.drafted).length;
  const managerCount = alumni.filter((a) => a.role === 'manager').length;

  root.innerHTML = `
    <div class="alumni">
      <ul class="tally">
        <li><b>${alumni.length}</b><span>畢業校友</span></li>
        <li><b>${draftedCount}</b><span>進入職棒</span></li>
        <li><b>${managerCount}</b><span>畢業經理</span></li>
      </ul>
      <ul class="alumni-list">
        ${alumni.map((a) => (a.role === 'manager' ? managerRow(a) : playerRow(a))).join('')}
      </ul>
    </div>`;
}
