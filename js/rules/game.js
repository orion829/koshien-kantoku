// 遊戲主迴圈
//
// 一週一週往前推。每一週分三種：
//   練習週 → 玩家挑一個行動
//   比賽週 → 打比賽（現在是暫時的簡單判定）
//   過場週 → 按下一步
//
// 輸掉的比賽會讓後面的週變成練習週，這在 calendar.js 的 toTrainingWeek 裡。

import { toTrainingWeek } from '../data/calendar.js';
import { grade } from '../data/abilities.js';
import { MENUS, menuById, trainTeam } from './training.js';
import { efficiency, moraleLabel, advance } from './morale.js';
import { overall, isPitcher, createPlayer } from './player.js';
import {
  advanceYear, addRecruits, active, retireSeniors, MIN_PLAYERS,
} from './roster.js';

// ── 比賽的資格關聯 ──────────────────────────────────────
// 地區大賽輸了就沒有甲子園；秋季縣大賽輸了就沒有秋季地區大賽，
// 秋季地區大賽沒打進冠軍賽就沒有春季甲子園。
const REQUIRES = {
  koshien: 'regional',
  autumnArea: 'autumn',
  senbatsu: 'autumnArea',
};

const emptyProgress = () => ({
  regional: null, koshien: null, autumn: null, autumnArea: null, senbatsu: null,
});

/** 這一年這個賽事有沒有被淘汰（或根本沒資格） */
export function isBlocked(game, phase) {
  const p = game.progress[game.cursor.year - 1] || emptyProgress();
  if (p[phase] && p[phase].out) return true;
  const need = REQUIRES[phase];
  if (!need) return false;
  const prev = p[need];
  if (!prev) return true;              // 前一關還沒打完 → 還沒資格
  if (phase === 'senbatsu') return !prev.qualified;
  return !prev.champion;
}

/** 目前這一週（輸掉的比賽週會轉成練習週） */
export function currentWeek(game) {
  const year = game.schedule[game.cursor.year - 1];
  const w = year?.[game.cursor.week - 1];
  if (!w) return null;
  if (w.kind === 'match' && isBlocked(game, w.phase)) return toTrainingWeek(w);
  return w;
}

export const isRunOver = (game) => currentWeek(game) === null;

// ── 可以做的行動 ────────────────────────────────────────

export const SPECIAL_ACTIONS = [
  { id: 'practice', name: '練習賽', desc: '不長能力，但可以把士氣計時器往回撥 4 週' },
  { id: 'rest', name: '休息', desc: '消疲勞（疲勞系統還沒做）', todo: true },
  { id: 'scout', name: '招生', desc: '去談新生（還沒做）', todo: true, window: 'winter' },
  { id: 'recon', name: '偵察對手', desc: '看下一場的對手（還沒做）', todo: true, window: 'preMatch' },
];

/** 這一週有哪些行動可以選 */
export function availableActions(game) {
  const w = currentWeek(game);
  if (!w || w.kind !== 'training') return [];

  const year = game.schedule[game.cursor.year - 1];
  const nextMatch = year.findIndex(
    (x, i) => i >= game.cursor.week - 1 && x.kind === 'match',
  );
  const weeksToMatch = nextMatch < 0 ? 99 : nextMatch - (game.cursor.week - 1);

  const menus = MENUS.map((m) => ({
    id: m.id, name: m.name, kind: 'menu',
    desc: Object.entries(m.weights)
      .map(([s, v]) => `${STAT_NAME[s]} +${v}`).join('、'),
  }));

  const specials = SPECIAL_ACTIONS.filter((a) => {
    if (a.id === 'practice') return !!w.canPractice;
    if (a.window === 'winter') return w.phase === 'winter';
    if (a.window === 'preMatch') return weeksToMatch <= 3;
    return true;
  }).map((a) => ({ ...a, kind: 'special' }));

  return [...menus, ...specials];
}

const STAT_NAME = {
  meet: '打擊', power: '力量', speed: '速度', arm: '臂力',
  field: '守備', catch: '接球', velocity: '球速',
  control: '控球', stamina: '耐力', breaking: '變化球',
};

// ── 比賽（暫時的簡單判定，之後要換成真的模擬）────────────

