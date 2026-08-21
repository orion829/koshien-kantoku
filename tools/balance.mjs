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
import * as S from '../js/rules/scouting.js';

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
head('士氣：被淘汰之後最多只能維持 0.65 左右，回不到 100%');
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
head('整局：接手時的一年級，主練的那項能力（打擊）第3年大概 D〜C（預設學生資質刻意調低了）');
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
head('隊伍：三年級退隊後不能沒有投手／捕手，一二年級加起來不能低於 16');
{
  const runs = Array.from({ length: 800 }, () => R.createRoster());
  const noP = runs.filter((r) => !r.players.some((p) => p.gradeYear < 3 && P.isPitcher(p))).length;
  const noC = runs.filter((r) => !r.players.some((p) => p.gradeYear < 3 && p.position === 'C')).length;
  const tooFew = runs.filter((r) => r.players.length < R.MIN_PLAYERS).length;
  const continuing = runs.map((r) => r.players.filter((p) => p.gradeYear < 3).length);
  const belowFloor = continuing.filter((n) => n < R.CONTINUING_MIN).length;
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
  console.log(`  一二年級低於 ${R.CONTINUING_MIN} 人 ${ok(belowFloor)}`
    + `　中位數 ${med(continuing)} 人（要 >= ${R.CONTINUING_MIN}）`);

  const pRatio = runs.map((r) => r.players.filter(P.isPitcher).length / r.players.length);
  const byArch = {};
  runs.forEach((r) => {
    const id = r.archetype.id;
    (byArch[id] ||= []).push(r.players.filter(P.isPitcher).length / r.players.length);
  });
  console.log(`  投手比例 中位數 ${(med(pRatio) * 100).toFixed(0)}%（普通／黃金世代要接近 25〜30%）`);
  console.log(`  　${Object.entries(byArch).map(([id, v]) => `${id} ${(med(v) * 100).toFixed(0)}%`).join('　')}`);
}

