// 練習與成長
//
// 每個練習週你挑一個練習項目，全隊一起練。
// 挑打擊就沒練到守備 —— 一週只能練一件事，這就是整個遊戲的核心取捨。
//
// 成長量 = 基準 × 項目權重 × 練習效率(士氣) × 天賦 × 成長期 × 接近上限的折扣

import {
  MAX_ABILITY, BATTER_STATS, PITCHER_STATS, GROWTH_TYPES,
} from '../data/abilities.js';
import { isPitcher } from './player.js';

export { GROWTH_TYPES, rollGrowthType } from '../data/abilities.js';

const BATTER_IDS = BATTER_STATS.map((s) => s.id);
const PITCHER_IDS = PITCHER_STATS.map((s) => s.id);

/** 權重 1.0、效率滿、天賦3、成長期普通、能力 45 時，一週長多少 */
export const BASE_GAIN = 4.3;

/**
 * 基礎成長：不管你挑什麼項目，每一項能力都會長一點點。
 * 因為高中生每天都在練球，不會因為今天練打擊，守備就完全沒進步。
 * 沒有這個的話，只有你挑的那一兩項會長，其他三年都停在原地。
 */
export const PASSIVE_WEIGHT = 0.5;

export const MENUS = [
  { id: 'batting', name: '打擊練習', weights: { meet: 1.0, power: 0.5 } },
  { id: 'power', name: '長打練習', weights: { power: 1.0, meet: 0.35 } },
  { id: 'fielding', name: '守備練習', weights: { field: 1.0, catch: 0.75 } },
  { id: 'throwing', name: '傳球練習', weights: { arm: 1.0, field: 0.35 } },
  { id: 'running', name: '跑壘練習', weights: { speed: 1.0, meet: 0.2 } },
  { id: 'pitching', name: '投球練習', weights: { control: 1.0, velocity: 0.7 } },
  { id: 'breaking', name: '變化球練習', weights: { breaking: 1.0, control: 0.35 } },
  { id: 'physical', name: '體能訓練', weights: { stamina: 0.8, speed: 0.45, power: 0.45 } },
];

export const menuById = (id) => MENUS.find((m) => m.id === id);

// ── 成長計算 ────────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 天賦越高長越快 */
const talentMult = (talent) => 0.65 + talent * 0.12;

/** 成長期 × 年級 */
function stageMult(player) {
  const t = GROWTH_TYPES[player.growthType] || GROWTH_TYPES.normal;
  return t.byYear[clamp(player.gradeYear, 1, 3) - 1];
}

/** 越接近自己的天花板長越慢，到了就停 */
const capFactor = (value, cap) => clamp((cap - value) / 40, 0, 1);

/** 這個人這項能力的天花板 */
export const capOf = (player, statId) =>
  player.potential?.[statId] ?? MAX_ABILITY;

/**
 * 某個球員這一週在某項能力上會長多少。
 * efficiency 來自士氣系統（1.0 / 0.75 / 0.5）
 */
export function gainFor(player, statId, weight, efficiency) {
  const value = player.abilities[statId];
  const cap = capOf(player, statId);
  if (value >= cap) return 0;

  let g = BASE_GAIN * weight * efficiency
    * talentMult(player.talent) * stageMult(player) * capFactor(value, cap);

  // 野手練投球項目效果很差；投手練打擊有折扣但還是要練（沒有指定打擊）
  if (!isPitcher(player) && PITCHER_IDS.includes(statId)) g *= 0.3;
  if (isPitcher(player) && BATTER_IDS.includes(statId)) g *= 0.7;

  return g;
}

/**
 * 讓一個球員練一週。會直接改動 player.abilities。
 * 回傳這次長了哪些能力（給畫面顯示用）。
 */
export function trainPlayer(player, menu, efficiency = 1) {
  const gains = {};
  for (const statId of [...BATTER_IDS, ...PITCHER_IDS]) {
    const weight = PASSIVE_WEIGHT + (menu.weights[statId] || 0);
    const g = gainFor(player, statId, weight, efficiency);
    if (g <= 0) continue;
    player.abilities[statId] = Math.min(capOf(player, statId), player.abilities[statId] + g);
    gains[statId] = g;
  }
  return gains;
}

/** 全隊練一週 */
export function trainTeam(players, menuId, efficiency = 1) {
  const menu = menuById(menuId);
  if (!menu) throw new Error(`沒有這個練習項目: ${menuId}`);
  return players.map((p) => ({ id: p.id, gains: trainPlayer(p, menu, efficiency) }));
}