/** 隊伍戰力：先發野手的平均 + 王牌投手（退隊的不算） */
export function teamStrength(all) {
  const sorted = active(all).sort((a, b) => overall(b) - overall(a));
  const batters = sorted.filter((p) => !isPitcher(p)).slice(0, 8);
  const ace = sorted.find(isPitcher);
  const batAvg = batters.length
    ? batters.reduce((n, p) => n + overall(p), 0) / batters.length : 30;
  return Math.round(batAvg * 0.6 + (ace ? overall(ace) : 30) * 0.4);
}

/**
 * 對手的強度。越後面的輪次越強，全國大賽的底子也比較高。
 * base 是第一輪的對手，step 是每贏一場對手變強多少。
 *
 * ⚠️ 這整段是暫時的。真的比賽模擬做好之後要換掉。
 * 現在的目標只是讓數字合理：接手的隊伍（戰力約 50）幾乎打不進甲子園，
 * 練滿三年（戰力約 70）才有機會。
 */
const OPPONENT = {
  regional: { base: 38, step: 6 },
  koshien: { base: 60, step: 4 },
  autumn: { base: 36, step: 5 },
  autumnArea: { base: 50, step: 5 },
  senbatsu: { base: 58, step: 4 },
};

function opponentStrength(phase, roundIndex, wins) {
  const o = OPPONENT[phase] || { base: 40, step: 4 };
  // 激戰區的對手比較強
  const local = phase === 'regional' ? (wins - 6) * 3 : 0;
  return o.base + local + roundIndex * o.step;
}

/** 打一場。回傳 true 代表贏 */
function playGame(mine, theirs, rng) {
  const p = 1 / (1 + Math.exp(-(mine - theirs) / 9));
  return rng() < p;
}

/**
 * 打完這一週的比賽。回傳每一場的結果。
 * 輸掉就把這個賽事標成淘汰，後面的週會自動變成練習週。
 */
export function playWeek(game, rng = Math.random) {
  const w = currentWeek(game);
  const prog = game.progress[game.cursor.year - 1];
  const mine = teamStrength(game.team.players);

  // 這一週是這個賽事的第幾輪開始
  const year = game.schedule[game.cursor.year - 1];
  let roundIndex = 0;
  for (let i = 0; i < game.cursor.week - 1; i++) {
    if (year[i].phase === w.phase && year[i].kind === 'match') {
      roundIndex += year[i].games.length;
    }
  }

  const results = [];
  let out = false;
  for (let i = 0; i < w.games.length; i++) {
    const theirs = opponentStrength(w.phase, roundIndex + i, game.difficulty.wins);
    const won = playGame(mine, theirs, rng);
    results.push({ round: w.games[i], won, mine, theirs });
    if (!won) { out = true; break; }
  }

  const finishedPhase = !out && isLastWeekOfPhase(year, w);
  prog[w.phase] = {
    out,
    champion: finishedPhase,
    // 春季甲子園的資格：秋季地區大賽有贏過至少一場就算
    qualified: w.phase === 'autumnArea' ? results.some((r) => r.won) : undefined,
    lastRound: results[results.length - 1]?.round,
  };

  game.morale.weeksSinceMatch = 0;
  return results;
}

function isLastWeekOfPhase(year, w) {
  const idx = year.findIndex((x) => x.week === w.week);
  const next = year[idx + 1];
  return !next || next.phase !== w.phase;
}

// ── 推進 ────────────────────────────────────────────────

/**
 * 做一個行動然後前進一週。
 * actionId 只有練習週要給。
 */
