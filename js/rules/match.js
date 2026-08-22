// 比賽模擬
//
// 一局一局、一個打席一個打席跑完。輸出完整的紀錄表，
// 包含每個選手的打擊數據和投手數據。
//
// 打席的判定順序：
//   1. 四壞（看投手控球、打者選球眼）
//   2. 三振（看投手的球質 vs 打者的打擊）
//   3. 打進場內 → 是不是安打（看打者、投手、守備）
//   4. 安打的話看力量決定幾壘打
//
// 投球數有記。日本規定投手一週最多 500 球，這在 game.js 裡管。

import { POSITIONS, positionById } from '../data/abilities.js';
import { randomOpponentName } from '../data/schools.js';
import { createPlayer, isPitcher, overall } from './player.js';
import { baseMods, rollOpponentTrait } from './roguelike.js';
import { fatiguePenalty } from './fatigue.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const has = (p, id) => p.skills?.includes(id);

// ── 對手 ────────────────────────────────────────────────

/**
 * 生出一支對手隊伍。只做比賽需要的部分：9 個野手 + 2 個投手。
 * strength 大約 30〜90，會決定他們的能力和學校名字。
 */
export function generateOpponent(strength, rng = Math.random) {
  const talent = clamp(Math.round((strength - 20) / 14), 1, 5);
  const lineupPos = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'P'];
  const players = lineupPos.map((pos) => createPlayer({
    gradeYear: 3, talent, position: pos, rng,
  }));
  players.push(createPlayer({ gradeYear: 2, talent, position: 'P', rng }));

  // 把能力拉到指定的強度附近
  const cur = teamRating(players);
  const shift = strength - cur;
  players.forEach((p) => {
    Object.keys(p.abilities).forEach((k) => {
      p.abilities[k] = clamp(p.abilities[k] + shift, 1, 90);
    });
  });

  // 每支對手學校都有一個特色 —— 同樣的戰力，打起來不一樣
  const { trait, mods } = rollOpponentTrait(rng);
  return { name: randomOpponentName(strength, rng), players, strength, trait, mods };
}

function teamRating(players) {
  const bats = players.filter((p) => !isPitcher(p));
  const ace = players.find(isPitcher);
  const b = bats.length ? bats.reduce((n, p) => n + overall(p), 0) / bats.length : 40;
  return Math.round(b * 0.6 + (ace ? overall(ace) : 40) * 0.4);
}

// ── 選手狀態 ────────────────────────────────────────────
//
// 每一週，每個人都會有「這週的狀態」——不是疲勞、不是受傷，單純是
// 手感好壞，仿照實況野球的五級配色。這是持續一整週的狀態（存在
// p.condition 上），不是打完比賽才看得到，隨時可以在畫面上查看。
// 這也是先發野手也會被冷板凳球員換掉的理由：狀態夠差的先發，狀態
// 夠好的替補可能就會把他的位置搶走。跟球隊整體的「今天的氣勢」
// （form，比賽模擬裡另外算的）是分開的兩層，兩個都有效。

export const CONDITION_TIERS = [
  { id: 'great', label: '絕好調', color: 'pink', mult: 1.20, weight: 8 },
  { id: 'good', label: '好調', color: 'red', mult: 1.08, weight: 22 },
  { id: 'normal', label: '普通', color: 'yellow', mult: 1.00, weight: 40 },
  { id: 'bad', label: '不調', color: 'blue', mult: 0.92, weight: 22 },
  { id: 'terrible', label: '絕不調', color: 'purple', mult: 0.80, weight: 8 },
];

export const conditionTierById = (id) => CONDITION_TIERS.find((t) => t.id === id);

function rollConditionTier(rng) {
  const total = CONDITION_TIERS.reduce((n, t) => n + t.weight, 0);
  let r = rng() * total;
  for (const t of CONDITION_TIERS) {
    r -= t.weight;
    if (r <= 0) return t;
  }
  return CONDITION_TIERS[CONDITION_TIERS.length - 1];
}

const TERRIBLE_TIER = conditionTierById('terrible');

/**
 * 幫一批球員重新抽一次「這一週的狀態」，直接存進 p.condition
 * （{id,label,color,mult}）——每一週都要呼叫一次，不管那週是練習還是
 * 比賽，這樣畫面上隨時查看都有最新的狀態，不用等打完比賽才知道。
 *
 * p.badConditionWeeks：有些奇妙事件（例如被知名 YouTuber 點名關注）
 * 會讓某個球員接下來幾週狀態強制變差，不是隨機抽——這裡每算一週
 * 就消耗一週額度，額度用完就恢復正常隨機抽。
 */
