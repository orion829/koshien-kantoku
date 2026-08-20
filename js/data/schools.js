// 對手學校的名字
//
// 強隊會用比較「名門」的字，弱隊用比較樸素的字，
// 這樣看到對手名字就大概知道要面對什麼。

const NOBLE = [
  '帝京', '明王', '聖光', '天龍', '大成', '東邦', '皇學', '龍谷', '光星', '智辯',
  '常勝', '櫻花', '金剛', '鳳凰', '白龍', '青雲', '大鷲', '神威',
];

const PLAIN = [
  '青嶺', '白鷺', '東雲', '海洋', '鶴翔', '明星', '聖陵', '南陽', '北稜', '光陵',
  '若葉', '櫻台', '綠丘', '紅葉', '天神', '蒼空', '常盤', '旭丘', '舞鶴', '霞丘',
  '松風', '朝日', '清水', '大原', '芝浦', '長峰', '瀨戶', '川崎',
];

const NOBLE_SUFFIX = ['學園', '學院', '高中', '大附中', '第一高中'];
const PLAIN_SUFFIX = ['高中', '工業高中', '商業高中', '農業高中', '東高中', '西高中', '北高中', '南高中'];

const pick = (list, rng) => list[Math.floor(rng() * list.length)];

/**
 * 依對手強度取一個學校名字。
 * strength 大約 30〜90。
 */
export function randomOpponentName(strength, rng = Math.random) {
  const noble = rng() < (strength - 35) / 55;   // 越強越可能是名門
  return noble
    ? pick(NOBLE, rng) + pick(NOBLE_SUFFIX, rng)
    : pick(PLAIN, rng) + pick(PLAIN_SUFFIX, rng);
}
