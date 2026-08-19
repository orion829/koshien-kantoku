import { byId } from './data/prefectures.js';
import { buildRun } from './data/calendar.js';

const SAVE_KEY = 'koshien-kantoku:save:v1';
export const SAVE_VERSION = 1;

/** セットアップ画面の入力から新規ゲーム状態を組み立てる */
export function createGame({ managerName, schoolName, prefectureId }) {
  const pref = byId(prefectureId);
  if (!pref) throw new Error(`unknown prefecture: ${prefectureId}`);

  const schedule = buildRun(pref.wins);

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

    // 進行カーソル: year は 1..3、week はその年の何週目か、abs はラン通算
    cursor: { year: 1, week: 1, abs: 1 },
    schedule,

    // 士気減衰カウンタ（最後の公式戦から何週経ったか）
    morale: { weeksSinceMatch: 0 },
    // その年の大会から敗退済みか
    progress: [
      { regional: null, koshien: null, autumn: null, senbatsu: null },
      { regional: null, koshien: null, autumn: null, senbatsu: null },
      { regional: null, koshien: null, autumn: null, senbatsu: null },
    ],
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
