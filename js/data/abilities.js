// 球員能力的定義
//
// 所有能力都用 0〜100 的數字存，顯示的時候換成 S〜G 的字母。
// 這套對照跟實況野球現在用的一樣：每 10 分一級，G 是 30 分以下全包。

export const GRADES = [
  { min: 90, letter: 'S' },
  { min: 80, letter: 'A' },
  { min: 70, letter: 'B' },
  { min: 60, letter: 'C' },
  { min: 50, letter: 'D' },
  { min: 40, letter: 'E' },
  { min: 30, letter: 'F' },
  { min: 0, letter: 'G' },
];

/** 高中生的能力上限。100 是職業等級，高中生碰不到 */
export const MAX_ABILITY = 90;

/** 數字 → 字母 */
export function grade(value) {
  return GRADES.find((g) => value >= g.min).letter;
}

/** 打者能力（6 項） */
export const BATTER_STATS = [
  { id: 'meet', name: '打擊', desc: '打得到球，影響打擊率' },
  { id: 'power', name: '力量', desc: '打得遠，影響全壘打' },
  { id: 'speed', name: '速度', desc: '跑壘、盜壘、外野守備範圍' },
  { id: 'arm', name: '臂力', desc: '傳球的力道' },
  { id: 'field', name: '守備', desc: '守備範圍' },
  { id: 'catch', name: '接球', desc: '不失誤' },
];

/** 投手能力（4 項） */
export const PITCHER_STATS = [
  { id: 'velocity', name: '球速', desc: '顯示成 km/h' },
  { id: 'control', name: '控球', desc: '不投壞球' },
  { id: 'stamina', name: '耐力', desc: '能投幾球' },
  { id: 'breaking', name: '變化球', desc: '球會變化的程度' },
];

/**
 * 球速換算成 km/h。對照真實的高中球速：
 *   G 123　E 130　C 139　B 143　A 147　S 150
 * 甲子園大部分先發是 135〜145，能飆到 150 的一年也沒幾個。
 */
export const velocityKmh = (value) => Math.round(110 + value * 0.44);

/** 守備位置。order 是記分板上的守備位置編號 */
export const POSITIONS = [
  { id: 'P', name: '投手', short: '投', order: 1 },
  { id: 'C', name: '捕手', short: '捕', order: 2 },
  { id: '1B', name: '一壘手', short: '一', order: 3 },
  { id: '2B', name: '二壘手', short: '二', order: 4 },
  { id: '3B', name: '三壘手', short: '三', order: 5 },
  { id: 'SS', name: '游擊手', short: '游', order: 6 },
  // 外野手在畫面上不特別分左中右——高中棒球本來就沒分得那麼細，
  // 內部還是有 LF/CF/RF 三個獨立位置（守備適性、對戰計算都還在用），
  // 只是顯示的縮寫統一成「外」
  { id: 'LF', name: '外野手', short: '外', order: 7 },
  { id: 'CF', name: '外野手', short: '外', order: 8 },
  { id: 'RF', name: '外野手', short: '外', order: 9 },
];

export const positionById = (id) => POSITIONS.find((p) => p.id === id);

/**
 * 守備適性造成的折扣。
 * 實況野球的規則：完全沒適性大概掉五成，有副位置適性掉兩成，適性滿的不掉。
 * 我們用 A〜G 平滑對應。
 */
export const APTITUDE_PENALTY = {
  S: 1.0, A: 1.0, B: 0.92, C: 0.84, D: 0.76, E: 0.68, F: 0.6, G: 0.5,
};

/**
 * 每個位置「還能守哪些位置」，由近到遠排。
 * 排越前面的，適性越好。
 *
 * 例如游擊手：二壘最接近（B），再來三壘（B〜C），中外野也還行（C〜D），
 * 但去守捕手就很慘（F〜G）。這就是「有的人可以守外野跟二壘，
 * 但外野比二壘好」的來源。
 *
 * 捕手和投手是專職，別人很難去守，所以幾乎沒有位置把它們列進來。
 */
export const POSITION_AFFINITY = {
  P: [],
  C: ['1B', '3B'],
  '1B': ['3B', 'LF', 'RF', '2B'],
  '2B': ['SS', '3B', 'CF', '1B', 'RF'],
  '3B': ['SS', '1B', '2B', 'LF', 'RF'],
  SS: ['2B', '3B', 'CF', 'LF'],
  LF: ['RF', 'CF', '3B', '1B'],
  CF: ['LF', 'RF', 'SS', '2B'],
  RF: ['LF', 'CF', '1B', '3B'],
};

