// 遊戲主迴圈
//
// 一週一週往前推。每一週分三種：
//   練習週 → 玩家挑一個行動
//   比賽週 → 打比賽（現在是暫時的簡單判定）
//   過場週 → 按下一步
//
// 輸掉的比賽會讓後面的週變成練習週，這在 calendar.js 的 toTrainingWeek 裡。

import { toTrainingWeek, extendRun } from '../data/calendar.js';
import { grade } from '../data/abilities.js';
import {
  MENUS, menuById, trainTeam, growFromMatch, scoutGainFromMatch,
} from './training.js';
import { efficiency, moraleLabel, advance, PRACTICE_FLOOR } from './morale.js';
import {
  overall, isPitcher, createPlayer, boostPotential, accumulateCareerStats, careerLine,
} from './player.js';
import { generateOpponent, buildLineup, playMatch } from './match.js';
import { randomProTeam } from '../data/proTeams.js';
import {
  healthy, isInjured, injure, healWeek, matchInjuryChance, trainInjuryChance,
} from './injury.js';
import {
  addMatchFatigue, decayFatigue, fatigueInjuryMult, applyFatiguePenalty, restoreAbilities,
} from './fatigue.js';
import {
  advanceYear, addRecruits, active, retireSeniors,
  MIN_PLAYERS, ROSTER_LIMIT, matchRoster,
} from './roster.js';
import {
  generateCandidates, visitCandidate, resolveScouting, fameOf,
} from './scouting.js';
import {
  modifiers, matchMods, drawPerks, drawTactics, rollEvent, tacticById,
  pickTransferWeek, rollTransferStudent, resolveTransfer, rollAwaken, resolveAwaken,
  rollAlumniVisit, resolveAlumniVisit, legacyPointsFor, buyUpgrade, upgradeCost, resolveExam,
  refreshExamEligibility, createManager, rollGraduatePath, managerSkillById, rollWildVisit,
  rollWonderEvent, rollTrainingWonderEvent,
} from './roguelike.js';

export {
  choosePerk, resolveEvent, drawTactics, modifiers, matchMods, resolveTransfer,
  resolveAwaken, resolveAlumniVisit, buyUpgrade, upgradeCost,
  PERKS, perkById, TACTICS, tacticById, eventById, UPGRADES, upgradeById,
  MANAGER_SKILLS, managerSkillById, GRADUATE_PATHS, graduatePathById, activeManagers,
} from './roguelike.js';

// 畫面上不顯示「第幾年」，改顯示真的西元年，從這一年開始算
export const START_YEAR = 2026;
export const calendarYear = (campaignYear) => START_YEAR + campaignYear - 1;

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
  { id: 'rest', name: '休息', desc: '不練球，但能大幅消除全隊疲勞' },
  {
    id: 'study', name: '讀書', desc: '不練球，但全隊學力 +6（越低分進步越快）',
  },
  { id: 'scout', name: '招生', desc: '去看國中生，提高他來的意願', window: 'winter' },
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

