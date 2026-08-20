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
export const BASE_GAIN = 3.5;

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
export function trainPlayer(player, menu, efficiency = 1, mods = null) {
  const gains = {};
  const bonusWeights = mods?.weights || {};
  const gainMult = mods?.gain ?? 1;
  for (const statId of [...BATTER_IDS, ...PITCHER_IDS]) {
    const weight = PASSIVE_WEIGHT + (menu.weights[statId] || 0)
      + (menu.weights[statId] ? (bonusWeights[statId] || 0) : 0);
    const g = gainFor(player, statId, weight, efficiency) * gainMult;
    if (g <= 0) continue;
    player.abilities[statId] = Math.min(capOf(player, statId), player.abilities[statId] + g);
    gains[statId] = g;
  }
  return gains;
}

/**
 * 比賽表現換成的成長。
 * 打得好就會進步 —— 這是打比賽的回報，也是「贏球比較好」的理由之一。
 * 一個比賽週（三場）的成長大約等於一個練習週。
 * 投手的係數要壓低很多，因為完投九局會把每一項都累加，很容易爆掉。
 * 這也是「贏球比較好」的重要理由：贏越多場，打越多場，長越多。
 */
export function growFromMatch(player, bat, pit) {
  const gains = {};
  const add = (stat, amount) => {
    if (!amount || amount <= 0) return;
    const cap = capOf(player, stat);
    const v = player.abilities[stat];
    if (v >= cap) return;
    const g = amount * talentMult(player.talent) * capFactor(v, cap);
    if (g <= 0) return;
    player.abilities[stat] = Math.min(cap, v + g);
    gains[stat] = (gains[stat] || 0) + g;
  };

  if (bat) {
    add('meet', bat.h * 2.1 + bat.rbi * 0.65);
    add('power', (bat.hr * 3.6) + Math.max(0, bat.h - bat.hr) * 0.52);
    add('speed', bat.r * 0.65);
    // 有上場守備就有守備經驗
    add('field', 1.05);
    add('catch', 0.85);
  }

  if (pit) {
    const innings = pit.outs / 3;
    add('stamina', innings * 0.27);
    add('breaking', pit.k * 0.2);
    // 四壞少才練得到控球
    add('control', Math.max(0, innings * 0.34 - pit.bb * 0.24));
    add('velocity', innings * 0.09);
  }

  return gains;
}

/** 全隊練一週 */
export function trainTeam(players, menuId, efficiency = 1, mods = null) {
  const menu = menuById(menuId);
  if (!menu) throw new Error(`沒有這個練習項目: ${menuId}`);
  return players.map((p) => ({ id: p.id, gains: trainPlayer(p, menu, efficiency, mods) }));
}
