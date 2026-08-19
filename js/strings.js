// 畫面上所有的文字都放這裡。要換語言只要改這一個檔案。
// 規則：遊戲裡的字全部用中文，只有「甲子園」保留（那是球場的名字）。

export const UI = {
  appTitle: '甲子園監督',
  appSubtitle: '從地區大賽打起，三個夏天內拿下甲子園冠軍',

  setupHeading: '新監督上任',
  setupLead: '填完之後就直接跳到六月底 —— 離地區大賽只剩兩週。',

  managerLabel: '監督名字',
  managerPlaceholder: '例：山田 太郎',
  schoolLabel: '學校名字',
  schoolPlaceholder: '例：青嶺高中',
  regionLabel: '在日本哪一區',
  prefectureLabel: '縣市',
  randomBtn: '隨機',

  briefHeading: '這個地方的情報',
  briefTeams: '有幾隊',
  briefWins: '要贏幾場進甲子園',
  briefTier: '難度',
  briefScout: '招生品質',
  briefRunLength: '這一局總共',
  briefYears: '每年幾週',
  briefEmpty: '先選一個縣市。',

  startBtn: '上任！',
  errName: '請先填監督名字。',
  errSchool: '請先填學校名字。',
  errPref: '請先選一個縣市。',

  unitTeam: '隊',
  unitWin: '場',
  unitWeek: '週',
  yearLabels: ['第1年', '第2年', '第3年'],

  // 賽程確認畫面
  tallyTotal: '總週數',
  tallyOfficial: '正式比賽',
  tallyPractice: '練習賽',
  tallyMatchWeek: '比賽週',
  tallyTrainWeek: '練習週',
  tallyTransWeek: '過場週',
  scheduleNote: '正式比賽一週最多打 3 場，練習賽一週 1 場。',
  scheduleNote2: '打上去的話才會有的週，輸了就變成練習週。遊戲主要玩法還沒做。',
  toKoshien: '進甲子園要贏',
  resetBtn: '重新開始',
  kindMatch: '比賽',
  kindTraining: '練習',
  kindTransition: '過場',
  unitGame: '場',
};

const SURNAMES = ['佐藤', '鈴木', '高橋', '田中', '渡邊', '伊藤', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐佐木', '山口', '松本', '井上', '木村', '齋藤', '清水', '原田'];
const GIVEN = ['一郎', '健太', '誠', '修', '隆', '浩二', '大輔', '智也', '剛', '猛',
  '徹', '勝', '康弘', '幸雄', '正樹', '和彥', '信也', '達也', '洋一', '宏'];

const SCHOOL_BASE = ['青嶺', '白鷺', '東雲', '海洋', '鶴翔', '明星', '聖陵', '南陽', '北稜', '光陵',
  '若葉', '櫻台', '綠丘', '紅葉', '天神', '蒼空', '常盤', '旭丘', '舞鶴', '霞丘'];
const SCHOOL_SUFFIX = ['高中', '學園高中', '工業高中', '商業高中', '第一高中', '農業高中', '東高中', '西高中'];

const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const randomManagerName = () => `${pick(SURNAMES)} ${pick(GIVEN)}`;
export const randomSchoolName = () => `${pick(SCHOOL_BASE)}${pick(SCHOOL_SUFFIX)}`;
