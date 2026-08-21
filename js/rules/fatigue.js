// 疲勞
//
// 跟受傷不一樣：不會讓人直接下場，是「操過頭」慢慢累出來的。
// 疲勞高的時候比賽表現會打折、也更容易受傷；每週會自動消一點，
// 選「休息」消更多。投手投越多球累越快，野手也會累，只是慢一點。

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const FATIGUE_WEEKLY_DECAY = 5;
export const FATIGUE_REST_DECAY = 14;

/** 打完一場比賽累積的疲勞。投手看投球數，野手是固定的量 */
export function addMatchFatigue(player, pitches = 0) {
  const gain = pitches > 0 ? pitches * 0.06 : 3;
  player.fatigue = clamp((player.fatigue || 0) + gain, 0, 100);
}

/** 每週恢復一點；選「休息」的那一週恢復更多 */
export function decayFatigue(players, resting = false) {
  const amount = resting ? FATIGUE_REST_DECAY : FATIGUE_WEEKLY_DECAY;
  players.forEach((p) => { p.fatigue = clamp((p.fatigue || 0) - amount, 0, 100); });
}

/**
 * 疲勞對比賽表現的影響：換成一個能力倍率。
 * 50 分以下幾乎沒感覺，50〜100 開始線性掉，最多掉 15%。
 */
export function fatiguePenalty(fatigue) {
  return 1 - clamp(((fatigue || 0) - 40) / 60, 0, 1) * 0.15;
}

/** 疲勞對受傷機率的加成，跟投球數的加成用乘的 */
export function fatigueInjuryMult(fatigue) {
  return 1 + clamp(((fatigue || 0) - 50) / 50, 0, 1) * 0.8;
}

/** 給畫面用：疲勞分幾級 */
export function fatigueLabel(fatigue) {
  const f = fatigue || 0;
  if (f >= 75) return '累壞了';
  if (f >= 50) return '有點累';
  if (f >= 25) return '還好';
  return '很有精神';
}

/**
 * 比賽開打前，疲勞的人能力暫時打折——只是「模擬這場比賽」用的，
 * 打完要馬上用 restoreAbilities 換回來，不然疲勞會永久刻進能力值裡
 * （成長、生涯數據都是在能力值換回來之後才算的，順序很重要）。
 */
export function applyFatiguePenalty(players) {
  const snapshot = new Map();
  players.forEach((p) => {
    const mult = fatiguePenalty(p.fatigue);
    if (mult >= 0.999) return;
    snapshot.set(p.id, { ...p.abilities });
    Object.keys(p.abilities).forEach((k) => {
      p.abilities[k] = Math.round(p.abilities[k] * mult);
    });
  });
  return snapshot;
}

/** 把 applyFatiguePenalty 暫時打的折換回來 */
export function restoreAbilities(players, snapshot) {
  players.forEach((p) => {
    const orig = snapshot.get(p.id);
    if (orig) p.abilities = orig;
  });
}