/** 分數 1〜7 對應到字母，用來生成守備適性 */
export const APTITUDE_LETTERS = ['G', 'G', 'F', 'E', 'D', 'C', 'B', 'A'];

// ── 成長期 ──────────────────────────────────────────────
// 實況野球叫「早熟／普通／晩成」。
// 晚成的人一開始看起來很爛，但三年級會爆發 —— 敢不敢賭他？

export const GROWTH_TYPES = {
  early: { id: 'early', name: '早熟', desc: '一年級長很快，三年級就停了', byYear: [1.7, 1.0, 0.45] },
  normal: { id: 'normal', name: '普通', desc: '三年平均地長', byYear: [1.0, 1.0, 1.0] },
  late: { id: 'late', name: '晚成', desc: '一開始很慢，三年級才爆發', byYear: [0.45, 1.0, 1.7] },
};

/** 早熟 25%、普通 50%、晚成 25% */
export function rollGrowthType(rng = Math.random) {
  const r = rng();
  if (r < 0.25) return 'early';
  if (r < 0.75) return 'normal';
  return 'late';
}

// ── 特殊能力 ────────────────────────────────────────────
// 初版照實況野球搬過來，先做成「有」或「沒有」，不分等級。
// role: 'pitcher' 投手用 | 'batter' 打者用
// good: true 好能力（藍） | false 壞能力（紅）

