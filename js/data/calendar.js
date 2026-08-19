// 年間スケジュール定義
//
// 時間単位は「週」。ただし試合の密度は種別で異なる:
//   公式戦   … 1週に最大3試合（GAMES_PER_WEEK）
//   練習試合 … 1週に1試合
//
// この密度差が投手運用の制約を生む。高野連の投球数制限は「1週間500球」なので、
// 公式戦週に3試合を投げ切れる投手は存在しない ＝ 複数投手の育成が必須になる。
//
// kind: 'match' 試合週 | 'training' 育成週 | 'transition' 過渡週
// conditional: true の週は敗退時に育成週へ転換される（士気減衰ルールの対象）

export const GAMES_PER_WEEK = 3;

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const TAIL = ['準々決勝', '準決勝', '決勝'];

/** 必要勝利数から回戦名の配列を作る（例: 6 → 1〜3回戦 + 準々・準決・決勝） */
export function roundNames(wins) {
  if (wins <= TAIL.length) return TAIL.slice(TAIL.length - wins);
  const r = [];
  for (let i = 1; i <= wins - TAIL.length; i++) r.push(`${i}回戦`);
  return r.concat(TAIL);
}

// 甲子園は49代表 → ceil(log2(49)) = 6勝。センバツは32校 → 5勝。
export const KOSHIEN_WINS = 6;
export const SENBATSU_WINS = 5;

const AUTUMN_ROUNDS = ['初戦', '準決勝', '決勝'];

/** 公式戦フェーズを週へ畳み込む */
function matchPhase(phase, label, rounds, month, { alwaysPlayFirst = false } = {}) {
  return chunk(rounds, GAMES_PER_WEEK).map((games, i) => ({
    phase,
    event: `${label} ${games.length > 1 ? `${games[0]}〜${games.at(-1)}` : games[0]}`,
    month: typeof month === 'function' ? month(i) : month,
    kind: 'match',
    games,
    conditional: !(alwaysPlayFirst && i === 0),
  }));
}

/** 1年分のスケジュールを生成する */
export function buildYear(wins) {
  const w = [];
  const add = (x) => w.push({ week: w.length + 1, games: [], ...x });
  const plain = (phase, event, month, kind) => add({ phase, event, month, kind, conditional: false });

  // ── 春 ──────────────────────────────────────────────
  plain('newterm', '始業式 ／ 学年アップ', '4月上', 'transition');
  plain('newterm', '入学式（新入生入部）', '4月中', 'transition');
  plain('newterm', '新入生の適性判定 ／ ポジション決め', '4月下', 'training');

  ['5月上', '5月下', '6月上'].forEach((month, i) =>
    add({
      phase: 'practice',
      event: `練習試合 ${'①②③'[i]}${i === 1 ? '（他校偵察）' : ''}`,
      month,
      kind: 'training',
      games: ['練習試合'],
      conditional: false,
    }));

  plain('pretourn', '登録20名決定 ／ 抽選会', '6月下', 'transition');
  plain('pretourn', '最終調整', '6月下', 'training');

  // ── 夏 ──────────────────────────────────────────────
  matchPhase('regional', '地方大会', roundNames(wins), (i) => (i === 0 ? '7月上' : '7月下'), {
    alwaysPlayFirst: true,
  }).forEach(add);

  matchPhase('koshien', '甲子園', roundNames(KOSHIEN_WINS), (i) => (i === 0 ? '8月上' : '8月下'))
    .forEach(add);

  // ── 秋 ──────────────────────────────────────────────
  plain('handover', '3年生引退 ／ 新チーム発足', '8月下', 'transition');
  plain('handover', '新主将決定 ／ ポジション再編', '9月上', 'transition');

  matchPhase('autumn', '秋季県大会', AUTUMN_ROUNDS, '9月下', { alwaysPlayFirst: true }).forEach(add);
  matchPhase('autumnArea', '秋季地区大会', AUTUMN_ROUNDS, '10月中').forEach(add);

  // ── 冬 ──────────────────────────────────────────────
  [
    ['ドラフト会議 ／ スカウト解禁', '10月下'],
    ['中学視察', '11月'],
    ['冬合宿 ①', '12月'],
    ['冬合宿 ②', '12月'],
    ['スカウト最終交渉', '1月'],
    ['新入生確定（スカウト締切）', '2月'],
  ].forEach(([event, month]) => plain('winter', event, month, 'training'));

  // ── 春（センバツ） ──────────────────────────────────
  plain('senbatsu', 'センバツ選考発表 ／ 卒業式', '3月上', 'transition');
  matchPhase('senbatsu', 'センバツ', roundNames(SENBATSU_WINS), '3月下').forEach(add);

  return w;
}

/**
 * 3年分のラン全体を生成する。
 *   第1年: 6月就任 → 春の6週を飛ばす
 *   第3年: 夏の甲子園決勝で打ち切り
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
    practiceGames: flat.filter((x) => x.phase === 'practice').length,
  };
}