export function refreshWeeklyConditions(players, rng = Math.random) {
  players.forEach((p) => {
    if (p.badConditionWeeks > 0) {
      p.badConditionWeeks -= 1;
      p.condition = TERRIBLE_TIER;
    } else {
      p.condition = rollConditionTier(rng);
    }
  });
}

/** p.condition 換成 Map<球員id, 能力倍率>，給 buildLineup／playMatch 用 */
export function conditionMultipliers(players) {
  return new Map(players.map((p) => [p.id, p.condition?.mult ?? 1]));
}

// ── 上場陣容 ────────────────────────────────────────────

/**
 * 從名單排出先發九人和投手。
 * 守備位置盡量放適性好的人、加上今天的狀態；打線照打擊能力排。
 *
 * customOrder（玩家自己排的先發，可省略）：長度 8 的陣列，
 * [{ playerId, position }, ...]，是打擊順序 1〜8 棒。缺人（受傷、停賽、
 * 被別的位置佔走）的位置會自動補人，補的人一樣排在原本那個棒次。
 *
 * conditions（可省略）：rollConditions() 算出來的今天狀態表。玩家自己
 * 排的先發不會被狀態覆蓋——這是玩家的決定，系統只在「自動排」時參考狀態。
 */
export function buildLineup(players, {
  pitcherId = null, cannotPitch = [], customOrder = null, conditions = null,
} = {}) {
  const pool = players.filter((p) => !p.injury || p.injury.weeks <= 0);
  // 投球數超過一週上限的人還是要上場打擊，只是不能投球
  const blocked = new Set(cannotPitch);
  const condOf = (p) => conditions?.get(p.id) ?? 1;
  // 排野手、選先發投手都要把疲勞算進去——不然疲勞怎麼設都沒用，
  // 因為系統從來不會真的換人，替補永遠沒機會上場
  const fitness = (p) => fatiguePenalty(p.fatigue) * condOf(p);
  // 排先發投手要把疲勞算進去——不然王牌會一直被排上場，
  // 疲勞怎麼設都沒用，因為系統從來不會真的換人。今天的狀態也算進去，
  // 狀態夠差的王牌，二號投手今天狀態好的話真的會把他換下來
  const effectivePitching = (p) => overall(p) * fitness(p);
  const pitchers = pool
    .filter((p) => isPitcher(p) && !blocked.has(p.id))
    .sort((a, b) => effectivePitching(b) - effectivePitching(a));
  const starter = pool.find((p) => p.id === pitcherId && !blocked.has(p.id))
    || pitchers[0]
    || pool.filter((p) => !blocked.has(p.id))[0]
    || pool[0];

  const rest = pool.filter((p) => p.id !== starter.id);
  const fieldPositions = POSITIONS.filter((x) => x.id !== 'P').map((x) => x.id);

  // 玩家自己排的先發：能用的先卡位（人在名單上、位置沒被別的棒次重複用）；
  // 卡不了的棒次留空，等下面自動補人
  const takenPlayers = new Set();
  const takenPositions = new Set();
  const bySlot = new Array(8).fill(null); // 順序就是打擊順序 1〜8
  (customOrder || []).slice(0, 8).forEach((c, i) => {
    const player = rest.find((p) => p.id === c?.playerId);
    if (!player || takenPlayers.has(player.id)) return;
    if (!c.position || !fieldPositions.includes(c.position) || takenPositions.has(c.position)) return;
    takenPlayers.add(player.id);
    takenPositions.add(c.position);
    bySlot[i] = { player, position: c.position };
  });

  // 自動補齊：空的棒次配上還沒用掉的位置，各自挑適性最好的人
  const openPositions = fieldPositions.filter((pos) => !takenPositions.has(pos));
  let openIdx = 0;
  for (let i = 0; i < 8; i += 1) {
    if (bySlot[i]) continue;
    const pos = openPositions[openIdx];
    openIdx += 1;
    if (!pos) break;
    const best = rest
      .filter((p) => !takenPlayers.has(p.id))
      .sort((a, b) => aptScore(b, pos) * fitness(b) - aptScore(a, pos) * fitness(a))[0];
    if (!best) continue;
    takenPlayers.add(best.id);
    bySlot[i] = { player: best, position: pos };
  }

  const filled = bySlot.filter(Boolean);
  // 沒有自訂打線的話，維持原本「打擊好的排前面」（今天狀態也算進去）；
  // 有自訂就照玩家排的順序
  const fielders = customOrder ? filled
    : filled.sort((a, b) => batRating(b.player) * fitness(b.player) - batRating(a.player) * fitness(a.player));

  // 打線：投手放第九棒（甲子園沒有指定打擊）
  const order = fielders.concat([{ player: starter, position: 'P' }]);

  return { starter, bullpen: pitchers.filter((p) => p.id !== starter.id), order };
}

