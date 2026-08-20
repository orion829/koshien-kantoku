// 畫面上所有的文字都放這裡。要換語言只要改這一個檔案。
// 規則：遊戲裡的字全部用中文，只有「甲子園」保留（那是球場的名字）。

export const UI = {
  appTitle: '甲子園監督',
  appSubtitle: '從地區大賽打起，一年一年把學校帶向甲子園',

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
  tallyPractice: '可打練習賽',
  tallyMatchWeek: '比賽週',
  tallyTrainWeek: '練習週',
  tallyTransWeek: '過場週',
  badgePractice: '練習賽',
  badgeCanPractice: '可練習賽',
  scheduleNote: '正式比賽一週最多打 3 場，練習賽一週 1 場。所有練習週都可以改成打練習賽。',
  scheduleNote2: '打上去才會有的週，輸了就變成練習週（也可以拿來打練習賽）。遊戲主要玩法還沒做。',
  toKoshien: '進甲子園要贏',
  resetBtn: '重新開始',
  resetConfirm: '再按一次，真的重來？',
  kindMatch: '比賽',
  kindTraining: '練習',
  kindTransition: '過場',
  unitGame: '場',
};

export { randomPersonName as randomManagerName, randomSchoolName } from './data/names.js';
