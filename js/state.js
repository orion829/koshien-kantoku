import { byId } from './data/prefectures.js';
import { buildRun } from './data/calendar.js';
import { createRoster } from './rules/roster.js';

const SAVE_KEY = 'koshien-kantoku:save:v5';
export const SAVE_VERSION = 5;

/** 從開始畫面的輸入建立一份新的遊戲存檔 */
export function createGame({ managerName, schoolName, prefectureId }) {
  const pref = byId(prefectureId);
  if (!pref) throw new Error(`unknown prefecture: ${prefectureId}`);

  const schedule = buildRun(pref.wins);
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
    },

    // 士氣計時器（距離上一場正式比賽過了幾週）
    morale: { weeksSinceMatch: 0 },
    // 那一年各項比賽有沒有被淘汰
    progress: [1, 2, 3].map(() => ({
      regional: null, koshien: null, autumn: null, autumnArea: null, senbatsu: null,
    })),

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