/** 隊伍戰力：先發野手的平均 + 王牌投手（退隊和養傷中的不算） */
export function teamStrength(all) {
  const sorted = healthy(active(all)).sort((a, b) => overall(b) - overall(a));
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
 * 目標：認真玩（有練、有買校務投資升級）拿到夏季甲子園冠軍大概要
 * 　　　普通難度（贏 6 場）第 13 年左右、地獄難度（贏 8 場）第 16 年左右。
 * 這個對手強度不會因為玩家帶了幾年而變，所以只要有在練、有在買升級，
 * 會自然而然越打越輕鬆——用 tools/balance.mjs 的「多少年拿冠軍」驗證過。
 */
const OPPONENT = {
  regional: { base: 42, step: 2.5 },
  koshien: { base: 51, step: 3 },
  autumn: { base: 36, step: 5 },
  autumnArea: { base: 50, step: 5 },
  senbatsu: { base: 58, step: 4 },
};

function opponentStrength(phase, roundIndex, wins) {
  const o = OPPONENT[phase] || { base: 40, step: 4 };
  // 激戰區的對手比較強
  const local = phase === 'regional' ? (wins - 6) * -0.55 : 0;
  return o.base + local + roundIndex * o.step;
}

/** 日本的規則：投手一週最多 500 球 */
export const WEEKLY_PITCH_LIMIT = 500;

/**
 * 打完這一週的比賽。一週最多三場，輸了就停。
 * 每一場都是完整的模擬，會產生詳細的紀錄表。
 * wonder：這一週先算好的奇妙事件（見 takeAction），沒有就是 null。
 */
export function playWeek(game, rng = Math.random, wonder = null) {
  const w = currentWeek(game);
  const prog = game.progress[game.cursor.year - 1];

  // 這一週是這個賽事的第幾輪開始
  const year = game.schedule[game.cursor.year - 1];
  let roundIndex = 0;
  for (let i = 0; i < game.cursor.week - 1; i++) {
    if (year[i].phase === w.phase && year[i].kind === 'match') {
      roundIndex += year[i].games.length;
    }
  }

  // 傳統 ＋ 這一週選的作戰 ＋ 這一週的奇妙事件（例如被知名 YouTuber 盯上）
  const mods = matchMods(game);
  wonder?.apply(mods);

  // 這一週的投球數要跨場累計（500 球規則）
  const pitchedThisWeek = new Map();

  const results = [];
  let out = false;
  for (let i = 0; i < w.games.length; i++) {
    const theirs = opponentStrength(w.phase, roundIndex + i, game.difficulty.wins);
    const opp = generateOpponent(theirs, rng);

    // 一週投超過 500 球的人不能再投，但還是要上場打擊（真實規則）
    // 期末考沒過的人也不能出賽，直到下次考試重新算
    const banned = new Set(game.examBanned || []);
    const ours = healthy(active(game.team.players)).filter((p) => !banned.has(p.id));
    const cannotPitch = ours
      .filter((p) => (pitchedThisWeek.get(p.id) || 0) >= WEEKLY_PITCH_LIMIT)
      .map((p) => p.id);
    // 一場比賽只能登錄 20 人（真實規則），從能上場的人裡面挑
    const registered = matchRoster(ours);
    // 玩家自己排的先發（可能沒設定，沒設定就照原本的自動邏輯）；
    // 投手輪值一週最多 3 場，第幾場就用輪值的第幾個人
    const custom = game.customLineup;
    const pitcherId = custom?.pitchers?.length
      ? custom.pitchers[i % custom.pitchers.length] : null;
    const mine = buildLineup(registered, {
      cannotPitch, pitcherId, customOrder: custom?.order || null,
    });
    const theirLineup = buildLineup(opp.players);

    // 甲子園本戰沒有提前結束，地區大賽和秋季大賽有
    const mercy = !['koshien', 'senbatsu'].includes(w.phase);
    // 疲勞的人這場比賽能力暫時打折，打完馬上換回來——
    // 不然折扣會被 applyMatchOutcome 的成長永久疊進能力值裡
    const fatigueSnapshot = applyFatiguePenalty(ours);
    const m = playMatch(
      { name: game.school.name, ...mine, mods },
      { name: opp.name, ...theirLineup, mods: opp.mods },
      rng,
      { mercy },
    );
    restoreAbilities(ours, fatigueSnapshot);

    // 記投球數
    m.home.pitchers.forEach((p) => {
      pitchedThisWeek.set(p.id, (pitchedThisWeek.get(p.id) || 0) + p.pitches);
    });

    const won = m.winner === 'home';
    const growth = applyMatchOutcome(game, m, rng, mods, w.phase);
    const rival = recordRivalResult(game, opp.name, won);

    results.push({
      round: w.games[i],
      won,
      opponent: opp.name,
      trait: opp.trait,
      tacticName: tacticById(game.tactic)?.name || null,
      score: { us: m.home.total, them: m.away.total },
      innings: m.innings,
      called: m.called,
      box: { us: m.home, them: m.away },
      plays: m.plays,
      growth,
      rival,
    });

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
  // 作戰只管這一週
  game.tactic = null;
  game.tacticChoices = null;
  return results;
}

/** 對戰紀錄裡，同一個名字打過幾次才算「宿敵」 */
export const RIVAL_THRESHOLD = 3;

/**
 * 記一筆對戰結果，回傳到目前為止（含這一場）跟這支對手的生涯戰績。
 * 對手是每場重新生成的，「同一個名字」就代表同一支宿敵學校。
 */
export function recordRivalResult(game, name, won) {
  game.rivalRecords = game.rivalRecords || {};
  const rec = game.rivalRecords[name] || { wins: 0, losses: 0 };
  if (won) rec.wins += 1; else rec.losses += 1;
  game.rivalRecords[name] = rec;
  const meetings = rec.wins + rec.losses;
  return {
    name, wins: rec.wins, losses: rec.losses, meetings, isRival: meetings >= RIVAL_THRESHOLD,
  };
}

/**
 * 一場打完之後：依表現讓球員成長，然後擲骰看有沒有人受傷。
 * 投手投越多球越容易受傷 —— 這就是 500 球規則存在的理由。
 */
function applyMatchOutcome(game, m, rng, mods = null, phase = null) {
  const byId = new Map(active(game.team.players).map((p) => [p.id, p]));
  const bat = new Map(m.home.batters.map((b) => [b.id, b]));
  const pit = new Map(m.home.pitchers.map((p) => [p.id, p]));

  const grew = [];
  const injured = [];

  const played = new Set([...bat.keys(), ...pit.keys()]);
  played.forEach((id) => {
    const p = byId.get(id);
    if (!p) return;

    const gains = growFromMatch(p, bat.get(id), pit.get(id));
    const total = Object.values(gains).reduce((a, b) => a + b, 0);
    if (total > 0.05) grew.push({ id: p.id, name: p.name, gains, total });
    scoutGainFromMatch(p, bat.get(id), pit.get(id), phase);
    accumulateCareerStats(p, bat.get(id), pit.get(id));

    const pitches = pit.get(id)?.pitches || 0;
    // 累的時候更容易受傷，投球數的加成和疲勞的加成用乘的
    const injChance = matchInjuryChance(p, pitches)
      * (mods?.matchInjury ?? 1) * fatigueInjuryMult(p.fatigue);
    if (rng() < injChance) {
      injured.push({ ...injure(p, rng), pitches });
    }
    addMatchFatigue(p, pitches);
  });

  return { grew, injured };
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
  // 還有沒選的三選一或事件，先擋著
  if (game.pendingDraft || game.pendingEvent || game.pendingTransfer
    || game.pendingAwaken || game.pendingAlumniVisit || game.pendingWildVisit) return null;
  // 校務投資面板只顯示一畫面：離開這一畫面（不管做什麼行動）就收起來
  game.pendingInvest = false;

  const mods = modifiers(game);
  const boost = game.weekBoost || null;
  game.weekBoost = null;

  const log = { week: w.abs, month: w.month, event: w.event, kind: w.kind };

  if (w.kind === 'match') {
    const wonder = rollWonderEvent(game, fameOf(game), rng);
    if (wonder) {
      log.wonderEvent = {
        id: wonder.id, name: wonder.name, desc: wonder.desc, negative: !!wonder.negative,
      };
    }
    log.results = playWeek(game, rng, wonder);
  } else if (w.kind === 'training') {
    const eff = efficiency(game.morale.weeksSinceMatch);
    log.efficiency = eff;
    log.morale = moraleLabel(game.morale.weeksSinceMatch);
    const trainingWonder = rollTrainingWonderEvent(game, fameOf(game), rng);
    if (trainingWonder) log.wonderEvent = trainingWonder;
    if (actionId === 'practice') {
      game.morale.weeksSinceMatch = Math.max(
        PRACTICE_FLOOR,
        advance(game.morale.weeksSinceMatch, 'practice') - mods.moraleRewind,
      );
      log.action = '練習賽';
    } else if (actionId?.startsWith('scout:')) {
      const c = game.scouting?.candidates.find((x) => x.id === actionId.slice(6));
      if (c) {
        const gained = visitCandidate(c, rng);
        log.action = `去看 ${c.name}`;
        log.scoutVisit = {
          name: c.name, gained, interest: c.interest, threshold: c.threshold,
        };
      }
      game.morale.weeksSinceMatch = advance(game.morale.weeksSinceMatch, 'rest');
    } else if (actionId === 'study') {
      // 不練球，全隊讀書拉學力——低分的人進步比較快，比較容易追上及格線
      const players = healthy(active(game.team.players));
      log.studyResult = players.map((p) => {
        const from = p.gakuryoku;
        const gain = Math.round(clamp(9 - from / 100 * 5, 3, 9) * eff);
        p.gakuryoku = Math.min(100, from + gain);
        return { id: p.id, name: p.name, from, to: p.gakuryoku };
      }).filter((g) => g.to > g.from);
      game.morale.weeksSinceMatch = advance(game.morale.weeksSinceMatch, 'train');
      log.action = '讀書';
    } else if (menuById(actionId)) {
      // 養傷中的人不參加練習
      const players = healthy(active(game.team.players));
      const before = snapshotGrades(players);
      const gainMult = mods.trainGain * (boost?.gain ?? 1);
      const results = trainTeam(players, actionId, eff, {
        gain: gainMult, weights: mods.weights,
      });
      log.gains = summariseGains(players, results, before);
      log.boost = boost ? gainMult : null;
      // 練習也會受傷，只是機率低很多
      const injMult = mods.trainInjury * (boost?.injury ?? 1);
      log.injured = players
        .flatMap((p) => (rng() < trainInjuryChance(p) * injMult ? [injure(p, rng)] : []));
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
      // 接手時的那批三年級（開局種類，例如「黃金世代」）畢業之後，
      // 主畫面／選手名單就不該再顯示那個開局標籤了——之後的三年級
      // 都是自己養出來的，不是「接手時抽到的那批」
      game.team.startersGraduated = true;
      const { count, retirees } = retireSeniors(game.team.players);
      log.retired = count;
      log.retireeCareers = retirees.map((p) => ({
        id: p.id, name: p.name, position: p.position, line: careerLine(p),
      }));
      log.drafted = checkDraft(game, retirees, rng);
      log.joined = fillToMinimum(game, rng);
      // 沒被選進職棒的畢業生，抽一個「未來的路」記進校友錄——
      // 純粹是花絮，不影響任何數值，只是不想讓畢業生就這樣憑空消失
      const alumni = retirees.map((p) => {
        const draftRec = log.drafted.find((d) => d.id === p.id);
        return {
          id: p.id,
          name: p.name,
          role: 'player',
          position: p.position,
          talent: p.talent,
          overall: overall(p),
          year: game.cursor.year,
          career: careerLine(p),
          drafted: draftRec ? { team: draftRec.team } : null,
          path: draftRec ? null : rollGraduatePath(p, rng),
        };
      });
      game.alumni = [...(game.alumni || []), ...alumni];
      // 這一年的戰績換成傳承點數，可以拿去買永久升級——這是「學校
      // 越帶越強」的主要來源，不會因為這一批球員畢業就歸零
      const earned = legacyPointsFor(game.progress[game.cursor.year - 1], log.drafted.length);
      game.legacyPoints = (game.legacyPoints || 0) + earned;
      log.legacyEarned = earned;
      // 點數是這一步才算出來的，所以投資面板要留到下一畫面才顯示，
      // 不然玩家在這一步看到的還是「還沒加上今年」的舊餘額
      game.pendingInvest = true;
    }
    // 遊戲的第 1 週本身就是期末考的那一週，前面完全沒有練習週可以讀書——
    // 剛接手就把資質差的新生禁賽一整個夏天不合理，所以第一次不算
    if (w.examBefore && w.abs !== 1) {
      const { failed } = resolveExam(game, rng);
      log.examResult = { failed };
    }
  }

  // 招生截止：好感度夠的會來，不夠的就跑掉
  if (w.scoutClose && game.scouting) {
    const { joined, missed } = resolveScouting(game.scouting.candidates, rng);
    game.pendingRecruits = joined;
    log.scoutResult = {
      joined: joined.map((p) => ({ name: p.name, talent: p.talent, position: p.position })),
      missed,
    };
    game.scouting = null;
  }

  // 每過一週，養傷的人就好一點；疲勞也會消一點，選「休息」消更多
  log.returned = healWeek(game.team.players, mods.healSpeed);
  decayFatigue(active(game.team.players), actionId === 'rest');
  // 讀書／事件把學力拉回安全等級的人，這裡就解除停賽，不用等到下次考試
  refreshExamEligibility(game);

  step(game, rng);
  return log;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * 職棒選秀的門檻。注目度低於這個數字完全沒機會；
 * 到 100 的話大約 95% 會被選走，不是保證，選秀本來就有意外。
 */
const DRAFT_THRESHOLD = 40;
/** 職棒是萬中選一的存在，天賦沒到滿星，注目度再高也不會被選 */
const DRAFT_MIN_TALENT = 5;

/**
 * 三年級退隊時檢查每個人的職棒球探注目度，夠高的話可能被選走。
 * 選走的人記在 game.proAlumni 裡，之後練習週會有機率讓他們回來幫忙。
 */
function checkDraft(game, retirees, rng) {
  const drafted = [];
  retirees.forEach((p) => {
    if (p.talent < DRAFT_MIN_TALENT) return;
    const chance = clamp((p.scoutAttention - DRAFT_THRESHOLD) / 60, 0, 0.95);
    if (chance <= 0 || rng() >= chance) return;
    const rec = {
      id: p.id,
      name: p.name,
      position: p.position,
      talent: p.talent,
      overall: overall(p),
      year: game.cursor.year,
      attention: Math.round(p.scoutAttention),
      career: careerLine(p),
      team: randomProTeam(rng),
    };
    game.proAlumni = [...(game.proAlumni || []), rec];
    drafted.push(rec);
  });
  return drafted;
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
        ups.push({
          id: p.id, name: p.name, stat: STAT_NAME[stat], from: was[stat], to: now,
        });
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

  if (game.cursor.week > year.length) {
    // 這一年結束了。遊戲不會自己結束——沒有下一年的話就現生一年，
    // 一直打下去，直到玩家自己按重新開始。
    game.cursor.year += 1;
    game.cursor.week = 1;
    if (game.cursor.year > game.schedule.length) {
      extendRun(game.schedule, game.difficulty.wins);
      game.progress.push({
        regional: null, koshien: null, autumn: null, autumnArea: null, senbatsu: null,
      });
    }
    rollOver(game, rng);
  }

  // 走到招生視窗的第一週，就把這一年的名單生出來
  const nw = currentWeek(game);
  if (!nw) return;
  if (nw.scoutOpen && !game.scouting) {
    game.scouting = { candidates: generateCandidates(game, rng) };
  }

  // roguelike：三選一、突發事件、轉學生、作戰
  // 傳統只有 14 張，長局（例如跑很多年）可能會抽光——
  // 抽光的話就不要塞一個空陣列進去，不然畫面不會顯示，
  // 但 takeAction 的擋鍵還是會把玩家永遠卡住。
  if (nw.draft && !game.pendingDraft) {
    const drawn = drawPerks(game, 3, rng);
    if (drawn.length) game.pendingDraft = drawn;
  }
  if (nw.kind === 'training') {
    // 一週最多跳一張卡：轉學生優先，再來是職棒學長探班、畢業生回訪、覺醒，最後才是一般事件
    if (game.transferWeekIndex === game.cursor.week - 1 && !game.pendingTransfer) {
      game.pendingTransfer = rollTransferStudent(game, rng);
      game.transferWeekIndex = -1;
    } else if (!game.pendingAlumniVisit) {
      const alum = rollAlumniVisit(game, rng);
      if (alum) {
        game.pendingAlumniVisit = alum;
      } else if (!game.pendingWildVisit) {
        const wild = rollWildVisit(game, rng);
        if (wild) {
          game.pendingWildVisit = wild;
        } else if (!game.pendingAwaken) {
          const awaken = rollAwaken(game, rng);
          if (awaken) game.pendingAwaken = awaken;
          else if (!game.pendingEvent) game.pendingEvent = rollEvent(game, rng);
        }
      }
    }
  }
  if (nw.kind === 'match') {
    game.tactic = null;
    game.tacticChoices = drawTactics(rng);
  }
}

/**
 * 換年：三年級畢業、其他人升一級、冬天招到的新生入隊。
 * 招生沒招到人的話，還是會有幾個自己跑來入部的（都很弱）。
 */
function rollOver(game, rng) {
  const { players, graduated } = advanceYear(game.team.players);

  // 這一年的轉學生要在哪一週出現，先抽好
  game.transferWeekIndex = pickTransferWeek(game.schedule[game.cursor.year - 1], rng);

  const scouted = game.pendingRecruits || [];
  game.pendingRecruits = null;

  // 每年四月本來就會有一批自己來報名的普通學生。
  // 招生是為了拿到「好的」，不是為了湊人數。
  const mods = modifiers(game);
  const walkOnCount = 5 + Math.floor(rng() * 4) + mods.walkOnBonus;
  const walkOns = Array.from({ length: walkOnCount }, () => createPlayer({
    gradeYear: 1,
    talent: rng() < 0.75 ? 1 : 2,
    rng,
  }));

  const recruits = [...scouted, ...walkOns];
  // 「英才培育」升級：新加入的人上限直接墊高，這是唯一能突破天賦封頂的辦法
  boostPotential(recruits, mods.potentialBonus);

  // 部員上限 25 人。超過的話從最弱的開始退部
  const limit = ROSTER_LIMIT + mods.rosterBonus;
  let all = addRecruits(players, recruits);
  let quit = [];
  if (all.length > limit) {
    const sorted = [...all].sort((a, b) => overall(b) - overall(a));
    quit = sorted.slice(limit);
    const keep = new Set(sorted.slice(0, limit).map((p) => p.id));
    all = all.filter((p) => keep.has(p.id));
  }

  game.team.players = all;
  game.lastRollover = {
    graduated: graduated.map((p) => p.name),
    scouted: scouted.map((p) => ({ name: p.name, talent: p.talent })),
    walkOns: walkOns.length,
    quit: quit.map((p) => p.name),
  };

  rollOverManagers(game, rng);
}

/**
 * 經理也是三年一輪替：一年招一個一年級，三年級升上去畢業。
 * 跟球員不同的是，經理不受「三年級八月退隊」影響（她們不用出賽），
 * 所以整個流程都放在換年這裡，跟畢業典禮的時間點一致。
 */
function rollOverManagers(game, rng) {
  const managers = game.team.managers || [];
  const staying = [];
  const graduated = [];
  managers.forEach((mgr) => {
    if (mgr.gradeYear >= 3) graduated.push(mgr);
    else staying.push({ ...mgr, gradeYear: mgr.gradeYear + 1 });
  });
  staying.push(createManager(1, rng));
  game.team.managers = staying;

  if (!graduated.length) return;
  const alumni = graduated.map((mgr) => ({
    id: mgr.id,
    name: mgr.name,
    role: 'manager',
    skill: managerSkillById(mgr.skillId)?.name || '',
    year: game.cursor.year,
    drafted: null,
    path: rollGraduatePath(null, rng),
  }));
  game.alumni = [...(game.alumni || []), ...alumni];
}
