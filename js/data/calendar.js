// 賽程表生成
//
// 時間單位是「週」，但比賽的密度分兩種：
//   正式比賽 … 一週最多 3 場（GAMES_PER_WEEK）
//   練習賽   … 一週 1 場
//
// 這個差別是故意的。日本的規則是投手一週最多投 500 球，
// 所以沒有任何一個投手投得完一週三場 —— 你一定要養第二、第三個投手。
//
// kind: 'match' 比賽週 | 'training' 練習週 | 'transition' 過場週
// conditional: true 的週，輸掉之後會變成練習週（士氣會慢慢掉）

export const GAMES_PER_WEEK = 3;

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const TAIL = ['八強賽', '四強賽', '冠軍賽'];

/** 從「要贏幾場」算出每一輪的名字（例：6 → 第1〜3輪 + 八強・四強・冠軍） */
export function roundNames(wins) {
  if (wins <= TAIL.length) return TAIL.slice(TAIL.length - wins);
  const r = [];
  for (let i = 1; i <= wins - TAIL.length; i++) r.push(`第${i}輪`);
  return r.concat(TAIL);
}

// 甲子園有 49 個代表 → 要贏 6 場。春季甲子園 32 校 → 要贏 5 場。
export const KOSHIEN_WINS = 6;
export const SENBATSU_WINS = 5;

const AUTUMN_ROUNDS = ['第1輪', '四強賽', '冠軍賽'];

/** 把一個比賽階段折成好幾週 */
function matchPhase(phase, label, rounds, month, { alwaysPlayFirst = false } = {}) {
  return chunk(rounds, GAMES_PER_WEEK).map((games, i) => ({
    phase,
    event: `${label} ${games.length > 1 ? `${games[0]}〜${games.at(-1)}` : games[0]}`,
    month: typeof month === 'function' ? month(i) : month,
    kind: 'match',
    games,
    conditional: !(alwaysPlayFirst && i === 0),
    canPractice: false,
  }));
}

/**
 * 輸掉之後，這一週會變成練習週。
 * 變成練習週之後就可以打練習賽了 —— 這很重要，
 * 不然輸得早的隊伍會整整半年沒球可打，士氣一路掉到谷底沒救。
 */
export function toTrainingWeek(w) {
  return { ...w, kind: 'training', games: [], canPractice: true, eliminated: true };
}

/** 生成一整年的賽程 */
export function buildYear(wins) {
  const w = [];
  const add = (x) => w.push({ week: w.length + 1, games: [], canPractice: false, ...x });
  // 所有練習週都可以改成打練習賽，這是玩家自己選的
  const plain = (phase, event, month, kind) =>
    add({ phase, event, month, kind, conditional: false, canPractice: kind === 'training' });

  // ── 春天 ────────────────────────────────────────────
  // draft: true 的週會跳出「傳統三選一」，那是 roguelike 的核心選擇
  plain('newterm', '開學 ／ 升上新年級', '4月初', 'transition');
  w[w.length - 1].draft = true;
  plain('newterm', '新生入學（新隊員加入）', '4月中', 'transition');
  plain('newterm', '新生測驗 ／ 決定守備位置', '4月底', 'training');

  // 春天這三週預設是練習賽（保底，讓新手進夏天時士氣是滿的），
  // 但玩家想改成純練習也可以。
  ['5月初', '5月底', '6月初'].forEach((month, i) =>
    add({
      phase: 'practice',
      event: `練習賽 ${'①②③'[i]}${i === 1 ? '（順便觀察對手）' : ''}`,
      month,
      kind: 'training',
      games: ['練習賽'],
      conditional: false,
      canPractice: true,
      defaultPractice: true,
    }));

  plain('pretourn', '決定 20 人名單 ／ 抽籤', '6月底', 'transition');
  plain('pretourn', '最後調整', '6月底', 'training');

  // ── 夏天 ────────────────────────────────────────────
  matchPhase('regional', '地區大賽', roundNames(wins), (i) => (i === 0 ? '7月初' : '7月底'), {
    alwaysPlayFirst: true,
  }).forEach(add);

  matchPhase('koshien', '甲子園', roundNames(KOSHIEN_WINS), (i) => (i === 0 ? '8月初' : '8月底'))
    .forEach(add);

  // ── 秋天 ────────────────────────────────────────────
  // 這一週三年級退隊。他們還在學校（三月才畢業），但不再上場，
  // 所以名單上要把他們拿掉。
  plain('handover', '三年級退隊 ／ 組新隊伍', '8月底', 'transition');
  w[w.length - 1].retireSeniors = true;
  w[w.length - 1].draft = true;
  plain('handover', '選新隊長 ／ 重排守備位置', '9月初', 'transition');

  matchPhase('autumn', '秋季縣大賽', AUTUMN_ROUNDS, '9月底', { alwaysPlayFirst: true }).forEach(add);
  matchPhase('autumnArea', '秋季地區大賽', AUTUMN_ROUNDS, '10月中').forEach(add);

  // ── 冬天 ────────────────────────────────────────────
  [
    ['職棒選秀 ／ 開始招生', '10月底'],
    ['去看國中生', '11月'],
    ['冬季集訓 ①', '12月'],
    ['冬季集訓 ②', '12月'],
    ['最後招生談判', '1月'],
    ['確定新生（招生截止）', '2月'],
  ].forEach(([event, month]) => plain('winter', event, month, 'training'));
  // 招生視窗的頭尾。第一週生出名單，最後一週結算
  w[w.length - 6].scoutOpen = true;
  w[w.length - 1].scoutClose = true;

  // ── 春天（春季甲子園） ──────────────────────────────
  plain('senbatsu', '春季甲子園選拔公布 ／ 畢業典禮', '3月初', 'transition');
  matchPhase('senbatsu', '春季甲子園', roundNames(SENBATSU_WINS), '3月底').forEach(add);

  return w;
}

/**
 * 生成一整局（三年）的賽程。
 *   第1年：六月上任 → 跳過春天那 6 週
 *   第3年：夏天甲子園冠軍賽打完就結束
 */
export function buildRun(wins) {
  const full = buildYear(wins);
  const summerEnd = full.findIndex((x) => x.phase === 'handover');

  const years = [
    full.slice(6).map((x) => ({ ...x })),
    full.map((x) => ({ ...x })),
    full.slice(0, summerEnd).map((x) => ({ ...x })),
  ];

  let abs = 0;
  years.forEach((year, i) => {
    year.forEach((x) => {
      x.year = i + 1;
      x.abs = ++abs;
    });
  });

  return years;
}

export function runSummary(wins) {
  const years = buildRun(wins);
  const flat = years.flat();
  const count = (k) => flat.filter((x) => x.kind === k).length;
  const officialGames = flat
    .filter((x) => x.kind === 'match')
    .reduce((n, x) => n + x.games.length, 0);

  return {
    years: years.map((y) => y.length),
    total: flat.length,
    match: count('match'),
    training: count('training'),
    transition: count('transition'),
    conditional: flat.filter((x) => x.conditional).length,
    officialGames,
    // 預設就會打的練習賽（春天那三週）
    practiceGames: flat.filter((x) => x.defaultPractice).length,
    // 可以拿來打練習賽的週數（全部輸掉的話還會更多）
    practiceSlots: flat.filter((x) => x.canPractice).length,
    practiceSlotsIfEliminated: flat.filter((x) => x.canPractice || x.conditional).length,
  };
}