const aptScore = (p, pos) => {
  const g = p.aptitudes?.[pos] || 'G';
  const rank = { S: 8, A: 7, B: 6, C: 5, D: 4, E: 3, F: 2, G: 1 }[g];
  return rank * 20 + p.abilities.field * 0.5 + p.abilities.arm * 0.2;
};

const batRating = (p) => p.abilities.meet * 0.65 + p.abilities.power * 0.35;

// ── 打席 ────────────────────────────────────────────────

/** 投手的球質。投球數越多越掉 */
function pitcherStuff(p, pitches, staminaMult = 1) {
  const limit = (70 + p.abilities.stamina * 0.9) * staminaMult;
  const over = Math.max(0, pitches - limit);
  let fatigue = 1 - over / 120;
  if (has(p, 'ironArm')) fatigue += over / 300;
  const base = p.abilities.velocity * 0.35
    + p.abilities.breaking * 0.4
    + p.abilities.control * 0.25;
  let stuff = base * clamp(fatigue, 0.55, 1);
  if (has(p, 'nobi')) stuff += 3;
  if (has(p, 'kire')) stuff += 3;
  return stuff;
}

/** 守備力：先發九人的守備平均（有考慮適性折扣） */
function defenceRating(order) {
  const vals = order.map(({ player, position }) => {
    const g = player.aptitudes?.[position] || 'A';
    const pen = { S: 1, A: 1, B: 0.92, C: 0.84, D: 0.76, E: 0.68, F: 0.6, G: 0.5 }[g];
    return player.abilities.field * pen * 0.6 + player.abilities.catch * 0.4;
  });
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * 臂力：野手（投手除外）的臂力平均，一樣算適性折扣。
 * 用來決定跑者敢不敢多跑一個壘、長打會不會被外野手擋下來——
 * 這是臂力唯一真正影響比賽的地方，選守備位置只是次要的用途。
 */
function armRating(order) {
  const vals = order
    .filter(({ position }) => position !== 'P')
    .map(({ player, position }) => {
      const g = player.aptitudes?.[position] || 'A';
      const pen = { S: 1, A: 1, B: 0.92, C: 0.84, D: 0.76, E: 0.68, F: 0.6, G: 0.5 }[g];
      return player.abilities.arm * pen;
    });
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

const OUT = 'out';

/**
 * 跑一個打席。回傳 { kind, pitches }
 * kind: 'bb' 四壞 | 'k' 三振 | 'single' | 'double' | 'triple' | 'hr' | 'out' | 'error'
 */
function atBat(batter, pitcher, pitches, defence, ctx, rng) {
  // om = 進攻方的加成、dm = 防守方的加成（傳統 ＋ 作戰 ＋ 對手特色）
  const om = ctx.off;
  const dm = ctx.def;
  let stuff = pitcherStuff(pitcher, pitches, dm.staminaMult) * ctx.pitchCondition + ctx.pitchForm + dm.stuff;
  if (ctx.defTrailing && has(pitcher, 'bigGame')) stuff += 6;
  if (ctx.defTrailing && has(pitcher, 'chokeArtist')) stuff -= 6;
  if (ctx.inning >= 7 && has(pitcher, 'lateFade')) stuff -= 5;
  if (ctx.scoring && has(pitcher, 'clutchPitcher')) stuff += 6;
  const b = batter.abilities;

  // 關鍵時刻的加成 ＋ 今天的狀態（球隊整體 ctx.batForm ＋ 個人手感 ctx.batCondition）＋ 加成表
  let meet = b.meet * ctx.batCondition + ctx.batForm + om.meet;
  let power = b.power * ctx.batCondition + ctx.batForm + om.power;
  if (ctx.trailing) { meet += om.comeback; power += om.comeback; }
  if (ctx.inning <= 2) { meet += om.early; power += om.early; }
  if (ctx.scoring && has(batter, 'clutch')) { meet += 8; power += 8; }
  if (ctx.loaded && has(batter, 'bases')) { meet += 10; power += 10; }
  if (ctx.scoring && has(pitcher, 'vsPinch')) meet -= 8;
  if (ctx.loaded && has(pitcher, 'poise')) { meet -= 6; power -= 6; }
  if (ctx.inning <= 2 && has(batter, 'earlyBird')) { meet += 5; power += 5; }
  if (ctx.inning <= 2 && has(batter, 'coldStart')) { meet -= 5; power -= 5; }
  if (ctx.inning >= 7 && has(batter, 'grinder')) { meet += 5; power += 5; }
  if (ctx.inning >= 7 && has(batter, 'fade')) { meet -= 5; power -= 5; }
  if (ctx.trailing && has(batter, 'bigStage')) { meet += 4; power += 4; }
  if (ctx.trailing && has(batter, 'stagestruck')) { meet -= 4; power -= 4; }
  // 對左投手的加減——會左右開弓的人不受影響
  if (pitcher.throws === 'L' && !has(batter, 'switchHit')) {
    if (has(batter, 'vsLeft')) { meet += 6; power += 6; }
    if (has(batter, 'weakVsLeft')) { meet -= 6; power -= 6; }
  }

  // 1) 四壞
  let bb = 0.085 + (55 - (pitcher.abilities.control + dm.control)) * 0.0022 + om.eye;
  if (has(pitcher, 'walks')) bb += 0.035;
  if (has(pitcher, 'firstStrike')) bb -= 0.02;
  if (has(batter, 'eye')) bb += 0.03;
  const nPitches = () => 2 + Math.floor(rng() * 3);
  if (rng() < clamp(bb, 0.02, 0.28)) return { kind: 'bb', pitches: 5 + Math.floor(rng() * 3) };

  // 2) 三振
  let k = 0.135 + (stuff - meet) * 0.0045;
  if (has(pitcher, 'strikeout')) k += 0.04;
  if (has(pitcher, 'intimidator')) k += 0.03;
  if (has(batter, 'whiff')) k += 0.05;
  if (has(batter, 'average')) k -= 0.03;
  if (has(batter, 'patient')) k -= 0.025;
  if (rng() < clamp(k, 0.03, 0.5)) return { kind: 'k', pitches: 4 + Math.floor(rng() * 3) };

  // 3) 打進場內：是不是安打
  const p = nPitches();
  const def = defence + ctx.defForm + dm.defence;
  let hit = 0.366 + (meet - stuff) * 0.0032 - (def - 50) * 0.0020;
  if (has(batter, 'sprayHit')) hit += 0.02;
  if (has(pitcher, 'heavy')) hit -= 0.02;
  if (has(pitcher, 'light')) hit += 0.025;
  if (rng() >= clamp(hit, 0.12, 0.52)) {
    // 出局，但守備可能失誤
    const err = clamp(0.055 - (def - 50) * 0.0016, 0.008, 0.14);
    return rng() < err ? { kind: 'error', pitches: p } : { kind: OUT, pitches: p };
  }

  // 4) 幾壘打
  let hr = 0.035 + (power - 45) * 0.0028;
  if (has(batter, 'slugger')) hr += 0.02;
  if (has(pitcher, 'heavy')) hr -= 0.012;
  if (has(pitcher, 'light')) hr += 0.02;
  if (has(pitcher, 'changeSpeed')) hr -= 0.015;
  if (has(pitcher, 'homeRunProne')) hr += 0.02;
  if (rng() < clamp(hr, 0.004, 0.22)) return { kind: 'hr', pitches: p };
  // 外野手臂力夠強的話，長打會被擋下來變成一壘安打
  let extra = clamp(
    0.055 + (power - 45) * 0.0016 + (b.speed + om.speed - 45) * 0.0012 + om.extraBase
      - (ctx.defArm - 50) * 0.0010,
    0.02, 0.3,
  );
  if (has(pitcher, 'groundInduce')) extra -= 0.03;
  if (has(batter, 'speedster')) extra += 0.03;
  extra = clamp(extra, 0.02, 0.3);
  if (rng() < extra) {
    return rng() < 0.16 ? { kind: 'triple', pitches: p } : { kind: 'double', pitches: p };
  }
  return { kind: 'single', pitches: p };
}

// ── 記錄表 ──────────────────────────────────────────────

const newBatLine = (p, pos) => ({
  id: p.id, name: p.name, pos: positionById(pos)?.short || '',
  ab: 0, h: 0, hr: 0, rbi: 0, r: 0, bb: 0, k: 0, tb: 0,
});

const newPitLine = (p) => ({
  id: p.id, name: p.name, outs: 0, h: 0, r: 0, bb: 0, k: 0, pitches: 0,
});

// ── 主流程 ──────────────────────────────────────────────

/**
 * 打一場。teams 各自要有 { name, order, starter, bullpen }
 * 回傳完整的比賽紀錄。
 */
export function playMatch(home, away, rng = Math.random, { maxInnings = 12, mercy = false } = {}) {
  // 提前結束（コールドゲーム）：五局 10 分差、七局 7 分差。
  // 地區大賽和秋季大賽有這條，甲子園本戰沒有。
  const mercyOver = (a, h, inning) => {
    if (!mercy || inning < 5) return false;
    const diff = Math.abs(a - h);
    return (inning >= 7 && diff >= 7) || diff >= 10;
  };
  const side = (t) => ({
    name: t.name,
    order: t.order,
    idx: 0,
    pitcher: t.starter,
    bullpen: [...t.bullpen],
    defence: defenceRating(t.order),
    arm: armRating(t.order),
    errors: 0,
    mods: t.mods || baseMods(),
    // 每個人今天自己的手感——跟下面隊伍整體的 form 是分開的兩層
    conditions: t.conditions || new Map(),
    bat: new Map(t.order.map(({ player, position }) => [player.id, newBatLine(player, position)])),
    pit: new Map([[t.starter.id, newPitLine(t.starter)]]),
    runs: [],
    total: 0,
    // 今天的狀態。同一支隊伍每場都會有起伏，這是爆冷的來源
    form: (rng() - 0.5) * 16,
  });

  const A = side(away);
  const H = side(home);
  const plays = [];
  let called = 0;   // 幾局提前結束（0 = 打滿）

  for (let inning = 1; inning <= maxInnings; inning += 1) {
    // 十局開始用突破僵局制：一二壘有人、無人出局（照真實規則）
    const tiebreak = inning >= 10;
    for (const [off, def] of [[A, H], [H, A]]) {
      // 九局下已經領先就不用打了
      if (off === H && inning >= 9 && H.total > A.total) { H.runs.push(null); break; }
      const scored = halfInning(off, def, inning, plays, rng, tiebreak);
      off.runs.push(scored);
      off.total += scored;
    }
    if (inning >= 9 && A.total !== H.total) break;
    if (mercyOver(A.total, H.total, inning)) { called = inning; break; }
  }

  return {
    home: summarise(H, home),
    away: summarise(A, away),
    innings: Math.max(A.runs.length, H.runs.length),
    called,
    plays,
    winner: H.total > A.total ? 'home' : 'away',
  };
}

function halfInning(off, def, inning, plays, rng, tiebreak = false) {
  let outs = 0;
  let scored = 0;
  const bases = [null, null, null];   // 一二三壘上的人

  // 突破僵局制：把打線裡前兩棒放上一二壘
  if (tiebreak) {
    const n = off.order.length;
    bases[0] = off.order[(off.idx - 1 + n * 2) % n].player;
    bases[1] = off.order[(off.idx - 2 + n * 2) % n].player;
  }

  const scoreRunner = (p) => {
    scored += 1;
    const line = off.bat.get(p.id);
    if (line) line.r += 1;
  };

  while (outs < 3) {
    const { player: batter, position } = off.order[off.idx % off.order.length];
    off.idx += 1;

    // 換投：投球數超過太多就換人
    const pl = def.pit.get(def.pitcher.id);
    const limit = (70 + def.pitcher.abilities.stamina * 0.9) * def.mods.staminaMult;
    if (pl.pitches > limit && def.bullpen.length) {
      def.pitcher = def.bullpen.shift();
      if (!def.pit.has(def.pitcher.id)) def.pit.set(def.pitcher.id, newPitLine(def.pitcher));
    }
    const pit = def.pit.get(def.pitcher.id);

    const ctx = {
      scoring: !!(bases[1] || bases[2]),
      loaded: bases.every(Boolean),
      batForm: off.form,
      pitchForm: def.form,
      defForm: def.form,
      off: off.mods,
      def: def.mods,
      defArm: def.arm,
      inning,
      trailing: off.total < def.total,
      defTrailing: def.total < off.total,
      // 每個人今天自己的手感，跟上面隊伍整體的 form 分開算
      batCondition: off.conditions.get(batter.id) ?? 1,
      pitchCondition: def.conditions.get(def.pitcher.id) ?? 1,
    };
    const r = atBat(batter, def.pitcher, pit.pitches, def.defence, ctx, rng);
    pit.pitches += r.pitches;

    const bl = off.bat.get(batter.id);
    let rbi = 0;

    const advance = (n, batterToBase) => {
      for (let i = 2; i >= 0; i -= 1) {
        if (!bases[i]) continue;
        const to = i + n;
        if (to >= 3) { scoreRunner(bases[i]); rbi += 1; } else { bases[to] = bases[i]; }
        bases[i] = null;
      }
      if (batterToBase !== null) bases[batterToBase] = batter;
    };

    switch (r.kind) {
      case 'bb': {
        bl.bb += 1; pit.bb += 1;
        // 四壞只擠壘
        if (bases[0]) {
          if (bases[1]) {
            if (bases[2]) { scoreRunner(bases[2]); rbi += 1; }
            bases[2] = bases[1];
          }
          bases[1] = bases[0];
        }
        bases[0] = batter;
        break;
      }
      case 'k':
        bl.ab += 1; bl.k += 1; pit.k += 1; outs += 1;
        break;
      case OUT: {
        bl.ab += 1;
        // 有人在三壘、不到兩出局 → 高飛犧牲打
        if (bases[2] && outs < 2 && rng() < 0.36) {
          scoreRunner(bases[2]); bases[2] = null; rbi += 1;
        } else if (bases[0] && outs < 2
          && rng() < (has(batter, 'doublePlay') ? 0.22 : has(batter, 'groundBallSafe') ? 0.06 : 0.12)
            + off.mods.dp) {
          bases[0] = null; outs += 1;   // 雙殺
        }
        outs += 1;
        break;
      }
      case 'error':
        bl.ab += 1;
        def.errors += 1;
        advance(1, 0);
        break;
      case 'single': {
        bl.ab += 1; bl.h += 1; bl.tb += 1; pit.h += 1;
        // 防守方外野臂力強的話，跑者比較不敢多跑一個壘
        const takeExtra = clamp(0.42 + off.mods.advance - (def.arm - 50) * 0.0018, 0.15, 0.7);
        advance(rng() < takeExtra ? 2 : 1, 0);
        break;
      }
      case 'double': bl.ab += 1; bl.h += 1; bl.tb += 2; pit.h += 1; advance(2, 1); break;
      case 'triple': bl.ab += 1; bl.h += 1; bl.tb += 3; pit.h += 1; advance(3, 2); break;
      case 'hr': {
        bl.ab += 1; bl.h += 1; bl.hr += 1; bl.tb += 4; pit.h += 1;
        advance(3, null);
        scoreRunner(batter);
        rbi += 1;
        break;
      }
      default: break;
    }

    bl.rbi += rbi;
    if (rbi) pit.r += rbi;

    if (['hr', 'triple', 'double'].includes(r.kind) || (rbi >= 2)) {
      plays.push({
        inning, team: off.name, batter: batter.name, batterId: batter.id,
        kind: r.kind, rbi, pos: position,
      });
    }
    if (outs >= 3) break;
  }

  // 記投手的出局數
  const pit = def.pit.get(def.pitcher.id);
  pit.outs += Math.min(outs, 3);
  return scored;
}

function summarise(s, team) {
  // 直接從球員身上讀這一週的狀態（p.condition）——存檔要能 JSON
  // 序列化，所以換成單純的物件，不能直接存球員參考
  const conditions = {};
  [...team.order.map((o) => o.player), ...(team.bullpen || [])].forEach((p) => {
    if (p.condition) conditions[p.id] = { id: p.condition.id, label: p.condition.label };
  });
  return {
    name: s.name,
    total: s.total,
    runs: s.runs,
    hits: [...s.bat.values()].reduce((n, b) => n + b.h, 0),
    errors: s.errors,
    batters: [...s.bat.values()],
    pitchers: [...s.pit.values()],
    players: team.order.map((o) => o.player),
    conditions,
  };
}