head('招生：越強的候選人越難追，六週的招生季全押同一人才追得到頂級天才');
{
  // 模擬「這六週都拿去拜訪同一個候選人」，看幾次拜訪能到門檻
  const visitsNeeded = (talent, fame) => {
    let interest = Math.max(0, Math.min(55, Math.round(18 + fame * 1.4 - (talent - 2) * 12 + 5)));
    const threshold = S.thresholdFor(talent);
    let visits = 0;
    const c = { talent, interest };
    while (c.interest < threshold && visits < 20) {
      S.visitCandidate(c, Math.random);
      visits += 1;
    }
    return { visits, threshold, capped: visits >= 20 };
  };

  console.log('  候選人天賦 ／ 學校注目度 → 六週內拜訪幾次才追得到（超過 6 代表追不到）');
  for (const fame of [0, 20, 35]) {
    const row = [1, 3, 5].map((t) => {
      const { visits, threshold } = visitsNeeded(t, fame);
      return `★${t}(門檻${threshold}) ${visits}次`;
    }).join('　');
    console.log(`  注目度 ${String(fame).padEnd(3)} ${row}`);
  }
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

head('一整局（前3年切片）：三選一 6 次、轉學生 3 次、事件每個練習週都有，而且不能當掉');
{
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  let crash = 0;
  let drafts = 0;
  let events = 0;
  let transfers = 0;
  let superstars = 0;
  let awakenSeenN = 0;
  let awakenBet = 0;
  let awakenWin = 0;
  let alumniVisits = 0;
  const strengths = [];

  for (let n = 0; n < 40; n += 1) {
    const g = ST.createGame({
      managerName: '測試', schoolName: '測試高校', prefectureId: 'aichi',
    });
    try {
      let guard = 0;
      // 遊戲現在不會自己結束，這裡明確跑 3 年就停，模擬「原本的一局」
      while (g.cursor.year <= 3 && guard < 400) {
        guard += 1;
        if (g.pendingDraft?.length) { drafts += 1; RG.choosePerk(g, pick(g.pendingDraft)); continue; }
        if (g.pendingTransfer) {
          transfers += 1;
          if (g.pendingTransfer.superstar) superstars += 1;
          RG.resolveTransfer(g, Math.random() < 0.5 ? 'warm' : 'quiet');
          continue;
        }
        if (g.pendingAlumniVisit) {
          alumniVisits += 1;
          RG.resolveAlumniVisit(g, Math.random() < 0.5 ? 'coach' : 'signing');
          continue;
        }
        if (g.pendingAwaken) {
          awakenSeenN += 1;
          // 模擬一個「大多會賭一把」的玩家，這樣才能同時驗證賭贏跟賭輸的分支
          const bet = Math.random() < 0.7;
          if (bet) awakenBet += 1;
          const r = RG.resolveAwaken(g, bet ? 'bet' : 'pass');
          if (r?.awakenResult?.outcome === 'success') awakenWin += 1;
          continue;
        }
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
  console.log(`  每局三選一 ${(drafts / 40).toFixed(1)} 次（要是 6.0，年年都有全套春夏秋冬）`
    + `　轉學生 ${(transfers / 40).toFixed(1)} 次（要是 3.0）`
    + `　超神轉學生 ${superstars} / ${transfers}（機率設定 2.5%）`);
  console.log(`  每局突發事件 ${(events / 40).toFixed(1)} 次`);
  console.log(`  每局覺醒卡 ${(awakenSeenN / 40).toFixed(1)} 次　`
    + `賭下去 ${awakenBet}/${awakenSeenN}　賭贏 ${awakenWin}/${awakenBet}`
    + `（機率設計上大約 0.4〜0.6）`);
  console.log(`  每局學長探班 ${(alumniVisits / 40).toFixed(2)} 次（3 年局本來就少，正常）`);
  console.log(`  亂玩的最終戰力 中位數 ${strengths[Math.floor(strengths.length / 2)]}`
    + `（認真玩要明顯更高）`);
}

head('長局穩定性：跑 15 年不能當掉、不能卡住（傳統 14 張一定會抽光）');
{
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  let crash = 0;
  let stuck = 0;
  const strengths = [];
  const rosterMins = [];

  const early = []; // 第 1〜3 年的戰力
  const late = [];  // 第 13〜15 年的戰力
  const finalPoints = [];
  const finalLevels = [];

  for (let n = 0; n < 12; n += 1) {
    const g = ST.createGame({
      managerName: '長局測試', schoolName: '長局高校', prefectureId: 'aichi', numYears: 15,
    });
    try {
      let guard = 0;
      let minRoster = 999;
      // 遊戲現在無限跑下去，這裡明確跑 15 年就停，測長局穩不穩
      while (g.cursor.year <= 15 && guard < 3000) {
        guard += 1;
        minRoster = Math.min(minRoster, R.active(g.team.players).length);
        if (g.cursor.year <= 3) early.push(G.teamStrength(g.team.players));
        else if (g.cursor.year >= 13) late.push(G.teamStrength(g.team.players));
        if (g.pendingDraft?.length) { RG.choosePerk(g, pick(g.pendingDraft)); continue; }
        if (g.pendingTransfer) { RG.resolveTransfer(g, Math.random() < 0.5 ? 'warm' : 'quiet'); continue; }
        if (g.pendingAlumniVisit) {
          RG.resolveAlumniVisit(g, Math.random() < 0.5 ? 'coach' : 'signing');
          continue;
        }
        if (g.pendingAwaken) { RG.resolveAwaken(g, Math.random() < 0.7 ? 'bet' : 'pass'); continue; }
        if (g.pendingEvent) { RG.resolveEvent(g, Math.floor(Math.random() * 2)); continue; }
        if (g.tacticChoices?.length && !g.tactic) { g.tactic = pick(g.tacticChoices); continue; }
        // 有點數就花——這是驗證「學校越帶越強」的關鍵：一個會花點數的玩家
        // 應該要比完全不花的玩家強
        const affordable = RG.UPGRADES.filter((u) => (g.legacyPoints || 0) >= RG.upgradeCost(g, u.id));
        if (affordable.length) { RG.buyUpgrade(g, pick(affordable).id); continue; }
        const w = G.currentWeek(g);
        const acts = G.availableActions(g).filter((a) => !a.todo && !a.id.startsWith('scout'));
        G.takeAction(g, w.kind === 'training' ? pick(acts).id : null);
      }
      if (guard >= 3000) stuck += 1;
      strengths.push(G.teamStrength(g.team.players));
      rosterMins.push(minRoster);
      finalPoints.push(g.legacyPoints || 0);
      finalLevels.push(Object.values(g.upgrades || {}).reduce((a, b) => a + b, 0));
    } catch (e) {
      crash += 1;
      console.log(`  當掉了：${e.message}`);
    }
  }
  strengths.sort((a, b) => a - b);
  const ok = (n) => (n === 0 ? 'OK' : `壞了 (${n})`);
  console.log(`  跑完 ${strengths.length}/12 局 15 年　當掉 ${ok(crash)}　卡住 ${ok(stuck)}`);
  console.log(`  最終戰力 最小 ${strengths[0]} 中位數 ${strengths[Math.floor(strengths.length / 2)]}`
    + ` 最大 ${strengths.at(-1)}`);
  console.log(`  過程中人數最低點 ${Math.min(...rosterMins)}（要 >= ${R.MIN_PLAYERS}）`);
  console.log(`  結束時傳承點數 中位數 ${med(finalPoints)}　已買升級 中位數 ${med(finalLevels)} 級`);
  console.log(`  第1〜3年戰力 中位數 ${med(early)}　第13〜15年戰力 中位數 ${med(late)}`
    + `（隨機亂買升級雜訊很大，這裡看個大概；下面「英才培育對新兵的效果」才是乾淨的驗證）`);
}

head('校務投資：升級真的有效果，不是擺著好看（每種升級都升到 Lv.3 比較）');
{
  const base = RG.modifiers({ perks: [], upgrades: {} });
  RG.UPGRADES.forEach((u) => {
    const lv3 = RG.modifiers({ perks: [], upgrades: { [u.id]: 3 } });
    const diffs = Object.keys(base)
      .filter((k) => typeof base[k] === 'number' && Math.abs(lv3[k] - base[k]) > 1e-6)
      .map((k) => `${k} ${base[k].toFixed(2)}→${lv3[k].toFixed(2)}`);
    console.log(`  ${u.name.padEnd(6)} Lv.3　${diffs.join('　') || '（沒有變化，壞了）'}`);
  });
  console.log(`  花費：Lv.1〜3 依序要 ${RG.UPGRADES[0].baseCost}／`
    + `${RG.UPGRADES[0].baseCost + RG.UPGRADE_COST_STEP}／`
    + `${RG.UPGRADES[0].baseCost + RG.UPGRADE_COST_STEP * 2} 點（越買越貴）`);

  // 「英才培育」是唯一真的突破天賦封頂的升級，直接測新兵品質有沒有變好——
  // 這個比長局隨機亂買的測試乾淨很多，長局那邊會被亂買的雜訊蓋掉
  const freshBatch = (bonus, N = 2000) => {
    const players = Array.from({ length: N }, () => P.createPlayer({
      gradeYear: 1, talent: 1 + Math.floor(Math.random() * 5), position: 'SS',
    }));
    if (bonus) P.boostPotential(players, bonus);
    return players.reduce((n, p) => n + P.overall(p), 0) / N;
  };
  const academyBonus = RG.upgradeById('academy').apply;
  const m3 = { potentialBonus: 0 };
  academyBonus(m3); academyBonus(m3); academyBonus(m3);
  const noUp = freshBatch(0);
  const maxUp = freshBatch(m3.potentialBonus);
  console.log(`  英才培育對新兵的效果：沒買 overall ${noUp.toFixed(1)}　`
    + `買到 Lv.3 overall ${maxUp.toFixed(1)}（要明顯更高，這是「學校變強」最直接的證據）`);
}

head('多少年拿冠軍：認真玩（有練、優先買升級）大概幾年拿到夏季甲子園冠軍');
{
  // 「認真玩」的假玩家：練習項目 8 種輪流練（不會偏廢投手或野手），
  // 有點數就優先買「英才培育」「訓練設備」（長期複利最高），其他隨便買
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const menus = ['batting', 'power', 'fielding', 'throwing', 'running', 'pitching', 'breaking', 'physical'];
  const priority = ['academy', 'facility', 'dorm', 'clinic', 'network', 'reputation'];

  function simUntilChampion(maxYears, prefectureId) {
    const g = ST.createGame({
      managerName: '認真玩', schoolName: '認真高校', prefectureId, numYears: maxYears,
    });
    let guard = 0;
    let trainCounter = 0;
    while (g.cursor.year <= maxYears && guard < 30000) {
      guard += 1;
      const prog = g.progress[g.cursor.year - 1];
      if (prog?.koshien?.champion) return g.cursor.year;

      if (g.pendingDraft?.length) { RG.choosePerk(g, pick(g.pendingDraft)); continue; }
      if (g.pendingTransfer) { RG.resolveTransfer(g, Math.random() < 0.5 ? 'warm' : 'quiet'); continue; }
      if (g.pendingAlumniVisit) {
        RG.resolveAlumniVisit(g, Math.random() < 0.5 ? 'coach' : 'signing');
        continue;
      }
      if (g.pendingAwaken) { RG.resolveAwaken(g, Math.random() < 0.7 ? 'bet' : 'pass'); continue; }
      if (g.pendingEvent) { RG.resolveEvent(g, Math.floor(Math.random() * 2)); continue; }
      if (g.tacticChoices?.length && !g.tactic) { g.tactic = pick(g.tacticChoices); continue; }

      const affordable = RG.UPGRADES.filter((u) => (g.legacyPoints || 0) >= RG.upgradeCost(g, u.id));
      if (affordable.length) {
        const byPriority = priority.map((id) => affordable.find((u) => u.id === id)).filter(Boolean);
        RG.buyUpgrade(g, (byPriority[0] || affordable[0]).id);
        continue;
      }

      const w = G.currentWeek(g);
      if (w.kind === 'training') {
        const menuActs = G.availableActions(g).filter((a) => a.kind === 'menu');
        const wantMenu = menus[trainCounter % menus.length];
        const act = menuActs.find((a) => a.id === wantMenu) || pick(menuActs);
        trainCounter += 1;
        G.takeAction(g, act.id);
      } else {
        G.takeAction(g, null);
      }
    }
    return g.progress[g.cursor.year - 1]?.koshien?.champion ? g.cursor.year : null;
  }

  const tiers = [
    ['簡單(贏5場)', 'tottori'], ['普通(贏6場)', 'aomori'],
    ['困難(贏7場)', 'ibaraki'], ['地獄(贏8場)', 'aichi'],
  ];
  for (const [label, pref] of tiers) {
    const N = 50; const maxYears = 35;
    const years = [];
    let never = 0;
    for (let i = 0; i < N; i += 1) {
      const y = simUntilChampion(maxYears, pref);
      if (y === null) never += 1; else years.push(y);
    }
    years.sort((a, b) => a - b);
    const avg = years.length ? (years.reduce((a, b) => a + b, 0) / years.length).toFixed(1) : '—';
    console.log(`  ${label.padEnd(10)} 平均第 ${avg} 年拿冠軍`
      + `（中位數第 ${years[Math.floor(years.length / 2)]} 年，${never}/${N} 局 ${maxYears} 年內沒拿到）`);
  }
  console.log('  ※ 目標：普通約第 10 年、地獄約第 15 年（見 game.js 的 OPPONENT 註解）');
}

head('學力與考試：學力越低越容易被禁賽，但保底不能把隊伍打到湊不出人');
{
  const N = 3000;
  const players = Array.from({ length: N }, () => P.createPlayer({ gradeYear: 1, talent: 3 }));
  const g = { team: { players } };
  const { failed } = RG.resolveExam(g);
  console.log(`  ${N} 人期末考：不及格 ${failed.length} 人（${((failed.length / N) * 100).toFixed(0)}%）`);

  // 極端情況：學力全部設 0，看保底機制擋不擋得住
  const weakPlayers = Array.from({ length: 20 }, () => {
    const p = P.createPlayer({ gradeYear: 1, talent: 1 });
    p.gakuryoku = 0;
    return p;
  });
  const gw = { team: { players: weakPlayers } };
  const rw = RG.resolveExam(gw);
  const eligible = weakPlayers.length - rw.failed.length;
  console.log(`  20 人全部學力 0（最壞情況）：還能出賽 ${eligible} 人`
    + `（保底 ${RG.EXAM_MIN_ELIGIBLE} 人，要 >= ${R.MIN_PLAYERS}）`);
}

console.log('');
