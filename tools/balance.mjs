// 平衡驗證工具
//
//   node tools/balance.mjs
//
// 改動任何影響平衡的數字之後跑這個，不要用猜的。
// 目標值寫在每一段的開頭，跑出來對不上就是壞了。

import * as cal from '../js/data/calendar.js';
import * as A from '../js/data/abilities.js';
import * as P from '../js/rules/player.js';
import * as R from '../js/rules/roster.js';
import * as T from '../js/rules/training.js';
import * as M from '../js/rules/morale.js';

const med = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
const fmt = (v) => (A.grade(Math.round(v)) + Math.round(v)).padEnd(5);
const head = (s) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`);

// ── 1. 士氣與練習效率 ───────────────────────────────────
head('士氣：最佳打法應該是「練4打1」，平均 0.80');
{
  const rep = (cycle, n) => Array.from({ length: n }, (_, i) => cycle[i % cycle.length]);
  const rows = [['都不打練習賽', ['train']]];
  for (const k of [3, 4, 5]) rows.push([`練${k}打1`, [...Array(k).fill('train'), 'practice']]);
  for (const [name, cycle] of rows) {
    const r = M.simulate(rep(cycle, 60));
    console.log(`  ${name.padEnd(14)} 平均效率 ${r.average}`);
  }
}

// ── 2. 天賦 × 年級的起點 ────────────────────────────────
head('生成：一年級 2〜3 星應該落在 F〜E，三年級 3 星 = C');
{
  console.log('        ' + [1, 2, 3, 4, 5].map((t) => `★${t}`.padEnd(7)).join(''));
  for (const gy of [1, 2, 3]) {
    const row = [1, 2, 3, 4, 5].map((t) => {
      const ps = Array.from({ length: 1200 },
        () => P.createPlayer({ gradeYear: gy, talent: t, position: 'SS' }));
      return fmt(med(ps.map(P.overall))).padEnd(7);
    });
    console.log(`  ${gy}年級  ${row.join('')}`);
  }
}

// ── 3. 成長期 ───────────────────────────────────────────
head('成長期：早熟前期領先但停在 C，晚成後期反超到 A');
{
  for (const gt of ['early', 'normal', 'late']) {
    const y = { 1: [], 2: [], 3: [] };
    const caps = [];
    for (let i = 0; i < 1200; i++) {
      const p = P.createPlayer({ gradeYear: 1, talent: 3, position: 'SS', growthType: gt });
      caps.push(p.potential.meet);
      const menu = T.menuById('batting');
      for (let gy = 1; gy <= 3; gy++) {
        p.gradeYear = gy;
        for (let k = 0; k < 8; k++) T.trainPlayer(p, menu, 0.85);
        y[gy].push(p.abilities.meet);
      }
    }
    console.log(`  ${A.GROWTH_TYPES[gt].name.padEnd(3)} 1年末 ${fmt(med(y[1]))}`
      + ` 2年末 ${fmt(med(y[2]))} 3年末 ${fmt(med(y[3]))} ｜上限 ${fmt(med(caps))}`);
  }
}

// ── 4. 天賦對最終能力的影響 ─────────────────────────────
head('天賦：練滿三年後，★1 應該只有 D，★5 應該摸得到 A〜S');
{
  for (const t of [1, 2, 3, 4, 5]) {
    const out = [];
    for (let i = 0; i < 1200; i++) {
      const p = P.createPlayer({ gradeYear: 1, talent: t, position: 'SS', growthType: 'normal' });
      const menu = T.menuById('batting');
      for (let gy = 1; gy <= 3; gy++) {
        p.gradeYear = gy;
        for (let k = 0; k < 8; k++) T.trainPlayer(p, menu, 0.85);
      }
      out.push(p.abilities.meet);
    }
    console.log(`  ★${t} 三年後的打擊 ${fmt(med(out))}`);
  }
}

// ── 5. 跑完一整局 ───────────────────────────────────────
head('整局：接手時的一年級，第3年決勝時應該接近 C（等於自然生成的三年級）');
{
  function runOnce(menuPlan) {
    const weeks = cal.buildRun(6);
    let { players } = R.createRoster({ archetype: R.ARCHETYPES.normal });
    const tracked = players.filter((p) => p.gradeYear === 1).map((p) => p.id);
    let counter = 0; let sinceMatch = 0; let trainWeeks = 0;
    weeks.forEach((year, yi) => {
      if (yi > 0) {
        players = R.advanceYear(players).players;
        players = R.addRecruits(players, Array.from({ length: 5 },
          () => P.createPlayer({ gradeYear: 1, talent: 3 })));
      }
      year.forEach((w) => {
        if (w.kind === 'match') { sinceMatch = 0; return; }
        if (w.kind === 'transition') { sinceMatch++; return; }
        counter++;
        if (counter % 5 === 0) { sinceMatch = Math.max(0, sinceMatch - M.PRACTICE_REWIND); return; }
        T.trainTeam(players, menuPlan(trainWeeks), M.efficiency(sinceMatch));
        trainWeeks++; sinceMatch++;
      });
    });
    return { players, tracked };
  }

  const plans = {
    全部練打擊: () => 'batting',
    '打擊/守備輪流': (i) => (i % 2 ? 'fielding' : 'batting'),
    平均輪四種: (i) => ['batting', 'fielding', 'running', 'physical'][i % 4],
  };
  for (const [label, plan] of Object.entries(plans)) {
    const rows = [];
    for (let i = 0; i < 120; i++) {
      const r = runOnce(plan);
      r.tracked.forEach((id) => {
        const p = r.players.find((x) => x.id === id);
        if (p && !P.isPitcher(p)) rows.push(p);
      });
    }
    const s = (id) => fmt(med(rows.map((p) => p.abilities[id])));
    console.log(`  ${label.padEnd(14)} 打擊 ${s('meet')} 力量 ${s('power')}`
      + ` 守備 ${s('field')} 速度 ${s('speed')} ｜整體 ${fmt(med(rows.map(P.overall)))}`);
  }
}

// ── 6. 隊伍生成的健全性 ─────────────────────────────────
head('隊伍：三年級退隊後不能沒有投手／捕手，人數不能低於 9');
{
  const runs = Array.from({ length: 800 }, () => R.createRoster());
  const noP = runs.filter((r) => !r.players.some((p) => p.gradeYear < 3 && P.isPitcher(p))).length;
  const noC = runs.filter((r) => !r.players.some((p) => p.gradeYear < 3 && p.position === 'C')).length;
  const tooFew = runs.filter((r) => r.players.length < R.MIN_PLAYERS).length;
  let bad = 0;
  runs.forEach((r) => r.players.forEach((p) => p.skills.forEach((id) => {
    const sk = A.skillById(id);
    if (!sk.req) return;
    const v = p.abilities[sk.req.stat];
    if (sk.req.min !== undefined && v < sk.req.min) bad++;
    if (sk.req.max !== undefined && v > sk.req.max) bad++;
  })));
  const ok = (n) => (n === 0 ? 'OK' : `壞了 (${n})`);
  console.log(`  退隊後沒投手 ${ok(noP)}　沒捕手 ${ok(noC)}　人數不足 ${ok(tooFew)}　能力矛盾 ${ok(bad)}`);
}

console.log('');
