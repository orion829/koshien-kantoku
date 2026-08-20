// 平衡驗證工具
//
//   node tools/balance.mjs
//
// 改動任何影響平衡的數字之後跑這個，不要用猜的。
// 目標值寫在每一段的開頭，跑出來對不上就是壞了。

import * as cal from '../js/data/calendar.js';
import * as MT from '../js/rules/match.js';
import * as A from '../js/data/abilities.js';
import * as P from '../js/rules/player.js';
import * as R from '../js/rules/roster.js';
import * as T from '../js/rules/training.js';
import * as M from '../js/rules/morale.js';
import * as RG from '../js/rules/roguelike.js';
import * as G from '../js/rules/game.js';
import * as ST from '../js/state.js';

const med = (v) => v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)];
const fmt = (v) => (A.grade(Math.round(v)) + Math.round(v)).padEnd(5);
const head = (s) => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 58 - s.length))}`);

// ── 0. 比賽模擬 ─────────────────────────────────────────
head('比賽：數字要接近真實的高中棒球');
{
  const one = (a, b) => {
    const t1 = MT.generateOpponent(a);
    const t2 = MT.generateOpponent(b);
    return MT.playMatch(
      { ...t1, ...MT.buildLineup(t1.players) },
      { ...t2, ...MT.buildLineup(t2.players) },
    );
  };
  const N = 600;
  const st = {
    r: 0, h: 0, ab: 0, k: 0, bb: 0, hr: 0, pit: 0,
  };
  let homeWin = 0;
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  for (let i = 0; i < N; i += 1) {
    const m = one(55, 55);
    [m.home, m.away].forEach((t) => {
      st.r += t.total;
      st.h += sum(t.batters.map((b) => b.h));
      st.ab += sum(t.batters.map((b) => b.ab));
      st.k += sum(t.batters.map((b) => b.k));
      st.bb += sum(t.batters.map((b) => b.bb));
      st.hr += sum(t.batters.map((b) => b.hr));
      st.pit += sum(t.pitchers.map((p) => p.pitches));
    });
    if (m.winner === 'home') homeWin += 1;
  }
  const per = (v) => (v / (N * 2)).toFixed(2);
  console.log(`  得分 ${per(st.r)} (4〜5)　安打 ${per(st.h)} (8〜9)　全壘打 ${per(st.hr)} (0.5)`);
  console.log(`  三振 ${per(st.k)} (7)　四壞 ${per(st.bb)} (3〜4)　投球數 ${per(st.pit)} (120〜140)`);
  console.log(`  打擊率 ${(st.h / st.ab).toFixed(3)} (.270)　主隊勝率 ${(homeWin / N * 100).toFixed(0)}% (50)`);
  console.log('  戰力差 → 勝率（要留爆冷空間，不能一面倒）');
  for (const [a, b] of [[55, 45], [55, 50], [55, 60], [55, 65]]) {
    let w = 0;
    for (let i = 0; i < 400; i += 1) if (one(a, b).winner === 'home') w += 1;
    console.log(`    ${a} vs ${b} → ${(w / 4).toFixed(0)}%`);
  }
}

// ── 1. 士氣與練習效率 ───────────────────────────────────
head('士氣：被淘汰之後最多只能維持 0.70，回不到 100%');
{
  const rep = (cycle, n) => Array.from({ length: n }, (_, i) => cycle[i % cycle.length]);
  const rows = [['都不打練習賽', ['train']]];
  for (const k of [3, 4, 5]) rows.push([`練${k}打1`, [...Array(k).fill('train'), 'practice']]);
  rows.push(['還在打比賽', ['train', 'train', 'train', 'match']]);
  for (const [name, cycle] of rows) {
    const r = M.simulate(rep(cycle, 120));
    console.log(`  ${name.padEnd(14)} 平均效率 ${r.average}`);
  }
  console.log('  ※ 只有正式比賽能把計時器歸零，練習賽最多拉回到 2');
}

head('贏 vs 故意輸：邊際兌換率應該明顯低於 1（多出來的週不值錢）');
{
  const run = cal.buildRun(6).flat();
  const lost = run.map((w) => (w.conditional
    ? { ...w, kind: 'training', games: [], canPractice: true, eliminated: true } : w));

  const play = (weeks, threshold) => {
    let c = 0; let total = 0; let n = 0;
    weeks.forEach((w) => {
      if (w.kind === 'match' && !w.eliminated) { c = M.advance(c, 'match'); return; }
      if (w.kind === 'transition') { c = M.advance(c, 'rest'); return; }
      const act = (w.canPractice && c >= threshold) ? 'practice' : 'train';
      total += M.trainingYield(c, act);
      c = M.advance(c, act); n += 1;
    });
    return { n, total };
  };
  // 每條路線各自找最佳策略，不然比較不公平
  const best = (weeks) => [2, 3, 4, 5, 6, 8, 10, 999]
    .map((t) => play(weeks, t))
    .reduce((a, b) => (b.total > a.total ? b : a));

  const win = best(run);
  const tank = best(lost);
  console.log(`  每年拿冠軍   練習週 ${win.n} ｜總成果 ${win.total.toFixed(1)}`
    + ` ｜平均 ${(win.total / win.n).toFixed(3)}`);
  console.log(`  每年首戰就輸 練習週 ${tank.n} ｜總成果 ${tank.total.toFixed(1)}`
    + ` ｜平均 ${(tank.total / tank.n).toFixed(3)}`);
  console.log(`  邊際兌換率 ${((tank.total - win.total) / (tank.n - win.n)).toFixed(2)}`
    + `　輸光多拿 ${((tank.total / win.total - 1) * 100).toFixed(0)}%`);
  console.log('  ※ 剩下的差距要靠「贏球的獎勵」補，那個還沒做');
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

// ── 7. roguelike：對手特色、作戰、傳統 ──────────────────
head('對手特色：平均起來要接近 0，不然強度階梯會失準');
{
  const trial = (theirMods, N = 900) => {
    let w = 0;
    for (let i = 0; i < N; i += 1) {
      const t1 = MT.generateOpponent(55);
      const t2 = MT.generateOpponent(55);
      const m = MT.playMatch(
        { ...t1, ...MT.buildLineup(t1.players), mods: RG.baseMods() },
        { ...t2, ...MT.buildLineup(t2.players), mods: theirMods },
      );
      if (m.winner === 'home') w += 1;
    }
    return (w / N) * 100;
  };

  const base = trial(RG.baseMods());
  let sum = 0;
  const cells = RG.OPPONENT_TRAITS.map((t) => {
    const mods = RG.baseMods();
    t.apply(mods);
    const v = trial(mods) - base;
    sum += v;
    return `${t.name} ${v >= 0 ? '+' : ''}${v.toFixed(0)}`;
  });
  console.log(`  對手沒特色時我方勝率 ${base.toFixed(0)}%（要接近 50）`);
  console.log(`  ${cells.join('　')}`);
  console.log(`  平均偏移 ${(sum / RG.OPPONENT_TRAITS.length).toFixed(1)}pp（要在 ±2 以內）`);
}

head('作戰與傳統：每個都要有用，但不能有一個獨大（+1〜+8pp）');
{
  const trial = (mods, N = 900) => {
    let w = 0;
    for (let i = 0; i < N; i += 1) {
      const t1 = MT.generateOpponent(55);
      const t2 = MT.generateOpponent(55);
      const m = MT.playMatch(
        { ...t1, ...MT.buildLineup(t1.players), mods },
        { ...t2, ...MT.buildLineup(t2.players) },
      );
      if (m.winner === 'home') w += 1;
    }
    return (w / N) * 100;
  };
  const base = trial(RG.baseMods());
  const line = (list) => list.map((x) => {
    const mods = RG.baseMods();
    x.apply(mods);
    const v = trial(mods) - base;
    return `${x.name} ${v >= 0 ? '+' : ''}${v.toFixed(0)}`;
  }).join('　');

  console.log(`  沒作戰時的勝率 ${base.toFixed(0)}%`);
  console.log(`  作戰 ${line(RG.TACTICS)}`);
  console.log(`  傳統 ${line(RG.PERKS)}`);
  console.log('  ※ 穩紮穩打是負的沒關係，它換到的是「不受傷」');
}

head('一整局：三選一 5 次、事件約 6 次，而且不能當掉');
{
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  let crash = 0;
  let drafts = 0;
  let events = 0;
  const strengths = [];

  for (let n = 0; n < 40; n += 1) {
    const g = ST.createGame({
      managerName: '測試', schoolName: '測試高校', prefectureId: 'aichi',
    });
    try {
      let guard = 0;
      while (!G.isRunOver(g) && guard < 300) {
        guard += 1;
        if (g.pendingDraft?.length) { drafts += 1; RG.choosePerk(g, pick(g.pendingDraft)); continue; }
        if (g.pendingEvent) { events += 1; RG.resolveEvent(g, Math.floor(Math.random() * 2)); continue; }
        if (g.tacticChoices?.length && !g.tactic) { g.tactic = pick(g.tacticChoices); continue; }
        const w = G.currentWeek(g);
        const acts = G.availableActions(g)
          .filter((a) => !a.todo && !a.id.startsWith('scout'));
        G.takeAction(g, w.kind === 'training' ? pick(acts).id : null);
      }
      strengths.push(G.teamStrength(g.team.players));
    } catch (e) {
      crash += 1;
      console.log(`  當掉了：${e.message}`);
    }
  }
  strengths.sort((a, b) => a - b);
  console.log(`  跑完 ${strengths.length} 局　當掉 ${crash} 次（要是 0）`);
  console.log(`  每局三選一 ${(drafts / 40).toFixed(1)} 次（要是 5.0）`
    + `　突發事件 ${(events / 40).toFixed(1)} 次（7 左右）`);
  console.log(`  亂玩的最終戰力 中位數 ${strengths[Math.floor(strengths.length / 2)]}`
    + `（認真玩要明顯更高）`);
}

console.log('');
