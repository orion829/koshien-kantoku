// 比賽的詳細結果
//
// 逐局比分表 + 我方每個選手的數據 + 精彩場面 + 這場比賽帶來的成長和傷勢。
// 數據欄位用棒球慣用的英文縮寫（AVG／OBP／SLG／OPS／ERA／WHIP），
// 台灣的棒球轉播、報紙也都是這樣寫，不算違背「畫面上的字都要中文」。

import { battingLine, pitchingLine } from '../rules/player.js';

const STAT_NAME = {
  meet: '打擊', power: '力量', speed: '速度', arm: '臂力',
  field: '守備', catch: '接球', velocity: '球速',
  control: '控球', stamina: '耐力', breaking: '變化球',
};

const KIND_NAME = {
  hr: '全壘打', triple: '三壘打', double: '二壘打', single: '安打',
};

const ip = (outs) => `${Math.floor(outs / 3)}.${outs % 3}`;

/** 逐局比分表 */
function lineScore(r) {
  const us = r.box.us;
  const them = r.box.them;
  const n = Math.max(us.runs.length, them.runs.length);
  const head = Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('');
  const row = (t, name, isUs) => {
    const cells = Array.from({ length: n }, (_, i) => {
      const v = t.runs[i];
      return `<td>${v === null || v === undefined ? '×' : v}</td>`;
    }).join('');
    return `<tr class="${isUs ? 'is-us' : ''}">
      <th class="ls__name">${name}</th>${cells}
      <td class="ls__tot">${t.total}</td><td class="ls__h">${t.hits}</td>
      <td class="ls__e">${t.errors ?? 0}</td></tr>`;
  };
  return `
    <table class="ls">
      <thead><tr><th></th>${head}<th class="ls__tot">R</th><th class="ls__h">H</th>
        <th class="ls__e">E</th></tr></thead>
      <tbody>
        ${row(them, them.name, false)}
        ${row(us, us.name, true)}
      </tbody>
    </table>`;
}

/** 今天的手感，給畫面看的小標籤——「普通」不特別顯示 */
function conditionTag(us, id) {
  const c = us.conditions?.[id];
  return c ? `<span class="cond cond--${c.id}">${c.label}</span>` : '';
}

/** 我方打線 */
function battingTable(us) {
  const rows = us.batters.map((b) => {
    const line = battingLine(b);
    return `
    <tr>
      <td class="bs__pos">${b.pos}</td>
      <td class="bs__name" data-pid="${b.id}">${b.name}${conditionTag(us, b.id)}</td>
      <td>${b.ab}</td>
      <td class="${b.h ? 'hi' : ''}">${b.h}</td>
      <td class="${b.hr ? 'hi' : ''}">${b.hr || '－'}</td>
      <td class="${b.rbi ? 'hi' : ''}">${b.rbi || '－'}</td>
      <td>${b.bb || '－'}</td>
      <td>${b.k || '－'}</td>
      <td class="bs__avg">${line ? line.avg : '－'}</td>
      <td>${line ? line.obp : '－'}</td>
      <td>${line ? line.slg : '－'}</td>
      <td class="bs__avg">${line ? line.ops : '－'}</td>
    </tr>`;
  }).join('');
  return `
    <div class="bs-scroll"><table class="bs">
      <thead><tr><th></th><th>選手</th><th>AB</th><th>H</th><th>HR</th>
        <th>RBI</th><th>BB</th><th>SO</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

/** 我方投手 */
function pitchingTable(us) {
  const rows = us.pitchers.map((p) => {
    const line = pitchingLine(p);
    return `
    <tr>
      <td class="bs__name" data-pid="${p.id}">${p.name}${conditionTag(us, p.id)}</td>
      <td>${ip(p.outs)}</td>
      <td>${p.h}</td>
      <td class="${p.r ? '' : 'hi'}">${p.r}</td>
      <td class="${p.k >= 7 ? 'hi' : ''}">${p.k}</td>
      <td>${p.bb}</td>
      <td>${line ? line.whip : '－'}</td>
      <td class="${p.pitches > 120 ? 'warn-num' : ''}">${p.pitches}</td>
    </tr>`;
  }).join('');
  return `
    <div class="bs-scroll"><table class="bs">
      <thead><tr><th>投手</th><th>IP</th><th>H</th><th>R</th>
        <th>K</th><th>BB</th><th>WHIP</th><th>投球數</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
}

