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

/**
 * 一、二年級（三年級八月退隊之後還會留下來的人）加起來要有幾個，
 * 不然隔天退隊完就快湊不出一隊。不分開局種類，這是保底，
 * 不是難度——難度用天賦（talent）去做就好，人數不該是卡關的原因。
 */
export const CONTINUING_MIN = 16;

/** 哪些守備位置現在沒人守 */
function missingPositions(players) {
  const have = new Set(players.map((p) => p.position));
  return POSITIONS.map((p) => p.id).filter((p) => p !== 'P' && !have.has(p));
}

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

  // 一、二年級人數不夠的話，補幾個資質普通的人進來湊數
  const continuing = players.filter((p) => p.gradeYear < 3);
  if (continuing.length < CONTINUING_MIN) {
    const need = CONTINUING_MIN - continuing.length;
    const holes = missingPositions(continuing);
    for (let i = 0; i < need; i++) {
      players.push(createPlayer({
        gradeYear: rng() < 0.5 ? 1 : 2,
        talent: randInt(rng, arch.talent[0], Math.max(arch.talent[0], arch.talent[1] - 1)),
        position: holes[i] || null,
        rng,
      }));
    }
  }

  players.sort((a, b) => b.gradeYear - a.gradeYear || overall(b) - overall(a));
  return { archetype: arch, players };
}

// ── 隊伍的統計 ──────────────────────────────────────────

/** 隊伍能養幾個部員 */
export const ROSTER_LIMIT = 25;

/** 比賽能登錄幾個人（照真實規則）。養 25 個，但只有 20 個能上場 */
export const MATCH_ROSTER = 20;

/** 人數不足要組聯合隊伍的門檻（照真實規則） */
export const MIN_PLAYERS = 9;

/**
 * 挑出這場比賽要登錄的 20 個人。
 * 先確保投手和捕手夠，剩下的照整體評價挑。
 * 沒被選上的人這場就是看台上的觀眾。
 */
export function matchRoster(players, limit = MATCH_ROSTER) {
  const pool = [...players].sort((a, b) => overall(b) - overall(a));
  if (pool.length <= limit) return pool;

  const picked = [];
  const take = (filter, n) => {
    for (const p of pool) {
      if (picked.length >= limit || picked.filter(filter).length >= n) break;
      if (filter(p) && !picked.includes(p)) picked.push(p);
    }
  };

  take((p) => p.position === 'P', 3);        // 一週三場，至少要三個投手
  take((p) => p.position === 'C', 2);        // 捕手也要備援
  for (const p of pool) {
    if (picked.length >= limit) break;
    if (!picked.includes(p)) picked.push(p);
  }
  return picked;
}

/**
 * 還在隊上的人。三年級八月退隊之後就不算在內了
 * —— 他們還在學校，但不再上場，也不用再練。
 */
export const active = (players) => players.filter((p) => !p.retired);

/** 三年級退隊（八月）。他們留在存檔裡，只是不再出現在名單和練習裡 */
export function retireSeniors(players) {
  let n = 0;
  players.forEach((p) => {
    if (p.gradeYear >= 3 && !p.retired) { p.retired = true; n += 1; }
  });
  return n;
}

/**
 * 升上新學年。三年級畢業離隊，其他人年級 +1。
 * 回傳 { players 留下來的人, graduated 畢業的人 }
 */
export function advanceYear(players) {
  const graduated = players.filter((p) => p.gradeYear >= 3);
  const staying = players
    .filter((p) => p.gradeYear < 3)
    .map((p) => ({ ...p, gradeYear: p.gradeYear + 1 }));
  return { players: staying, graduated };
}

/** 新生入隊 */
export function addRecruits(players, recruits) {
  return [...players, ...recruits].sort(
    (a, b) => b.gradeYear - a.gradeYear || overall(b) - overall(a),
  );
}

export function rosterSummary(all) {
  const players = active(all);
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
    retired: all.length - players.length,
  };
}
