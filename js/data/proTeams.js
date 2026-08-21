// 職棒球隊的名字（12 隊，比照日職的規模）
//
// 全部是自己發明的名字，跟現實中任何一支球隊都無關——
// 這個專案裡的學校、對手學校也都是這樣（見 schools.js）。

const PRO_TEAMS = [
  '東京雷鳥', '橫濱蒼狼', '仙台隼人', '埼玉疾風', '千葉怒濤', '北海道白熊',
  '大阪金剛', '名古屋赤鬼', '廣島烈火', '福岡飛魚', '京都紫電', '神戶碧海',
];

/** 畢業生被職棒選走時，隨機分配一支球隊 */
export function randomProTeam(rng = Math.random) {
  return PRO_TEAMS[Math.floor(rng() * PRO_TEAMS.length)];
}

export { PRO_TEAMS };