function highlights(r) {
  if (!r.plays?.length) return '';
  const items = r.plays.slice(0, 6).map((p) => `
    <li><span class="hl__inn">${p.inning}局</span>
      <b data-pid="${p.batterId}">${p.batter}</b> ${KIND_NAME[p.kind] || p.kind}
      ${p.rbi ? `<span class="hl__rbi">${p.rbi}打點</span>` : ''}</li>`).join('');
  return `<h4 class="bs__h">精彩場面</h4><ul class="hl">${items}</ul>`;
}

function growthBlock(r) {
  const g = r.growth;
  if (!g) return '';
  const grew = [...g.grew].sort((a, b) => b.total - a.total).slice(0, 5).map((x) => `
    <li><b data-pid="${x.id}">${x.name}</b>
      ${Object.entries(x.gains).filter(([, v]) => v >= 0.08)
    .map(([k, v]) => `<span class="delta"><i>${STAT_NAME[k]}</i><b>+${v.toFixed(1)}</b></span>`)
    .join('')}</li>`).join('');

  const hurt = g.injured.map((x) => `
    <li class="inj inj--${x.severity}">
      <b data-pid="${x.id}">${x.name}</b> ${x.label}（${x.cause}）
      休養 ${x.weeks} 週、能力 −${x.drop}
      ${x.permanent ? `<span class="inj__perm">上限永久 −${x.permanent}</span>` : ''}
      ${x.pitches > 100 ? `<span class="inj__why">投了 ${x.pitches} 球</span>` : ''}
    </li>`).join('');

  return `
    ${grew ? `<h4 class="bs__h">這場比賽的成長</h4><ul class="grew">${grew}</ul>` : ''}
    ${hurt ? `<h4 class="bs__h bs__h--bad">受傷</h4><ul class="injs">${hurt}</ul>` : ''}`;
}

/** 對手的特色 ＋ 我方這場用的作戰 ＋ 宿敵對戰紀錄 */
function matchup(r) {
  const t = r.trait
    ? `<span class="trait"><b>${r.opponent}</b>${r.trait.name}
        <em>${r.trait.desc}</em></span>` : '';
  const tac = r.tacticName
    ? `<span class="trait trait--ours"><b>我方作戰</b>${r.tacticName}</span>` : '';
  const rv = r.rival?.isRival
    ? `<span class="trait trait--rival"><b>🔥 宿敵</b>
        生涯對戰 ${r.rival.wins}勝${r.rival.losses}敗（第 ${r.rival.meetings} 次交手）</span>` : '';
  return t || tac || rv ? `<div class="matchup">${t}${tac}${rv}</div>` : '';
}

/** 一場比賽的完整卡片 */
export function gameCard(r, index, open) {
  const won = r.won;
  const called = r.called ? `${r.called}局提前結束` : (r.innings > 9 ? `延長${r.innings}局` : '');
  return `
    <section class="game game--${won ? 'win' : 'lose'}${open ? ' is-open' : ''}" data-game="${index}">
      <button type="button" class="game__head">
        <span class="game__round">${r.round}</span>
        <span class="game__score">
          <b>${r.box.us.name}</b> ${r.score.us}
          <em>－</em> ${r.score.them} <b>${r.opponent}</b>
        </span>
        <span class="game__flag">${won ? '勝' : '敗'}</span>
        ${called ? `<span class="game__note">${called}</span>` : ''}
      </button>
      <div class="game__body"${open ? '' : ' hidden'}>
        ${matchup(r)}
        ${lineScore(r)}
        <h4 class="bs__h">打線</h4>
        ${battingTable(r.box.us)}
        <h4 class="bs__h">投手</h4>
        ${pitchingTable(r.box.us)}
        ${highlights(r)}
        ${growthBlock(r)}
      </div>
    </section>`;
}

/** 一週的比賽（最多三場）。預設全部收合，點了才展開 */
export function weekGames(results) {
  return `<div class="games">
    ${results.map((r, i) => gameCard(r, i, false)).join('')}
  </div>`;
}

/** 把展開／收合的點擊接起來 */
export function bindGameCards(root) {
  root.querySelectorAll('.game__head').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.game');
      const body = card.querySelector('.game__body');
      body.hidden = !body.hidden;
      card.classList.toggle('is-open', !body.hidden);
    });
  });
}
