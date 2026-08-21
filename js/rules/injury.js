// 受傷
//
// 比賽和練習都有機率受傷。受傷的人：
//   1. 能力當場下降（身體狀況變差）
//   2. 要休養幾週才能回來，這段期間不能上場也不會練習
//   3. 重傷還會讓「上限」永久下降 —— 這個練不回來
//
// 投手投太多球會大幅增加受傷機率。這就是為什麼一週 500 球的規則存在。

import { BATTER_STATS, PITCHER_STATS, MAX_ABILITY } from '../data/abilities.js';
import { isPitcher } from './player.js';

const ALL_STATS = [...BATTER_STATS, ...PITCHER_STATS].map((s) => s.id);
const has = (p, id) => p.skills?.includes(id);

/** 受傷的種類。weight 是抽到的權重 */
export const SEVERITIES = [
  {
    id: 'light', name: '輕傷', weight: 65,
    weeks: [1, 2], drop: [1, 3], permanent: 0,
    causes: ['擦傷', '肌肉拉傷', '扭到腳踝', '手指瘀傷'],
  },
  {
    id: 'medium', name: '中傷', weight: 27,
    weeks: [3, 6], drop: [4, 7], permanent: 0,
    causes: ['腰痛', '肩膀發炎', '膝蓋積水', '手腕韌帶拉傷'],
  },
  {
    id: 'serious', name: '重傷', weight: 8,
    weeks: [8, 14], drop: [8, 13], permanent: [4, 8],
    causes: ['手肘韌帶斷裂', '肩膀關節唇損傷', '骨折', '疲勞性骨折'],
  },
];

const randInt = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** 比賽的受傷機率。投球數是最大的因素 */
export function matchInjuryChance(player, pitches = 0) {
  let p = 0.017;
  if (pitches > 0) {
    p = 0.016 + Math.max(0, pitches - 90) * 0.0007;   // 90 球以上開始加速
  }
  if (has(player, 'durable')) p *= 0.45;
  if (has(player, 'fragile')) p *= 2.1;
  return p;
}

/** 練習的受傷機率。比比賽低很多 */
export function trainInjuryChance(player) {
  let p = 0.005;
  if (has(player, 'durable')) p *= 0.45;
  if (has(player, 'fragile')) p *= 2.1;
  return p;
}

/**
 * 讓一個球員受傷。會直接改動 player。
 * 回傳這次受傷的說明，給畫面顯示。
 */
export function injure(player, rng = Math.random) {
  const total = SEVERITIES.reduce((n, s) => n + s.weight, 0);
  let r = rng() * total;
  const sev = SEVERITIES.find((s) => (r -= s.weight) <= 0) || SEVERITIES[0];

  const weeks = randInt(rng, sev.weeks);
  const drop = randInt(rng, sev.drop);
  const cause = pick(sev.causes, rng);

  // 受傷影響哪些能力：投手傷手臂就影響投球，野手影響身體
  const hurt = isPitcher(player)
    ? ['velocity', 'control', 'stamina', 'breaking']
    : ['meet', 'power', 'speed', 'field'];

  hurt.forEach((id) => {
    player.abilities[id] = Math.max(1, player.abilities[id] - drop);
  });

  // 重傷會壓低上限，這個永遠回不來
  let permanent = 0;
  if (sev.permanent) {
    permanent = randInt(rng, sev.permanent);
    ALL_STATS.forEach((id) => {
      const cap = player.potential?.[id];
      if (cap === undefined) return;
      player.potential[id] = Math.max(
        Math.round(player.abilities[id]),
        Math.min(MAX_ABILITY, cap - permanent),
      );
    });
  }

  player.injury = {
    severity: sev.id, name: sev.name, cause, weeks, totalWeeks: weeks, drop, permanent,
  };

  return {
    id: player.id, name: player.name, severity: sev.id, label: sev.name, cause, weeks, drop, permanent,
  };
}

/** 有沒有在養傷 */
export const isInjured = (p) => !!p.injury && p.injury.weeks > 0;

/** 可以上場的人 */
export const healthy = (players) => players.filter((p) => !isInjured(p));

/**
 * 過一週。所有傷勢的剩餘週數減一，回來的人會被列出來。
 */
export function healWeek(players, speed = 1) {
  const returned = [];
  players.forEach((p) => {
    if (!isInjured(p)) return;
    p.injury.weeks -= speed;
    if (p.injury.weeks <= 0) {
      returned.push({ name: p.name, label: p.injury.name });
      p.injury = null;
    }
  });
  return returned;
}
