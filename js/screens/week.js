import { currentWeek, availableActions, takeAction, isRunOver, teamStrength } from '../rules/game.js';
import { moraleLabel, efficiency } from '../rules/morale.js';
import { grade } from '../data/abilities.js';
import { overall, overallGrade } from '../rules/player.js';

const pct = (v) => `${Math.round(v * 100)}%`;

function moraleBox(game) {
  const c = game.morale.weeksSinceMatch;
  const eff = efficiency(c);
  const cls = eff === 1 ? 'good' : eff >= 0.75 ? 'mid' : 'bad';
  return `
    <div class="morale morale--${cls}">
      <span class="morale__label">士氣</span>
      <b>${moraleLabel(c)}</b>
      <span class="morale__eff">練習效率 ${pct(eff)}</span>
      <span class="morale__hint">距離上一場正式比賽 ${c} 週</span>
    </div>`;
}

function actionButtons(game) {
  const acts = availableActions(game);
  const menus = acts.filter((a) => a.kind === 'menu');
  const others = acts.filter((a) => a.kind === 'special');

  const btn = (a) => `
    <button type="button" class="act${a.todo ? ' act--todo' : ''}"
            data-act="${a.id}" ${a.todo ? 'disabled' : ''}>
      <b>${a.name}</b><span>${a.desc}</span>
    </button>`;

  return `
    <h3 class="sec">練習項目<span class="hint">（挑一個，全隊一起練）</span></h3>
    <div class="acts">${menus.map(btn).join('')}</div>
    <h3 class="sec">其他</h3>
    <div class="acts">${others.map(btn).join('')}</div>`;
}

function logList(game) {
  const items = game.log.slice(-12).reverse().map((l) => {
    if (l.results) {
      const rs = l.results.map((r) => `
        <span class="res res--${r.won ? 'win' : 'lose'}">${r.round} ${r.won ? '勝' : '敗'}</span>`).join('');
      return `<li class="log log--match"><span class="log__wk">#${l.week}</span>
        <span class="log__body"><b>${l.event}</b>${rs}</span></li>`;
    }
    const extra = l.trained
      ? `<span class="log__eff">效率 ${pct(l.efficiency)}</span>` : '';
    return `<li class="log log--${l.kind}"><span class="log__wk">#${l.week}</span>
      <span class="log__body">${l.event}
      ${l.action ? `→ <b>${l.action}</b>` : ''}${extra}</span></li>`;
  }).join('');
  return items ? `<ul class="logs">${items}</ul>`
    : '<p class="muted">還沒做過任何事。</p>';
}

export function renderWeek(root, game, onChange) {
  const w = currentWeek(game);
  const over = isRunOver(game);

  if (over) {
    const best = [...game.team.players].sort((a, b) => overall(b) - overall(a))[0];
    root.innerHTML = `
      <div class="over">
        <h2>三年結束了</h2>
        <p class="muted">這一局到此為止。看看你帶出來的隊伍吧。</p>
        <ul class="tally">
          <li><b>${teamStrength(game.team.players)}</b><span>最終戰力</span></li>
          <li><b class="g g--${overallGrade(best)}">${overallGrade(best)}</b><span>最強球員</span></li>
        </ul>
        ${resultTable(game)}
      </div>`;
    return;
  }

  const body = w.kind === 'match'
    ? `<div class="acts acts--match">
         <button type="button" class="act act--go" data-act="__play">
           <b>開始比賽</b><span>這一週要打 ${w.games.length} 場：${w.games.join('、')}</span>
         </button>
       </div>`
    : w.kind === 'training'
      ? actionButtons(game)
      : `<div class="acts acts--match">
           <button type="button" class="act act--go" data-act="__next">
             <b>下一步</b><span>${w.event}</span>
           </button>
         </div>`;

  root.innerHTML = `
    <div class="weekbar">
      <div class="weekbar__now">
        <span class="weekbar__pos">第 ${game.cursor.year} 年　第 ${game.cursor.week} 週</span>
        <h2 class="weekbar__event">${w.event}</h2>
        <span class="weekbar__month">${w.month}
          ・${w.eliminated ? '已淘汰，改成練習' : { match: '比賽週', training: '練習週', transition: '過場週' }[w.kind]}</span>
      </div>
      <div class="weekbar__str">
        <b>${teamStrength(game.team.players)}</b><span>目前戰力</span>
      </div>
    </div>

    ${w.kind === 'training' ? moraleBox(game) : ''}
    ${body}

    <h3 class="sec">最近發生的事</h3>
    ${logList(game)}`;

  root.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.act;
      const log = takeAction(game, id === '__play' || id === '__next' ? null : id);
      if (log) {
        game.log.push(log);
        if (game.log.length > 40) game.log = game.log.slice(-40);
      }
      onChange();
    });
  });
}

const PHASE_NAME = {
  regional: '地區大賽', koshien: '甲子園', autumn: '秋季縣大賽',
  autumnArea: '秋季地區大賽', senbatsu: '春季甲子園',
};

function resultTable(game) {
  const rows = game.progress.map((p, i) => {
    const cells = Object.entries(PHASE_NAME).map(([k, name]) => {
      const v = p[k];
      if (!v) return '<td class="muted">—</td>';
      return v.champion
        ? `<td class="win">${name} 優勝</td>`
        : `<td>${name} 止步於${v.lastRound}</td>`;
    }).join('');
    return `<tr><th>第 ${i + 1} 年</th>${cells}</tr>`;
  }).join('');
  return `<table class="results"><tbody>${rows}</tbody></table>`;
}
