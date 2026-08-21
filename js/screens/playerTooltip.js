// 選手預覽小卡：滑鼠移到任何有 data-pid="{球員id}" 的地方，
// 就會跳出一張小卡片，顯示這個人現在的能力和狀態。
//
// 只做一次初始化（initPlayerTooltip），之後整個畫面（不管哪個分頁、
// 哪個彈出的比賽詳情）只要有 data-pid，滑過去就有效——用事件代理，
// 不用每個地方各自綁一次。

import {
  positionById, grade, GROWTH_TYPES, BATTER_STATS, PITCHER_STATS,
} from '../data/abilities.js';
import { overallGrade, isPitcher, careerLine } from '../rules/player.js';
import { isInjured } from '../rules/injury.js';
import { fatigueLabel } from '../rules/fatigue.js';
import { computeLineupSlots, lineupTag } from './lineup.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

let tipEl = null;
let currentGame = null;
let bound = false;

function ensureTip() {
  if (tipEl) return tipEl;
  tipEl = document.createElement('div');
  tipEl.className = 'player-tip';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

function tipHTML(p, game) {
  const pos = positionById(p.position)?.short || '';
  const gt = GROWTH_TYPES[p.growthType] || GROWTH_TYPES.normal;
  const hurt = isInjured(p);
  const banned = (game.examBanned || []).includes(p.id);
  const tired = (p.fatigue || 0) >= 50;
  const main = isPitcher(p) ? PITCHER_STATS : BATTER_STATS;
  const chips = main.map((s) => {
    const g = grade(p.abilities[s.id]);
    return `<span class="player-tip__stat"><i>${s.name}</i><b class="g g--${g}">${g}</b></span>`;
  }).join('');
  const tag = p.retired ? '' : lineupTag(p, computeLineupSlots(game));

  return `
    <div class="player-tip__head">
      <span class="player-tip__pos">${pos}</span>
      <b class="player-tip__name">${p.name}</b>
      <span class="player-tip__ovr g g--${overallGrade(p)}">${overallGrade(p)}</span>
    </div>
    <div class="player-tip__line">
      ${p.gradeYear}年級・${gt.name}・${stars(p.talent)}
      ・學力 <span class="g g--${grade(p.gakuryoku)}">${grade(p.gakuryoku)}</span>
      ・疲勞 ${fatigueLabel(p.fatigue)}
      ${p.retired ? '<span class="player-tip__ret">已退隊</span>' : ''}
    </div>
    <div class="player-tip__stats">${chips}</div>
    <div class="player-tip__line">生涯戰績：${careerLine(p)}</div>
    ${tag ? `<div class="player-tip__tag">${tag}</div>` : ''}
    ${hurt ? `<div class="player-tip__warn">🤕 養傷中・還要 ${p.injury.weeks} 週</div>` : ''}
    ${banned ? '<div class="player-tip__warn">📕 停賽中・學力不及格</div>' : ''}
    ${tired ? `<div class="player-tip__warn player-tip__warn--tired">🥱 ${fatigueLabel(p.fatigue)}</div>` : ''}`;
}

/**
 * game 是活的物件參考，球員能力變了、受傷了，下次滑過去就是最新的。
 * 「重新開始」會換一個新的 game 物件重呼叫這裡——事件監聽只綁一次，
 * 之後只是把 currentGame 換掉，不會每次重開都疊加一份監聽器。
 */
export function initPlayerTooltip(game) {
  currentGame = game;
  const tip = ensureTip();
  if (bound) return;
  bound = true;
  const findPlayer = (id) => currentGame.team.players.find((p) => p.id === id);
  let hoveredEl = null;

  const place = (x, y) => {
    const pad = 14;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = tip.getBoundingClientRect();
    let left = x + pad;
    let top = y + pad;
    if (left + rect.width > vw - 8) left = x - rect.width - pad;
    if (top + rect.height > vh - 8) top = y - rect.height - pad;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };

  document.body.addEventListener('mouseover', (e) => {
    const el = e.target.closest('[data-pid]');
    if (!el) return;
    const p = findPlayer(el.dataset.pid);
    if (!p) return;
    hoveredEl = el;
    tip.innerHTML = tipHTML(p, currentGame);
    tip.hidden = false;
    place(e.clientX, e.clientY);
  });

  document.body.addEventListener('mousemove', (e) => {
    if (tip.hidden) return;
    if (!document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pid]')) {
      tip.hidden = true;
      hoveredEl = null;
      return;
    }
    place(e.clientX, e.clientY);
  });

  document.body.addEventListener('mouseout', (e) => {
    const el = e.target.closest('[data-pid]');
    if (!el) return;
    if (el.contains(e.relatedTarget)) return;
    tip.hidden = true;
    hoveredEl = null;
  });

  // 保險：畫面常常會在滑鼠完全沒動的情況下被整個換掉（按鈕點下去、
  // 換分頁、重新開始……很多按鈕會 stopPropagation，等不到 mouseout）。
  // 用 MutationObserver 盯著整個畫面，只要滑過的那個名字被換掉／消失，
  // 卡片就跟著收起來，不會卡住。
  const observer = new MutationObserver(() => {
    if (!tip.hidden && hoveredEl && !hoveredEl.isConnected) {
      tip.hidden = true;
      hoveredEl = null;
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