export const SKILLS = [
  // 投手 好能力
  { id: 'nobi', name: '尾勁', role: 'pitcher', good: true, desc: '直球到本壘板前會往上竄，打者容易揮空', req: { stat: 'velocity', min: 50 } },
  { id: 'kire', name: '刁鑽', role: 'pitcher', good: true, desc: '變化球到打者面前才突然轉彎，很難掌握', req: { stat: 'breaking', min: 50 } },
  { id: 'heavy', name: '重球', role: 'pitcher', good: true, desc: '球質重，打者不容易打遠', req: { stat: 'velocity', min: 45 } },
  { id: 'tough', name: '抗打', role: 'pitcher', good: true, desc: '被打安打之後不容易崩盤' },
  { id: 'quick', name: '快速投球', role: 'pitcher', good: true, desc: '投球動作快，跑者不容易盜壘', req: { stat: 'control', min: 40 } },
  { id: 'vsPinch', name: '危機抗壓', role: 'pitcher', good: true, desc: '有人在得點圈時能力上升' },
  { id: 'strikeout', name: '三振能力', role: 'pitcher', good: true, desc: '兩好球之後容易解決打者', req: { stat: 'breaking', min: 45 } },
  { id: 'lateBloom', name: '越投越強', role: 'pitcher', good: true, desc: '比賽後半局能力上升' },
  { id: 'ironArm', name: '鐵臂', role: 'pitcher', good: true, desc: '耐力恢復比別人快', req: { stat: 'stamina', min: 50 } },
  { id: 'durable', name: '不易受傷', role: 'pitcher', good: true, desc: '不容易受傷' },
  { id: 'poise', name: '滿壘不亂', role: 'pitcher', good: true, desc: '滿壘的時候，打者反而在他面前發揮不出來' },
  { id: 'groundInduce', name: '封鎖長打', role: 'pitcher', good: true, desc: '很會製造滾地球，不容易被打出長打', req: { stat: 'control', min: 45 } },
  { id: 'firstStrike', name: '搶好球數', role: 'pitcher', good: true, desc: '很會搶好球數，保送率下降', req: { stat: 'control', min: 50 } },
  { id: 'intimidator', name: '壓迫感十足', role: 'pitcher', good: true, desc: '球有壓迫感，打者容易提早出棒被三振', req: { stat: 'velocity', min: 55 } },
  { id: 'changeSpeed', name: '變速調節', role: 'pitcher', good: true, desc: '速差抓得好，打者不容易發揮力量', req: { stat: 'breaking', min: 40 } },
  { id: 'bigGame', name: '大賽型', role: 'pitcher', good: true, desc: '球隊落後的時候反而更專注' },
  { id: 'clutchPitcher', name: '大心臟', role: 'pitcher', good: true, desc: '得點圈有人時能力上升' },

  // 投手 壞能力
  { id: 'light', name: '輕球', role: 'pitcher', good: false, desc: '球質輕，容易被打遠', req: { stat: 'velocity', max: 55 } },
  { id: 'walks', name: '保送病', role: 'pitcher', good: false, desc: '容易投出四壞球', req: { stat: 'control', max: 55 } },
  { id: 'slowStart', name: '慢熱', role: 'pitcher', good: false, desc: '第一局能力下降' },
  { id: 'hotHead', name: '暴躁', role: 'pitcher', good: false, desc: '被打之後能力下降' },
  { id: 'fragile', name: '易受傷', role: 'pitcher', good: false, desc: '容易受傷' },
  { id: 'homeRunProne', name: '一球定生死', role: 'pitcher', good: false, desc: '投球比較平，容易被打全壘打', req: { stat: 'velocity', max: 60 } },
  { id: 'lateFade', name: '後段疲軟', role: 'pitcher', good: false, desc: '比賽後段能力明顯下滑' },
  { id: 'chokeArtist', name: '大賽軟', role: 'pitcher', good: false, desc: '球隊落後的時候更容易自亂陣腳' },

  // 打者 好能力
  { id: 'average', name: '安打製造機', role: 'batter', good: true, desc: '推打時容易打出安打', req: { stat: 'meet', min: 50 } },
  { id: 'slugger', name: '強打者', role: 'batter', good: true, desc: '強揮時容易打出全壘打', req: { stat: 'power', min: 50 } },
  { id: 'sprayHit', name: '廣角打法', role: 'batter', good: true, desc: '可以把球打到各個方向', req: { stat: 'meet', min: 45 } },
  { id: 'clutch', name: '關鍵時刻', role: 'batter', good: true, desc: '得點圈有人時能力上升' },
  { id: 'bases', name: '滿壘男', role: 'batter', good: true, desc: '滿壘時能力上升' },
  { id: 'vsLeft', name: '剋左投', role: 'batter', good: true, desc: '對左投手能力上升' },
  { id: 'eye', name: '選球眼', role: 'batter', good: true, desc: '容易選到四壞球', req: { stat: 'meet', min: 40 } },
  { id: 'steal', name: '盜壘高手', role: 'batter', good: true, desc: '盜壘成功率高', req: { stat: 'speed', min: 50 } },
  { id: 'throwing', name: '傳球精準', role: 'batter', good: true, desc: '傳球不容易失誤', req: { stat: 'arm', min: 45 } },
  { id: 'glove', name: '接球穩', role: 'batter', good: true, desc: '接球不容易失誤', req: { stat: 'catch', min: 50 } },
  { id: 'earlyBird', name: '開賽衝刺', role: 'batter', good: true, desc: '比賽前兩局特別會打' },
  { id: 'grinder', name: '越晚越拚', role: 'batter', good: true, desc: '比賽後段特別會打' },
  { id: 'speedster', name: '飛毛腿型', role: 'batter', good: true, desc: '很會把一壘打拉成二壘打', req: { stat: 'speed', min: 55 } },
  { id: 'patient', name: '耐心選球', role: 'batter', good: true, desc: '不容易被三振', req: { stat: 'meet', min: 40 } },
  { id: 'bigStage', name: '大心臟', role: 'batter', good: true, desc: '球隊落後的時候反而打得更好' },
  { id: 'switchHit', name: '左右開弓', role: 'batter', good: true, desc: '不管對方是左投右投都不受影響' },
  { id: 'veteran', name: '老練', role: 'batter', good: true, desc: '經驗老到，比賽再怎麼緊繃也不太會慌' },
  { id: 'groundBallSafe', name: '不容易打雙殺', role: 'batter', good: true, desc: '打滾地球的時候比較不會雙殺', req: { stat: 'speed', min: 45 } },

  // 打者 壞能力
  { id: 'whiff', name: '愛揮空', role: 'batter', good: false, desc: '容易被三振', req: { stat: 'meet', max: 55 } },
  { id: 'doublePlay', name: '雙殺打', role: 'batter', good: false, desc: '容易打出雙殺', req: { stat: 'speed', max: 55 } },
  { id: 'error', name: '容易失誤', role: 'batter', good: false, desc: '守備容易失誤', req: { stat: 'catch', max: 55 } },
  { id: 'weakVsLeft', name: '怕左投', role: 'batter', good: false, desc: '對左投手能力下降' },
  { id: 'weakPinch', name: '代打弱', role: 'batter', good: false, desc: '代打時能力下降' },
  { id: 'coldStart', name: '慢熱型', role: 'batter', good: false, desc: '比賽前兩局常常打不好' },
  { id: 'fade', name: '後段疲軟', role: 'batter', good: false, desc: '比賽後段常常打不好' },
  { id: 'stagestruck', name: '大賽緊張', role: 'batter', good: false, desc: '球隊落後的時候更容易慌' },
];

export const skillById = (id) => SKILLS.find((s) => s.id === id);
export const skillsFor = (role, good) =>
  SKILLS.filter((s) => s.role === role && s.good === good);
