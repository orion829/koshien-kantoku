// UI 文字列はすべてここに集約。別言語版を作るときはこのファイルだけ差し替える。
export const UI = {
  appTitle: '甲子園監督',
  appSubtitle: '從地方大賽打起，三個夏天內拿下全國冠軍',

  setupHeading: '新規就任',
  setupLead: '登録之後就直接進入六月底 —— 距離地方大賽只剩兩週。',

  managerLabel: '監督姓名',
  managerPlaceholder: '例：山田 太郎',
  schoolLabel: '學校名稱',
  schoolPlaceholder: '例：青嶺高校',
  regionLabel: '所在地方',
  prefectureLabel: '都道府県',
  randomBtn: '隨機',

  briefHeading: '赴任地情報',
  briefTeams: '參加隊伍',
  briefWins: '甲子園まで',
  briefTier: '難度',
  briefScout: '招生池',
  briefRunLength: '本局總週數',
  briefYears: '各年週數',
  briefEmpty: '請先選擇都道府県。',

  startBtn: '就任する',
  errName: '請輸入監督姓名。',
  errSchool: '請輸入學校名稱。',
  errPref: '請選擇都道府県。',

  unitTeam: '隊',
  unitWin: '勝',
  unitWeek: '週',
  yearLabels: ['第1年', '第2年', '第3年'],
};

const SURNAMES = ['佐藤','鈴木','高橋','田中','渡辺','伊藤','山本','中村','小林','加藤',
  '吉田','山田','佐々木','山口','松本','井上','木村','斎藤','清水','原田'];
const GIVEN = ['一郎','健太','誠','修','隆','浩二','大輔','智也','剛','猛',
  '徹','勝','康弘','幸雄','正樹','和彦','信也','達也','洋一','宏'];

const SCHOOL_BASE = ['青嶺','白鷺','東雲','海洋','鶴翔','明星','聖陵','南陽','北稜','光陵',
  '若葉','桜台','緑丘','紅葉','天神','蒼空','常盤','旭丘','舞鶴','霞ヶ丘'];
const SCHOOL_SUFFIX = ['高校','学園高校','工業高校','商業高校','第一高校','農業高校','東高校','西高校'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const randomManagerName = () => `${pick(SURNAMES)} ${pick(GIVEN)}`;
export const randomSchoolName = () => `${pick(SCHOOL_BASE)}${pick(SCHOOL_SUFFIX)}`;
