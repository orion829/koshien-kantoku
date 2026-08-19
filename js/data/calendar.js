// 年間スケジュール定義
// 設計値: 通常年 = 27 + necessaryWins 週（中堅県 wins=6 なら 33週）
//   新学期3 / 練習試合3 / 予選直前2 / 地方大会=wins / 甲子園5 / 世代交代2
//   / 秋季県大会3 / 冬期6 / センバツ3
//
// kind: 'match' 試合週 | 'training' 育成週 | 'transition' 過渡週
// conditional: true の週は敗退時に育成週へ転換される（士気減衰ルールの対象）

const REGIONAL_TAIL = ['準々決勝', '準決勝', '決勝'];

function regionalRounds(wins) {
  const early = wins - REGIONAL_TAIL.length;
  const rounds = [];
  for (let i = 1; i <= early; i++) rounds.push(`${i}回戦`);
  return rounds.concat(REGIONAL_TAIL);
}

const KOSHIEN_ROUNDS = [
  ['1回戦', '8月上'],
  ['2回戦', '8月中'],
  ['3回戦（ベスト16）', '8月中'],
  ['準々決勝', '8月下'],
  ['準決勝 → 決勝 連戦', '8月下'],
];

const AUTUMN_ROUNDS = [
  ['秋季県大会 初戦', '9月下'],
  ['秋季県大会 準決勝', '10月上'],
  ['秋季県大会 決勝（上位＝センバツ当確）', '10月中'],
];

const WINTER_WEEKS = [
  ['ドラフト会議 ／ スカウト解禁', '10月下'],
  ['中学視察', '11月'],
  ['冬合宿 ①', '12月'],
  ['冬合宿 ②', '12月'],
  ['スカウト最終交渉', '1月'],
  ['新入生確定（スカウト締切）', '2月'],
];

/** 1年分（27 + wins 週）のスケジュールを生成する */
export function buildYear(wins) {
  const w = [];
  const push = (phase, event, month, kind, conditional = false) =>
    w.push({ week: w.length + 1, phase, event, month, kind, conditional });

  push('newterm',  '始業式 ／ 学年アップ',          '4月上', 'transition');
  push('newterm',  '入学式（新入生入部）',          '4月中', 'transition');
  push('newterm',  '新入生の適性判定 ／ ポジション決め', '4月下', 'training');

  push('practice', '練習試合 ①',                    '5月上', 'training');
  push('practice', '練習試合 ②（他校偵察）',        '5月下', 'training');
  push('practice', '練習試合 ③ ／ 中間評価',        '6月上', 'training');

  push('pretourn', '登録20名決定 ／ 抽選会',        '6月下', 'transition');
  push('pretourn', '最終調整',                      '6月下', 'training');

  const rounds = regionalRounds(wins);
  rounds.forEach((r, i) => {
    const month = i < rounds.length / 2 ? '7月上' : '7月下';
    push('regional', `地方大会 ${r}`, month, 'match', i > 0);
  });

  KOSHIEN_ROUNDS.forEach(([r, month]) =>
    push('koshien', `甲子園 ${r}`, month, 'match', true));

  push('handover', '3年生引退 ／ 新チーム発足', '8月下', 'transition');
  push('handover', '新主将決定 ／ ポジション再編', '9月上', 'transition');

  AUTUMN_ROUNDS.forEach(([r, month], i) =>
    push('autumn', r, month, 'match', i > 0));

  WINTER_WEEKS.forEach(([e, month]) => push('winter', e, month, 'training'));

  push('senbatsu', '卒業式 ／ センバツ抽選',       '3月上', 'transition');
  push('senbatsu', 'センバツ 初戦・2回戦',         '3月下', 'match', true);
  push('senbatsu', 'センバツ 準決勝・決勝',        '3月下', 'match', true);

  return w;
}

/**
 * 3年分のラン全体を生成する。
 *  第1年: 6月就任 → 春の6週を飛ばす
 *  第3年: 夏の甲子園決勝で打ち切り
 */
export function buildRun(wins) {
  const full = buildYear(wins);
  const summerEnd = 8 + wins + 5; // 予選直前まで8週 + 地方大会 + 甲子園

  const years = [
    full.slice(6).map((x) => ({ ...x })),            // 第1年: W7以降
    full.map((x) => ({ ...x })),                     // 第2年: 通年
    full.slice(0, summerEnd).map((x) => ({ ...x })), // 第3年: 甲子園まで
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
  return {
    years: years.map((y) => y.length),
    total: flat.length,
    match: count('match'),
    training: count('training'),
    transition: count('transition'),
    conditional: flat.filter((x) => x.conditional).length,
  };
}
