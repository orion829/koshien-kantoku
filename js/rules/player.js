// 球員的資料模型
//
// 每個球員都同時擁有「打者能力」和「投手能力」，因為甲子園沒有指定打擊（DH），
// 投手一定要上場打擊。你的王牌如果完全不會打，第九棒就是一個洞。

import {
  MAX_ABILITY, BATTER_STATS, PITCHER_STATS, POSITIONS,
  APTITUDE_PENALTY, GRADES, grade, velocityKmh, skillsFor, rollGrowthType,
  POSITION_AFFINITY, APTITUDE_LETTERS,
} from '../data/abilities.js';
import { randomPersonName } from '../data/names.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** 常態分布的亂數（Box-Muller），拿來讓能力值分散得自然一點 */
function gauss(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * 各守備位置比較看重哪些能力。數字是加成，單位跟能力值一樣。
 * 例如游擊手的守備 +14，一壘手的守備 -8。
 */
const POSITION_PROFILE = {
  P:    { velocity: 16, control: 14, stamina: 14, breaking: 16, meet: -10, power: -8, speed: -4, field: -6 },
  C:    { arm: 12, catch: 14, field: 6, speed: -10, power: 2 },
  '1B': { power: 12, meet: 4, speed: -8, field: -8, arm: -6 },
  '2B': { field: 10, catch: 10, speed: 6, power: -8, arm: -2 },
  '3B': { arm: 10, power: 8, field: 6, speed: -4 },
  SS:   { field: 14, arm: 10, speed: 8, power: -8 },
  LF:   { power: 8, meet: 4, field: -2, arm: -4 },
  CF:   { speed: 14, field: 10, meet: 4, power: -4 },
  RF:   { arm: 12, power: 10, speed: 2 },
};

/**
 * 天賦 1〜5 星 → 一年級剛入學時的能力平均。
 * 普通新生（2〜3 星）落在 F〜E。
 */
const talentBase = (talent) => 18 + talent * 8;

/**
 * 每升一個年級，能力平均會長多少。
 * 三年級已經練了兩年，所以起點要比一年級高 24。
 * 這也是為什麼「黃金世代」開局的三年級會強得很明顯 —— 但他們八月就走了。
 */
export const GROWTH_PER_YEAR = 12;

/**
 * 生成守備適性。
 * 主位置一定是 A。相近的位置依「有多近」給 B〜D，其他給 E〜G。
 *
 * 每個人還有一個「萬能程度」：有些人天生就守得了很多位置，
 * 有些人只會守一個。這讓 25 人名單的排列組合有意義。
 */
function makeAptitudes(main, rng) {
  const aff = POSITION_AFFINITY[main] || [];
  const versatile = rng();          // 0〜1，越高越萬能
  const out = {};

  for (const p of POSITIONS) {
    if (p.id === main) { out[p.id] = 'A'; continue; }

    const idx = aff.indexOf(p.id);
    if (idx >= 0) {
      // 相近的位置：排越前面越好，再加上這個人的萬能程度。
      // 萬能的人第二第三位置也有 B，只會守一個位置的人就只剩 D、E。
      const score = Math.min(6, Math.round(4.8 - idx * 0.9 + versatile * 2.6));
      out[p.id] = APTITUDE_LETTERS[clamp(score, 1, 6)];
      continue;
    }

    // 不相近的位置。投手誰都守不了
    if (p.id === 'P') { out[p.id] = 'G'; continue; }
    if (versatile > 0.8 && rng() < 0.35) out[p.id] = 'E';
    else out[p.id] = rng() < 0.5 ? 'F' : 'G';
  }
  return out;
}

/**
 * 依天賦決定拿到幾個特殊能力。
 * 有些能力有門檻（例如「強打者」要力量 50 以上），
 * 不然會出現力量 F 的人卻是強打者這種怪事。
 */
function makeSkills(main, talent, abilities, rng) {
  const role = main === 'P' ? 'pitcher' : 'batter';
  const allowed = (s) => {
    if (!s.req) return true;
    const v = abilities[s.req.stat];
    if (s.req.min !== undefined && v < s.req.min) return false;
    if (s.req.max !== undefined && v > s.req.max) return false;
    return true;
  };
  const goodPool = skillsFor(role, true).filter(allowed).map((s) => s.id);
  const badPool = skillsFor(role, false).filter(allowed).map((s) => s.id);

  const goodCount = Math.max(0, Math.round(gauss(rng) * 0.8 + talent - 2));
  const badCount = Math.max(0, Math.round(gauss(rng) * 0.6 + (4 - talent) * 0.5));

  const take = (pool, n) => {
    const copy = [...pool];
    const out = [];
    for (let i = 0; i < n && copy.length; i++) {
      out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
    }
    return out;
  };

  return [...take(goodPool, goodCount), ...take(badPool, badCount)];
}

/**
 * 做一個新球員。
 *   grade    年級 1〜3
 *   talent   天賦 1〜5 星
 *   position 主守備位置，不給就隨機
 */
export function createPlayer({
  gradeYear = 1, talent = 3, position = null, name = null,
  growthType = null, rng = Math.random,
} = {}) {
  const main = position || pick(POSITIONS, rng).id;
  const profile = POSITION_PROFILE[main] || {};
  const base = talentBase(talent) + (gradeYear - 1) * GROWTH_PER_YEAR;

  // 野手也有投手能力（緊急時可以上去投），但要明顯比真投手差，
  // 不然會出現「中外野手球速 145」這種怪事。
  const pitcherStatIds = PITCHER_STATS.map((s) => s.id);
  const roll = (statId) => {
    const off = main !== 'P' && pitcherStatIds.includes(statId) ? -16 : 0;
    const bonus = (profile[statId] || 0) + off;
    return clamp(Math.round(base + bonus + gauss(rng) * 9), 1, MAX_ABILITY);
  };

  const abilities = {};
  for (const s of [...BATTER_STATS, ...PITCHER_STATS]) abilities[s.id] = roll(s.id);

  // 每個人有自己的天花板。沒有這個的話，練久了所有人都會頂到 90，
  // 天賦和成長期就完全沒有意義了。
  const stage = growthType || rollGrowthType(rng);
  // 早熟的人上限比較低，晚成的人上限比較高 —— 這就是「賭他」的地方
  const capMult = { early: 0.90, normal: 1.0, late: 1.12 }[stage];
  const potential = {};
  for (const s of [...BATTER_STATS, ...PITCHER_STATS]) {
    const off = main !== 'P' && pitcherStatIds.includes(s.id) ? -16 : 0;
    const raw = (talentBase(talent) + 30 + (profile[s.id] || 0) + off + gauss(rng) * 8) * capMult;
    potential[s.id] = clamp(Math.round(raw), abilities[s.id], MAX_ABILITY);
  }

  return {
    id: `p${Math.floor(rng() * 1e9).toString(36)}`,
    name: name || randomPersonName(rng),
    gradeYear,
    talent,
    growthType: stage,
    position: main,
    throws: rng() < 0.25 ? 'L' : 'R',
    bats: rng() < 0.35 ? 'L' : 'R',
    abilities,
    potential,
    aptitudes: makeAptitudes(main, rng),
    skills: makeSkills(main, talent, abilities, rng),
    // 職棒球探注目度：0〜100，打出好表現會累積，畢業時夠高就可能被選走
    scoutAttention: 0,
    // 學力：0〜100，跟球技沒關係，是獨立抽的——書呆子強打者、四肢發達
    // 頭腦簡單的王牌投手都可能出現。考不過期末考會被禁賽，見 roguelike.js
    gakuryoku: clamp(Math.round(50 + gauss(rng) * 16), 5, 95),
    // 生涯數據：畢業時拿來顯示戰績用，被選進職棒的人會寫進結算圖
    career: {
      bat: {
        ab: 0, h: 0, hr: 0, rbi: 0, r: 0, bb: 0, k: 0, tb: 0, games: 0,
      },
      pit: {
        outs: 0, h: 0, r: 0, bb: 0, k: 0, pitches: 0, games: 0,
      },
    },
  };
}

/** 累加一場比賽的生涯數據。bat／pit 是那場比賽的紀錄表，沒上場就不會有 */
export function accumulateCareerStats(player, bat, pit) {
  if (bat) {
    const c = player.career.bat;
    c.ab += bat.ab; c.h += bat.h; c.hr += bat.hr; c.rbi += bat.rbi;
    c.r += bat.r; c.bb += bat.bb; c.k += bat.k; c.tb += bat.tb; c.games += 1;
  }
  if (pit) {
    const c = player.career.pit;
    c.outs += pit.outs; c.h += pit.h; c.r += pit.r; c.bb += pit.bb;
    c.k += pit.k; c.pitches += pit.pitches; c.games += 1;
  }
}

const fixed3 = (v) => v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.');

/** 打者的生涯數據，換算成看板棒球慣用的縮寫（AVG／OBP／SLG／OPS） */
export function battingLine(bat) {
  if (!bat.ab) return null;
  const avg = bat.h / bat.ab;
  const obp = (bat.h + bat.bb) / (bat.ab + bat.bb);
  const slg = bat.tb / bat.ab;
  return {
    avg: fixed3(avg), obp: fixed3(obp), slg: fixed3(slg), ops: fixed3(obp + slg),
    hr: bat.hr, rbi: bat.rbi,
  };
}

/** 投手的生涯數據：ERA（失分率，沒有分自責分／非自責分，是簡化版）、WHIP */
export function pitchingLine(pit) {
  if (!pit.outs) return null;
  const innings = pit.outs / 3;
  return {
    ip: innings.toFixed(1),
    era: ((pit.r / pit.outs) * 27).toFixed(2),
    whip: ((pit.bb + pit.h) / innings).toFixed(2),
    k: pit.k,
  };
}

/** 生涯數據換成一行看得懂的字：打者看 AVG／HR／RBI／OPS，投手看 IP／ERA／WHIP／K */
export function careerLine(player) {
  const { bat, pit } = player.career;
  const parts = [];
  const b = battingLine(bat);
  if (b) parts.push(`AVG ${b.avg}・${b.hr}HR・${b.rbi}RBI・OPS ${b.ops}`);
  const p = pitchingLine(pit);
  if (p) parts.push(`${p.ip}IP・ERA ${p.era}・WHIP ${p.whip}・${p.k}K`);
  return parts.length ? parts.join('・') : '沒有上場紀錄';
}

// ── 讀取用的輔助函式 ────────────────────────────────────

/** 某項能力的字母等級 */
export const abilityGrade = (player, statId) => grade(player.abilities[statId]);

/** 球速顯示成 km/h */
export const playerVelocity = (player) => velocityKmh(player.abilities.velocity);

/** 放在某個位置時，守備能力剩多少（適性不合會打折） */
export function fieldingAt(player, positionId) {
  const apt = player.aptitudes[positionId] || 'G';
  return Math.round(player.abilities.field * APTITUDE_PENALTY[apt]);
}

/** 是不是投手 */
export const isPitcher = (player) => player.position === 'P';

/**
 * 把每一項能力的上限墊高，也讓一開始的能力跟著沾光一半——
 * 只墊高上限的話，要練好幾年才追得上，感覺不出「學校變強了」；
 * 起始能力也跟著漲，買下去馬上看得到差別。
 * 這是唯一能真的突破「天賦封頂」的辦法——校務投資裡的「英才培育」
 * 就是靠這個讓學校長期而言真的越帶越強，不只是練得比較輕鬆。
 */
export function boostPotential(players, bonus) {
  if (!bonus) return players;
  players.forEach((p) => {
    Object.keys(p.potential).forEach((k) => {
      p.potential[k] = Math.min(MAX_ABILITY, p.potential[k] + bonus);
      p.abilities[k] = Math.min(p.potential[k], p.abilities[k] + bonus * 0.5);
    });
  });
  return players;
}

/**
 * 粗略的整體評價，只拿來排序和顯示，不是比賽用的數字。
 * 投手看投手能力，野手看打者能力。
 */
export function overall(player) {
  const a = player.abilities;
  const value = isPitcher(player)
    ? (a.velocity + a.control + a.stamina + a.breaking) / 4
    : (a.meet * 1.2 + a.power * 1.1 + a.speed + a.field + a.arm * 0.8 + a.catch * 0.9) / 6;
  return Math.round(value);
}

export const overallGrade = (player) => grade(overall(player));

/** 給畫面用：全部等級由高到低 */
export const GRADE_LETTERS = GRADES.map((g) => g.letter);
