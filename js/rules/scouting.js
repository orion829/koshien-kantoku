// 招生
//
// 冬天的六週可以去找國中生。每去看一次，對方對你的學校就多一分好感。
// 好感度到 60 就會來，時間到還不夠就跑掉了。
//
// 最重要的一條：**贏球會讓招生變容易**。
// 打進甲子園的學校，好學生自己會來；連地區大賽都出不去的，
// 只能靠一次又一次去拜訪。這就是贏球的長期回報。

import { createPlayer } from './player.js';
import { randomPersonName } from '../data/names.js';
import { POSITIONS, GROWTH_TYPES } from '../data/abilities.js';

/** 好感度到這裡就會入學 */
export const JOIN_THRESHOLD = 60;

/** 各種成績能換到多少注目度 */
const FAME = {
  koshienChampion: 30,
  koshienEntry: 14,
  senbatsuChampion: 20,
  senbatsuEntry: 8,
  autumnAreaChampion: 5,
  regionalFinal: 4,
};

/**
 * 算出目前的注目度。看的是「到目前為止」的成績。
 * 這是贏球最重要的長期回報。
 */
export function fameOf(game) {
  let fame = 0;
  game.progress.forEach((p) => {
    if (p.regional?.champion) fame += FAME.koshienEntry;
    else if (p.regional?.lastRound === '冠軍賽') fame += FAME.regionalFinal;
    if (p.koshien?.champion) fame += FAME.koshienChampion;
    if (p.autumnArea?.champion) fame += FAME.autumnAreaChampion;
    if (p.senbatsu) fame += FAME.senbatsuEntry;
    if (p.senbatsu?.champion) fame += FAME.senbatsuChampion;
  });
  return fame;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/** 名門學校比較容易找到好學生 */
function rollTalent(scoutPool, fame, rng) {
  const bonus = scoutPool * 0.35 + fame / 45;
  const r = rng() * 5 + bonus;
  return clamp(Math.round(r), 1, 5);
}

/**
 * 生出這一年的招生名單。
 * 隊上缺什麼位置，名單就會多出現那個位置的人。
 */
export function generateCandidates(game, rng = Math.random) {
  const fame = fameOf(game);
  const n = 5 + Math.floor(rng() * 3) + (fame > 25 ? 1 : 0);

  // 隊上缺的位置優先出現
  const have = {};
  game.team.players.filter((p) => !p.retired).forEach((p) => {
    have[p.position] = (have[p.position] || 0) + 1;
  });
  const needed = POSITIONS
    .map((p) => p.id)
    .sort((a, b) => (have[a] || 0) - (have[b] || 0));

  return Array.from({ length: n }, (_, i) => {
    const position = i < 3 ? needed[i] : pick(POSITIONS, rng).id;
    const talent = rollTalent(game.difficulty.scoutPool, fame, rng);
    const growthType = ['early', 'normal', 'late'][Math.floor(rng() * 3)];

    // 起始好感度：名門吃香，天才難追
    const interest = clamp(
      Math.round(18 + fame * 1.4 - (talent - 2) * 12 + rng() * 10),
      0, 55,
    );

    return {
      id: `c${Math.floor(rng() * 1e9).toString(36)}`,
      name: randomPersonName(rng),
      position,
      talent,
      growthType,
      interest,
      visits: 0,
      known: false,      // 去看過才知道他的成長期
    };
  });
}

/** 去看一個人。回傳這次加了多少好感度 */
export function visitCandidate(candidate, rng = Math.random) {
  // 天才比較難打動
  const gain = Math.round(26 - candidate.talent * 2.5 + rng() * 12);
  candidate.interest = Math.min(100, candidate.interest + gain);
  candidate.visits += 1;
  candidate.known = true;
  return gain;
}

/**
 * 招生截止。好感度夠的會來，不夠的就跑掉。
 * 回傳 { joined 新生, missed 跑掉的人 }
 */
export function resolveScouting(candidates, rng = Math.random) {
  const joined = [];
  const missed = [];

  candidates.forEach((c) => {
    if (c.interest >= JOIN_THRESHOLD) {
      joined.push(createPlayer({
        gradeYear: 1,
        talent: c.talent,
        position: c.position,
        name: c.name,
        growthType: c.growthType,
        rng,
      }));
    } else {
      missed.push({ name: c.name, talent: c.talent, interest: c.interest });
    }
  });

  return { joined, missed };
}

/** 給畫面用的說明文字 */
export function candidateHint(c) {
  const left = JOIN_THRESHOLD - c.interest;
  if (left <= 0) return '確定會來';
  if (left <= 25) return '再去一次就穩了';
  if (left <= 50) return '還要去兩次';
  return '很難挖';
}

export const growthName = (id) => GROWTH_TYPES[id]?.name || '普通';
