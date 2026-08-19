// 都道府県データ
// 基礎数値は第108回全国高等学校野球選手権大会（2026年）の地方大会参加チーム数。
// 出典: 日本高等学校野球連盟 https://www.jhbf.or.jp/topics/detail/593
// 全49地区・合計3,360チーム（北海道と東京は2地区に分割）。
//
// necessaryWins = ceil(log2(teams))  — シード無しの単純トーナメント想定。
// 地方大会の週数はこの necessaryWins に等しい（1週＝1試合）。

export const REGIONS = [
  { id: 'hokkaido',     name: '北海道' },
  { id: 'tohoku',       name: '東北'   },
  { id: 'kanto',        name: '関東'   },
  { id: 'hokushinetsu', name: '北信越' },
  { id: 'tokai',        name: '東海'   },
  { id: 'kinki',        name: '近畿'   },
  { id: 'chugoku',      name: '中国'   },
  { id: 'shikoku',      name: '四国'   },
  { id: 'kyushu',       name: '九州'   },
];

// [id, 表示名, 地方id, 参加チーム数]
const RAW = [
  ['kita-hokkaido',  '北北海道', 'hokkaido',      68],
  ['minami-hokkaido','南北海道', 'hokkaido',      96],

  ['aomori',   '青森',   'tohoku', 45],
  ['iwate',    '岩手',   'tohoku', 49],
  ['miyagi',   '宮城',   'tohoku', 55],
  ['akita',    '秋田',   'tohoku', 35],
  ['yamagata', '山形',   'tohoku', 37],
  ['fukushima','福島',   'tohoku', 62],

  ['ibaraki',   '茨城',   'kanto', 84],
  ['tochigi',   '栃木',   'kanto', 50],
  ['gunma',     '群馬',   'kanto', 59],
  ['saitama',   '埼玉',   'kanto', 139],
  ['chiba',     '千葉',   'kanto', 148],
  ['higashi-tokyo','東東京','kanto', 126],
  ['nishi-tokyo', '西東京', 'kanto', 118],
  ['kanagawa',  '神奈川', 'kanto', 172],
  ['yamanashi', '山梨',   'kanto', 32],

  ['niigata', '新潟', 'hokushinetsu', 66],
  ['toyama',  '富山', 'hokushinetsu', 39],
  ['ishikawa','石川', 'hokushinetsu', 42],
  ['fukui',   '福井', 'hokushinetsu', 27],
  ['nagano',  '長野', 'hokushinetsu', 69],

  ['gifu',     '岐阜',   'tokai', 62],
  ['shizuoka', '静岡',   'tokai', 106],
  ['aichi',    '愛知',   'tokai', 174],
  ['mie',      '三重',   'tokai', 57],

  ['shiga',    '滋賀',   'kinki', 47],
  ['kyoto',    '京都',   'kinki', 71],
  ['osaka',    '大阪',   'kinki', 153],
  ['hyogo',    '兵庫',   'kinki', 149],
  ['nara',     '奈良',   'kinki', 33],
  ['wakayama', '和歌山', 'kinki', 36],

  ['tottori',   '鳥取', 'chugoku', 21],
  ['shimane',   '島根', 'chugoku', 37],
  ['okayama',   '岡山', 'chugoku', 54],
  ['hiroshima', '広島', 'chugoku', 85],
  ['yamaguchi', '山口', 'chugoku', 50],

  ['tokushima', '徳島', 'shikoku', 29],
  ['kagawa',    '香川', 'shikoku', 35],
  ['ehime',     '愛媛', 'shikoku', 46],
  ['kochi',     '高知', 'shikoku', 24],

  ['fukuoka',   '福岡',   'kyushu', 131],
  ['saga',      '佐賀',   'kyushu', 36],
  ['nagasaki',  '長崎',   'kyushu', 47],
  ['kumamoto',  '熊本',   'kyushu', 54],
  ['oita',      '大分',   'kyushu', 41],
  ['miyazaki',  '宮崎',   'kyushu', 46],
  ['kagoshima', '鹿児島', 'kyushu', 62],
  ['okinawa',   '沖縄',   'kyushu', 56],
];

const TIERS = {
  5: { tierId: 'sparse',    label: '過疎県', stars: 1, scoutPool: 1 },
  6: { tierId: 'mid',       label: '中堅県', stars: 2, scoutPool: 2 },
  7: { tierId: 'strong',    label: '強豪県', stars: 3, scoutPool: 3 },
  8: { tierId: 'deathzone', label: '激戦区', stars: 4, scoutPool: 4 },
};

function necessaryWins(teams) {
  return Math.ceil(Math.log2(teams));
}

export const PREFECTURES = RAW.map(([id, name, region, teams]) => {
  const wins = necessaryWins(teams);
  const tier = TIERS[wins];
  return { id, name, region, teams, wins, ...tier };
});

export const byId = (id) => PREFECTURES.find((p) => p.id === id) || null;

export const byRegion = (regionId) =>
  PREFECTURES.filter((p) => p.region === regionId);

export const TOTAL_TEAMS = PREFECTURES.reduce((n, p) => n + p.teams, 0);
export const REPRESENTATIVES = PREFECTURES.length; // 49
