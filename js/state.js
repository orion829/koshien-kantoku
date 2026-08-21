import { byId } from './data/prefectures.js';
import { buildRun } from './data/calendar.js';
import { createRoster } from './rules/roster.js';
import { drawPerks, pickTransferWeek } from './rules/roguelike.js';

const SAVE_KEY = 'koshien-kantoku:save:v15';
export const SAVE_VERSION = 15;

/**
 * 從開始畫面的輸入建立一份新的遊戲存檔。
 * numYears 預設 3（遊戲設計就是「三個夏天」），不對玩家開放，
 * 只是讓長局測試（例如跑 15 年看系統穩不穩）不用改這個函式。
 */
export function createGame({
  managerName, schoolName, prefectureId, numYears = 3,
}) {
  const pref = byId(prefectureId);
  if (!pref) throw new Error(`unknown prefecture: ${prefectureId}`);

  const schedule = buildRun(pref.wins, numYears);
  // 你接手的隊伍。開局種類是這個遊戲最重要的隨機性
  const { archetype, players } = createRoster();

  return {
    version: SAVE_VERSION,
    createdAt: new Date().toISOString(),

    manager: { name: managerName.trim() },
    school: {
      name: schoolName.trim(),
      prefectureId: pref.id,
      prefectureName: pref.name,
      region: pref.region,
    },
    difficulty: {
      teams: pref.teams,
      wins: pref.wins,
      tier: pref.label,
      stars: pref.stars,
      scoutPool: pref.scoutPool,
    },

    // 進度：year 是第幾年(1~3)、week 是那一年的第幾週、abs 是整局的第幾週
    cursor: { year: 1, week: 1, abs: 1 },
    schedule,

    team: {
      archetype: { id: archetype.id, name: archetype.name, desc: archetype.desc },
      players,
      startersGraduated: false,      // 接手時那批三年級畢業了沒——畢業後開局標籤就不顯示了
    },

    // 士氣計時器（距離上一場正式比賽過了幾週）
    morale: { weeksSinceMatch: 0 },
    // 那一年各項比賽有沒有被淘汰
    progress: schedule.map(() => ({
      regional: null, koshien: null, autumn: null, autumnArea: null, senbatsu: null,
    })),

    // ── roguelike ────────────────────────────────
    perks: [],                    // 已經拿到的傳統
    pendingDraft: drawPerks({ perks: [] }, 3),   // 上任第一件事：三選一
    pendingEvent: null,           // 還沒處理的突發事件
    recentEvents: [],             // 最近出過的事件，避免一直重複
    weekBoost: null,              // 事件帶來的「這一週」加成
    tactic: null,                 // 這一週的作戰
    tacticChoices: null,          // 這一週可以選的三個作戰
    extraFame: 0,                 // 事件加的注目度
    transferWeekIndex: pickTransferWeek(schedule[0]),  // 今年轉學生會在哪一週出現
    pendingTransfer: null,        // 還沒處理的轉學生
    pendingAwaken: null,          // 還沒處理的能力覺醒賭注
    awakenSeen: [],                // 賭輸過的（球員,能力）組合，不會再跳第二次
    proAlumni: [],                 // 被職棒選走的畢業生
    pendingAlumniVisit: null,      // 還沒處理的學長探班事件
    legacyPoints: 0,                // 傳承點數，拿去買永久升級
    upgrades: {},                   // 已經買的升級等級，例如 { facility: 2 }
    pendingInvest: false,           // 三年級退隊後，下一畫面要不要顯示投資面板
    examBanned: [],                 // 期末考沒過、這一輪大賽不能出賽的球員 id
    customLineup: null,             // 玩家自己排的先發：{ order:[{playerId,position}...], pitchers:[id,...] }
    rivalRecords: {},               // 對戰紀錄：{ 對手校名: {wins, losses} }，打滿 3 次算宿敵

    // 最近做過的事，給畫面顯示用（只留最後 40 筆）
    log: [],
  };
}

export const currentWeek = (g) =>
  g.schedule[g.cursor.year - 1]?.[g.cursor.week - 1] ?? null;

export const totalWeeks = (g) =>
  g.schedule.reduce((n, y) => n + y.length, 0);

export function save(g) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(g));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return g.version === SAVE_VERSION ? g : null;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
