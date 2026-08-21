// 先發名單：玩家自己排打擊順序、守備位置、投手輪值。
//
// 不強迫排——沒設定的棒次、沒設定的先發投手，都照原本的自動邏輯
// （適性最好的守、打擊最好的排前面、王牌先發）。這裡只是給想自己
// 排陣的玩家一個入口。

import { POSITIONS } from '../data/abilities.js';
import { active } from '../rules/roster.js';
import { isPitcher, overallGrade } from '../rules/player.js';
import { isInjured } from '../rules/injury.js';

const FIELD_POS = POSITIONS.filter((p) => p.id !== 'P');

/** 現在能上場的人（沒受傷、沒因為學力停賽） */
function eligiblePlayers(game) {
  const banned = new Set(game.examBanned || []);
  return active(game.team.players).filter((p) => !isInjured(p) && !banned.has(p.id));
}

function ensureLineup(game) {
  if (!game.customLineup) game.customLineup = { order: [], pitchers: [] };
  if (!game.customLineup.order) game.customLineup.order = [];
  if (!game.customLineup.pitchers) game.customLineup.pitchers = [];
  return game.customLineup;
}

export function renderLineup(root, game, onChange) {
  const lineup = ensureLineup(game);
  const players = eligiblePlayers(game);
  const fielders = players.filter((p) => !isPitcher(p));
  const pitchers = players.filter(isPitcher);

  const order = Array.from({ length: 8 }, (_, i) => lineup.order[i] || null);
  const usedPlayers = new Set(order.filter(Boolean).map((s) => s.playerId));
  const posCount = {};
  order.forEach((s) => { if (s?.position) posCount[s.position] = (posCount[s.position] || 0) + 1; });
  const dupPos = Object.entries(posCount).filter(([, n]) => n > 1).map(([p]) => p);

  const rows = order.map((slot, i) => {
    const posOptions = FIELD_POS.map((p) => `
      <option value="${p.id}" ${slot?.position === p.id ? 'selected' : ''}>${p.short}</option>`).join('');
    const playerOptions = ['<option value="">（自動）</option>']
      .concat(fielders
        .filter((p) => !usedPlayers.has(p.id) || p.id === slot?.playerId)
        .map((p) => `
          <option value="${p.id}" ${slot?.playerId === p.id ? 'selected' : ''}>
            ${p.name}（${overallGrade(p)}）</option>`))
      .join('');
    const bad = slot?.position && dupPos.includes(slot.position);
    return `
      <li class="lineup-row${bad ? ' lineup-row--bad' : ''}">
        <span class="lineup-row__num">${i + 1}棒</span>
        <select data-slot-pos="${i}">${posOptions}</select>
        <select data-slot-player="${i}">${playerOptions}</select>
        <span class="lineup-row__move">
          <button type="button" data-move="${i}:-1" ${i === 0 ? 'disabled' : ''}>▲</button>
          <button type="button" data-move="${i}:1" ${i === 7 ? 'disabled' : ''}>▼</button>
        </span>
      </li>`;
  }).join('');

  const pitcherRows = [0, 1, 2].map((i) => {
    const pid = lineup.pitchers[i] || '';
    const opts = ['<option value="">（自動）</option>']
      .concat(pitchers.map((p) => `
        <option value="${p.id}" ${pid === p.id ? 'selected' : ''}>
          ${p.name}（${overallGrade(p)}）</option>`))
      .join('');
    return `
      <li class="lineup-row">
        <span class="lineup-row__num">第 ${i + 1} 場</span>
        <select data-pitcher="${i}">${opts}</select>
      </li>`;
  }).join('');

  root.innerHTML = `
    <h3 class="sec">打擊順序與守備位置
      <span class="hint">（沒設定的棒次由電腦自動安排最合適的人）</span></h3>
    ${dupPos.length ? `<p class="last__note lineup-warn">
      ⚠️ ${dupPos.map((p) => FIELD_POS.find((x) => x.id === p)?.short).join('、')}
      被排了不只一次，多出來的會被自動換掉。</p>` : ''}
    <ul class="lineup-rows">${rows}</ul>

    <h3 class="sec">投手輪值
      <span class="hint">（一週最多 3 場，沒設定的場次也是自動——通常是王牌先發）</span></h3>
    <ul class="lineup-rows">${pitcherRows}</ul>

    <button type="button" class="btn btn--wide" data-reset-lineup>清空，全部交給電腦自動安排</button>`;

  root.querySelectorAll('[data-slot-pos]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const i = Number(sel.dataset.slotPos);
      const position = sel.value || null;
      order[i] = position || order[i]?.playerId ? { ...(order[i] || {}), position } : null;
      lineup.order = order;
      onChange();
    });
  });

  root.querySelectorAll('[data-slot-player]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const i = Number(sel.dataset.slotPlayer);
      const playerId = sel.value || null;
      order[i] = playerId ? { ...(order[i] || {}), playerId } : null;
      lineup.order = order;
      onChange();
    });
  });

  root.querySelectorAll('[data-move]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [iStr, dirStr] = btn.dataset.move.split(':');
      const i = Number(iStr);
      const j = i + Number(dirStr);
      if (j < 0 || j > 7) return;
      [order[i], order[j]] = [order[j], order[i]];
      lineup.order = order;
      onChange();
    });
  });

  root.querySelectorAll('[data-pitcher]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const i = Number(sel.dataset.pitcher);
      lineup.pitchers[i] = sel.value || null;
      // 尾巴的空值清掉，不要留一堆 null
      while (lineup.pitchers.length && !lineup.pitchers[lineup.pitchers.length - 1]) {
        lineup.pitchers.pop();
      }
      onChange();
    });
  });

  root.querySelector('[data-reset-lineup]')?.addEventListener('click', () => {
    game.customLineup = { order: [], pitchers: [] };
    onChange();
  });
}