export function takeAction(game, actionId, rng = Math.random) {
  const w = currentWeek(game);
  if (!w) return null;
  const log = { week: w.abs, month: w.month, event: w.event, kind: w.kind };

  if (w.kind === 'match') {
    log.results = playWeek(game, rng);
  } else if (w.kind === 'training') {
    const eff = efficiency(game.morale.weeksSinceMatch);
    log.efficiency = eff;
    log.morale = moraleLabel(game.morale.weeksSinceMatch);
    if (actionId === 'practice') {
      game.morale.weeksSinceMatch = advance(game.morale.weeksSinceMatch, 'practice');
      log.action = '練習賽';
    } else if (menuById(actionId)) {
      const players = active(game.team.players);
      const before = snapshotGrades(players);
      const results = trainTeam(players, actionId, eff);
      log.gains = summariseGains(players, results, before);
      game.morale.weeksSinceMatch = advance(game.morale.weeksSinceMatch, 'train');
      log.action = menuById(actionId).name;
      log.trained = true;
    } else {
      game.morale.weeksSinceMatch = advance(game.morale.weeksSinceMatch, 'rest');
      log.action = '休息';
    }
  } else {
    game.morale.weeksSinceMatch += 1;
    log.action = '（過場）';
    if (w.retireSeniors) {
      log.retired = retireSeniors(game.team.players);
      log.joined = fillToMinimum(game, rng);
    }
  }

  step(game, rng);
  return log;
}

/**
 * 三年級退隊之後如果人數不夠 9 個，會有校內的同學來入部。
 * 現實中人數真的不夠是要組聯合隊伍的，那個還沒做，
 * 先用這個保底避免比賽開不成。他們都很弱（1 星）。
 */
function fillToMinimum(game, rng) {
  const need = MIN_PLAYERS - active(game.team.players).length;
  if (need <= 0) return 0;
  const holes = missingPositions(active(game.team.players));
  const recruits = Array.from({ length: need }, (_, i) => createPlayer({
    gradeYear: rng() < 0.5 ? 1 : 2,
    talent: 1,
    position: holes[i] || null,
    rng,
  }));
  game.team.players = addRecruits(game.team.players, recruits);
  return need;
}

/** 哪些守備位置現在沒人 */
function missingPositions(players) {
  const have = new Set(players.map((p) => p.position));
  return ['P', 'C', 'SS', 'CF', '1B', '2B', '3B', 'RF', 'LF'].filter((p) => !have.has(p));
}

// ── 這一週長了多少（給畫面顯示）────────────────────────

const snapshotGrades = (players) => Object.fromEntries(players.map((p) => [
  p.id, Object.fromEntries(Object.entries(p.abilities).map(([k, v]) => [k, grade(v)])),
]));

/**
 * 把全隊的成長整理成看得懂的東西：
 *   avg 各項能力的平均成長
 *   ups 有人升級了（例如 打擊 D → C），這是最有感的部分
 */
function summariseGains(players, results, before) {
  const totals = {};
  results.forEach(({ gains }) => {
    for (const [stat, g] of Object.entries(gains)) {
      totals[stat] = (totals[stat] || 0) + g;
    }
  });

  const avg = Object.entries(totals)
    .map(([stat, sum]) => ({ stat, name: STAT_NAME[stat], value: sum / players.length }))
    .filter((x) => x.value >= 0.05)
    .sort((a, b) => b.value - a.value);

  const ups = [];
  players.forEach((p) => {
    const was = before[p.id] || {};
    for (const [stat, v] of Object.entries(p.abilities)) {
      const now = grade(v);
      if (was[stat] && was[stat] !== now) {
        ups.push({ name: p.name, stat: STAT_NAME[stat], from: was[stat], to: now });
      }
    }
  });

  return { avg, ups };
}

/** 游標往前一週，需要的話換年 */
function step(game, rng) {
  const year = game.schedule[game.cursor.year - 1];
  game.cursor.week += 1;
  game.cursor.abs += 1;

  if (game.cursor.week <= year.length) return;

  // 這一年結束了
  if (game.cursor.year >= game.schedule.length) {
    game.cursor.week = year.length + 1;   // 超出範圍 = 這一局結束
    return;
  }
  game.cursor.year += 1;
  game.cursor.week = 1;
  rollOver(game, rng);
}

/** 換年：三年級畢業、其他人升一級、新生入隊 */
function rollOver(game, rng) {
  const { players, graduated } = advanceYear(game.team.players);
  const count = 4 + Math.floor(rng() * 4);
  const recruits = Array.from({ length: count }, () => createPlayer({
    gradeYear: 1,
    talent: 1 + Math.floor(rng() * (2 + game.difficulty.scoutPool)),
    rng,
  }));
  game.team.players = addRecruits(players, recruits);
  game.lastRollover = {
    graduated: graduated.map((p) => p.name),
    recruits: recruits.map((p) => p.name),
  };
}
