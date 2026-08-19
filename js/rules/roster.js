// 你接手的那支隊伍
//
// 六月底上任時，隊伍已經存在了，是前任監督留下來的。
// 三年級兩個月後就退隊，所以你真正能養的是二年級以下。
//
// 開局分三種，這是這個遊戲最重要的隨機性：
//   普通   80%  標準路線，捨第一年、養到第三年
//   弱小   15%  人數不足，先想辦法湊人
//   黃金世代 5%  三年級是即戰力，但八月就走了 —— 拚還是不拚？

import { createPlayer, overall, isPitcher } from './player.js';
import { POSITIONS } from '../data/abilities.js';

export const ARCHETYPES = {
  normal: {
    id: 'normal',
    name: '普通的隊伍',
    weight: 80,
    desc: '沒什麼特別的，該有的都有。慢慢養到第三年。',
    perGrade: [5, 8],
    talent: [1, 3],
    stars: 0,
  },
  weak: {
    id: 'weak',
    name: '快解散的隊伍',
    weight: 15,
    desc: '人數快不夠了。先想辦法把人湊齊再說。',
    perGrade: [3, 4],
    talent: [1, 2],
    stars: 0,
  },
  golden: {
    id: 'golden',
    name: '黃金世代',
    weight: 5,
    desc: '三年級是即戰力，但八月就退隊了。要不要現在就拚？',
    perGrade: [5, 8],
    talent: [1, 3],
    stars: 3, // 三年級裡有幾個 4〜5 星
  },
};

/**
 * 每一個年級都要照這個順序補位置。
 * 重點是「每個年級都要有投手和捕手」——
 * 不然三年級八月退隊之後，隊上會一個投手都沒有。
 */
const GRADE_CORE = ['P', 'C', 'SS', 'CF', '1B', '2B', '3B', 'RF', 'LF', 'P'];

const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** 依機率抽一種開局 */
export function rollArchetype(rng = Math.random) {
  const list = Object.values(ARCHETYPES);
  const total = list.reduce((n, a) => n + a.weight, 0);
  let r = rng() * total;
  for (const a of list) {
    r -= a.weight;
    if (r <= 0) return a;
  }
  return list[0];
}

/**
 * 生成一支隊伍。
 * 回傳 { archetype, players }，players 依年級由大到小排。
 */
export function createRoster({ archetype = null, rng = Math.random } = {}) {
  const arch = archetype || rollArchetype(rng);
  const players = [];

  for (const gradeYear of [3, 2, 1]) {
    const n = randInt(rng, arch.perGrade[0], arch.perGrade[1]);

    // 黃金世代：隨機挑幾個三年級變天才，不要固定落在同一個位置
    const starIdx = new Set();
    if (arch.stars && gradeYear === 3) {
      while (starIdx.size < Math.min(arch.stars, n)) {
        starIdx.add(Math.floor(rng() * n));
      }
    }

    for (let i = 0; i < n; i++) {
      const position = GRADE_CORE[i] || pick(POSITIONS, rng).id;
      const talent = starIdx.has(i)
        ? randInt(rng, 4, 5)
        : randInt(rng, arch.talent[0], arch.talent[1]);
      players.push(createPlayer({ gradeYear, talent, position, rng }));
    }
  }

  players.sort((a, b) => b.gradeYear - a.gradeYear || overall(b) - overall(a));
  return { archetype: arch, players };
}

// ── 隊伍的統計 ──────────────────────────────────────────

/** 能登錄比賽的名單上限（照真實規則） */
export const ROSTER_LIMIT = 20;

/** 人數不足要組聯合隊伍的門檻（照真實規則） */
export const MIN_PLAYERS = 9;

export function rosterSummary(players) {
  const byGrade = { 1: 0, 2: 0, 3: 0 };
  players.forEach((p) => { byGrade[p.gradeYear]++; });

  const pitchers = players.filter(isPitcher);
  const batters = players.filter((p) => !isPitcher(p));
  const mean = (list) => (list.length
    ? Math.round(list.reduce((n, p) => n + overall(p), 0) / list.length)
    : 0);

  return {
    total: players.length,
    byGrade,
    pitchers: pitchers.length,
    batters: batters.length,
    overall: mean(players),
    afterGraduation: players.length - byGrade[3],
    needsMerger: players.length < MIN_PLAYERS,
    overLimit: Math.max(0, players.length - ROSTER_LIMIT),
    best: players.slice().sort((a, b) => overall(b) - overall(a))[0] || null,
  };
}
