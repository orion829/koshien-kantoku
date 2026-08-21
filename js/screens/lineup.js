// 先發名單：不用自己排，AI 會照能力和是否能出賽自動決定——
// 這裡只是把 AI 現在會排出來的先發攤開給你看，讓你知道「如果現在開打，
// 會是這個陣容」。受傷、停賽的人不會出現在這裡（見 eligiblePlayers）。

import { positionById, grade } from '../data/abilities.js';
import { active } from '../rules/roster.js';
import { overallGrade, isPitcher, playerVelocity } from '../rules/player.js';
import { isInjured } from '../rules/injury.js';
import { fatigueLabel } from '../rules/fatigue.js';
import { buildLineup } from '../rules/match.js';

/** 現在能上場的人（沒受傷、沒因為學力停賽） */
export function eligiblePlayers(game) {
  const banned = new Set(game.examBanned || []);
  return active(game.team.players).filter((p) => !isInjured(p) && !banned.has(p.id));
}

/**
 * 算出「如果現在開打」AI 會怎麼排先發，回傳一個用球員 id 查棒次／
 * 守備位置的表——給選手名單、選手預覽卡這些地方顯示「他現在打第幾棒」用，
 * 不用整個畫面都重算一次 buildLineup。
 */
export function computeLineupSlots(game) {
  const players = eligiblePlayers(game);
  if (players.length < 9) return { slots: new Map(), starterId: null, bullpenIds: [] };
  const { starter, bullpen, order } = buildLineup(players);
  const slots = new Map();
  order.forEach((slot, i) => {
    slots.set(slot.player.id, { battingOrder: i + 1, position: slot.position });
  });
  return { slots, starterId: starter.id, bullpenIds: bullpen.map((p) => p.id) };
}

/** computeLineupSlots 的結果換成一小段文字，給選手名單、主頁選手卡共用 */
export function lineupTag(p, lineupInfo) {
  if (!lineupInfo) return '';
  if (lineupInfo.starterId === p.id) return '⚾ 王牌先發';
  if (lineupInfo.bullpenIds.includes(p.id)) return '牛棚';
  const slot = lineupInfo.slots.get(p.id);
  if (slot) return `先發第 ${slot.battingOrder} 棒・${positionById(slot.position)?.short || ''}`;
  return '';
}

export function renderLineup(root, game) {
  const players = eligiblePlayers(game);

  if (players.length < 9) {
    root.innerHTML = `
      <h3 class="sec">先發名單</h3>
      <p class="muted">能上場的人不到 9 個，排不出完整先發（受傷、停賽的人不算）。</p>`;
    return;
  }

  const { starter, bullpen, order } = buildLineup(players);

  const rows = order.map((slot, i) => {
    const p = slot.player;
    const pos = positionById(slot.position)?.short || '';
    const key = isPitcher(p)
      ? `球速 ${playerVelocity(p)} km/h・控球 ${grade(p.abilities.control)}`
      : `打擊 ${grade(p.abilities.meet)}・力量 ${grade(p.abilities.power)}`;
    const tired = (p.fatigue || 0) >= 50;
    return `
      <li class="lineup-row lineup-row--view">
        <span class="lineup-row__num">${i + 1}棒</span>
        <span class="lineup-row__pos">${pos}</span>
        <span class="lineup-row__name">${p.name}
          <b class="g g--${overallGrade(p)}">${overallGrade(p)}</b></span>
        <span class="lineup-row__key">${key}</span>
        <span class="lineup-row__fatigue${tired ? ' lineup-row__fatigue--tired' : ''}">
          ${tired ? '🥱 ' : ''}疲勞 ${fatigueLabel(p.fatigue)}</span>
      </li>`;
  }).join('');

  const bullpenRows = bullpen.length ? bullpen.map((p) => `
    <li class="lineup-row lineup-row--view">
      <span class="lineup-row__pos">投</span>
      <span class="lineup-row__name">${p.name}
        <b class="g g--${overallGrade(p)}">${overallGrade(p)}</b></span>
      <span class="lineup-row__key">球速 ${playerVelocity(p)} km/h</span>
    </li>`).join('') : '<li class="muted">沒有其他能上場的投手了。</li>';

  root.innerHTML = `
    <h3 class="sec">先發名單
      <span class="hint">（AI 自動排的，照現在的能力和誰能出賽算——受傷、停賽的人不會出現）</span></h3>
    <ul class="lineup-rows">${rows}</ul>

    <h3 class="sec">牛棚
      <span class="hint">（一週打到第 2、3 場，先發投手投超過 500 球會自動換下一個）</span></h3>
    <ul class="lineup-rows">${bullpenRows}</ul>

    <p class="muted">王牌是 <b>${starter.name}</b>，疲勞或投球數太多的時候，
      系統會自動換下一個能投的人上來，不用自己排。</p>`;
}
