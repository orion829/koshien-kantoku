// 士氣與練習效率
//
// 隊伍離上一場正式比賽越久，就越鬆散，練習效率越差。
// 每練習一週，計時器就會往前走一格——士氣會因為練習週而下降，
// 不是只有等著才會掉。打一場練習賽可以把計時器往回撥 4 週。
//
// 為什麼要有這條規則：
//   輸掉的比賽週會變成練習週，等於「輸了可以多練」。
//   如果多出來的練習週效率不打折，故意輸球就會變成最強打法。
//   士氣衰減讓「輸掉換到的時間」大約只值 8 成，這樣兩種打法才有得比。

/** 打一場練習賽，計時器往回撥幾週 */
export const PRACTICE_REWIND = 4;

/**
 * 練習賽最多只能把計時器拉回到這個數字，不能歸零。
 * 只有「正式比賽」才能真的歸零。
 *
 * 為什麼要有這條：如果練習賽能歸零，「練4打1」就可以永遠維持 100% 效率，
 * 士氣等於沒有壓力。有了下限之後，被淘汰的隊伍最多只能維持七成左右，
 * 還在打比賽的隊伍才有 100%。贏球本身就變成一種獎勵。
 */
export const PRACTICE_FLOOR = 2;

/** 練習賽本身不產生練習成果（那一週拿去打球了） */
export const PRACTICE_TRAINING_VALUE = 0;

const TIERS = [
  { under: 3, rate: 1.0, label: '狀態很好' },
  { under: 6, rate: 0.75, label: '有點鬆散' },
  { under: 10, rate: 0.5, label: '散掉了' },
  { under: Infinity, rate: 0.35, label: '完全沒心練' },
];

const tierOf = (weeksSinceMatch) => TIERS.find((t) => weeksSinceMatch < t.under);

/** 這一週的練習效率（1.0 = 全滿） */
export function efficiency(weeksSinceMatch) {
  return tierOf(weeksSinceMatch).rate;
}

/** 給玩家看的狀態文字 */
export function moraleLabel(weeksSinceMatch) {
  return tierOf(weeksSinceMatch).label;
}

/**
 * 過完一週之後，計時器變成多少。
 * action: 'match' 打正式比賽 | 'practice' 打練習賽 | 'train' 練習 | 'rest' 其他
 */
export function advance(weeksSinceMatch, action) {
  if (action === 'match') return 0;
  if (action === 'practice') {
    return Math.max(PRACTICE_FLOOR, weeksSinceMatch - PRACTICE_REWIND);
  }
  return weeksSinceMatch + 1;
}

/** 這一週實際拿到多少練習成果（1.0 = 一週的滿額練習） */
export function trainingYield(weeksSinceMatch, action) {
  if (action === 'practice') return PRACTICE_TRAINING_VALUE;
  if (action === 'train') return efficiency(weeksSinceMatch);
  return 0;
}

/**
 * 跑一串動作，算出總共拿到多少練習成果。
 * 用來驗證平衡：回傳 { total, weeks, average }
 */
export function simulate(actions, startCounter = 0) {
  let c = startCounter;
  let total = 0;
  for (const a of actions) {
    total += trainingYield(c, a);
    c = advance(c, a);
  }
  return {
    total: Number(total.toFixed(4)),
    weeks: actions.length,
    average: actions.length ? Number((total / actions.length).toFixed(4)) : 0,
    endCounter: c,
  };
}
