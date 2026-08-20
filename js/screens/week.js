import { currentWeek, availableActions, takeAction, isRunOver, teamStrength } from '../rules/game.js';
import { moraleLabel, efficiency } from '../rules/morale.js';
import { overall, overallGrade } from '../rules/player.js';
import { active } from '../rules/roster.js';
import { isInjured } from '../rules/injury.js';
import { weekGames, bindGameCards } from './boxscore.js';
import { positionById } from '../data/abilities.js';
import {
  fameOf, candidateHint, growthName,
} from '../rules/scouting.js';
import {
  perkById, tacticById, eventById, choosePerk, resolveEvent, resolveTransfer, resolveAwaken,
} from '../rules/roguelike.js';

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

/** 已經拿到的傳統 */
function perkStrip(game) {
  const list = (game.perks || []).map((id) => perkById(id)).filter(Boolean);
  if (!list.length) return '';
  const items = list.map((p) => `
    <span class="perk"><b>${p.name}</b><em>${p.desc}</em></span>`).join('');
  return `<div class="perks"><span class="perks__label">傳統</span>${items}</div>`;
}

/** 三選一：選到的傳統整局都有效 */
function draftPanel(game) {
  const ids = game.pendingDraft || [];
  if (!ids.length) return '';
  const cards = ids.map((id) => {
    const p = perkById(id);
    return `
      <button type="button" class="card-pick" data-act="draft:${p.id}">
        <b class="card-pick__name">${p.name}</b>
        <span class="card-pick__desc">${p.desc}</span>
      </button>`;
  }).join('');
  return `
    <div class="draft">
      <h3 class="draft__title">選一個傳統</h3>
      <p class="draft__lead">選到的效果<strong>整局都有效</strong>，拿了就不能換。
        一局只有 5 次機會。</p>
      <div class="picks">${cards}</div>
    </div>`;
}

/** 突發事件：兩個選項，各有好壞 */
function eventPanel(game) {
  const ev = eventById(game.pendingEvent);
  if (!ev) return '';
  const opts = ev.options.map((o, i) => `
    <button type="button" class="card-pick card-pick--opt" data-act="event:${i}">
      <b class="card-pick__name">${o.label}</b>
      <span class="card-pick__desc">${o.hint}</span>
    </button>`).join('');
  return `
    <div class="event">
      <h3 class="event__title">${ev.title}</h3>
      <p class="event__text">${ev.text}</p>
      <div class="picks picks--two">${opts}</div>
    </div>`;
}

/** 轉學生：一年一定會遇到一次，兩個選項都會讓他入隊 */
function transferPanel(game) {
  const t = game.pendingTransfer;
  if (!t) return '';
  const { player: p, superstar } = t;
  const pos = positionById(p.position)?.short || '';
  const stars = '★'.repeat(p.talent) + '☆'.repeat(5 - p.talent);
  return `
    <div class="event event--transfer${superstar ? ' event--superstar' : ''}">
      <h3 class="event__title">${superstar ? '轉學生降臨？！' : '轉來一個轉學生'}</h3>
      <p class="event__text">
        <b>${p.name}</b>（${pos}・${p.gradeYear}年級）從別的學校轉來，說想加入棒球社。
        天賦 <span class="cand__talent">${stars}</span>
        ${superstar ? '<span class="superstar-tag">傳說中的等級</span>' : ''}
      </p>
      <div class="picks picks--two">
        <button type="button" class="card-pick card-pick--opt" data-act="transfer:warm">
          <b class="card-pick__name">熱烈歡迎</b>
          <span class="card-pick__desc">士氣變好</span>
        </button>
        <button type="button" class="card-pick card-pick--opt" data-act="transfer:quiet">
          <b class="card-pick__name">照常訓練</b>
          <span class="card-pick__desc">全隊打擊小漲一點</span>
        </button>
      </div>
    </div>`;
}

/** 能力覺醒：賭下去，或先算了 */
function awakenPanel(game) {
  const a = game.pendingAwaken;
  if (!a) return '';
  const { player: p, skill } = a;
  return `
    <div class="event event--awaken">
      <h3 class="event__title">能力覺醒的預感</h3>
      <p class="event__text">
        <b>${p.name}</b> 練出手感了，好像快要學會「<b>${skill.name}</b>」
        （${skill.desc}）。要不要賭一把？
      </p>
      <div class="picks picks--two">
        <button type="button" class="card-pick card-pick--opt" data-act="awaken:bet">
          <b class="card-pick__name">賭下去</b>
          <span class="card-pick__desc">贏了學會技能，輸了能力會掉、或多一個壞習慣</span>
        </button>
        <button type="button" class="card-pick card-pick--opt" data-act="awaken:pass">
          <b class="card-pick__name">先算了</b>
          <span class="card-pick__desc">不冒險，這個機會以後可能還會再來</span>
        </button>
      </div>
    </div>`;
}

/** 比賽週：開打前選一個作戰 */
function tacticPanel(game) {
  const ids = game.tacticChoices || [];
  if (!ids.length) return '';
  const cards = ids.map((id) => {
    const t = tacticById(id);
    const on = game.tactic === id;
    return `
      <button type="button" class="card-pick${on ? ' is-picked' : ''}" data-act="tactic:${t.id}">
        <b class="card-pick__name">${t.name}</b>
        <span class="card-pick__desc">${t.desc}</span>
      </button>`;
  }).join('');
  return `
    <div class="draft draft--tactic">
      <h3 class="draft__title">這一週的作戰</h3>
      <p class="draft__lead">只影響這一週的比賽。打完就換一批新的。</p>
      <div class="picks">${cards}</div>
    </div>`;
}

function actionButtons(game) {
  const acts = availableActions(game);
  const menus = acts.filter((a) => a.kind === 'menu');
  // 招生要挑對象，所以不放在一般按鈕裡，另外做一塊
  const others = acts.filter((a) => a.kind === 'special' && a.id !== 'scout');

  const btn = (a) => `
    <button type="button" class="act${a.todo ? ' act--todo' : ''}"
            data-act="${a.id}" ${a.todo ? 'disabled' : ''}>
      <b>${a.name}</b><span>${a.desc}</span>
    </button>`;

  return `
    ${scoutingPanel(game)}
    <h3 class="sec">練習項目<span class="hint">（挑一個，全隊一起練）</span></h3>
    <div class="acts">${menus.map(btn).join('')}</div>
    <h3 class="sec">其他</h3>
    <div class="acts">${others.map(btn).join('')}</div>`;
}

/** 招生：冬天的六週可以去看國中生 */
function scoutingPanel(game) {
  const w = currentWeek(game);
  if (w?.phase !== 'winter' || !game.scouting?.candidates?.length) return '';

  const year = game.schedule[game.cursor.year - 1];
  const closeAt = year.findIndex((x) => x.scoutClose);
  const left = Math.max(0, closeAt - (game.cursor.week - 1) + 1);
  const fame = fameOf(game);

  const rows = game.scouting.candidates.map((c) => {
    const done = c.interest >= c.threshold;
    const w2 = Math.min(100, (c.interest / c.threshold) * 100);
    return `
      <li class="cand${done ? ' is-in' : ''}">
        <span class="cand__pos">${positionById(c.position)?.short || ''}</span>
        <span class="cand__name">${c.name}</span>
        <span class="cand__talent">${'★'.repeat(c.talent)}${'☆'.repeat(5 - c.talent)}</span>
        <span class="cand__growth">${c.known ? growthName(c.growthType) : '？'}</span>
        <span class="cand__bar"><i style="width:${w2}%"></i></span>
        <span class="cand__num">${c.interest}<em>/${c.threshold}</em></span>
        <span class="cand__hint">${candidateHint(c)}</span>
        ${done
    ? '<span class="cand__ok">確定</span>'
    : `<button type="button" class="btn btn--tiny" data-act="scout:${c.id}">去看</button>`}
      </li>`;
  }).join('');

  return `
    <h3 class="sec">招生
      <span class="hint">注目度 ${fame}　招生截止還有 ${left} 週</span>
    </h3>
    <p class="scout__lead">去看一次就多一分好感，好感度到門檻他就會來。
      <b>天賦越高門檻越高</b>——天才要花好幾次拜訪才追得到。
      <b>贏球會讓招生變容易</b> —— 注目度高的話，好學生一開始就有好感。</p>
    <ul class="cands">${rows}</ul>`;
}

/** 上一週做了什麼、隊伍長了多少。這是玩家最想看到的回饋 */
function lastResultBox(game) {
  const l = game.log[game.log.length - 1];
  if (!l) return '';

  if (l.results) {
    const lost = l.results.some((r) => !r.won);
    return `
      <div class="last last--${lost ? 'lose' : 'win'}">
        <span class="last__head">上一週：${l.event}</span>
        ${weekGames(l.results)}
        ${lost ? '<p class="last__note">被淘汰了。後面的比賽週會變成練習週。</p>' : ''}
      </div>`;
  }

  if (l.scoutResult) {
    const j = l.scoutResult.joined.map((x) => `
      <li><b>${x.name}</b> ${positionById(x.position)?.short || ''}
        <span class="cand__talent">${'★'.repeat(x.talent)}</span></li>`).join('');
    const m = l.scoutResult.missed.map((x) => `
      <li class="muted">${x.name} ★${x.talent}（好感度只有 ${x.interest}，跑掉了）</li>`).join('');
    return `<div class="last last--${j ? 'win' : 'lose'}">
      <span class="last__head">上一週：招生截止</span>
      ${j ? `<h4 class="bs__h">確定入學（四月報到）</h4><ul class="grew">${j}</ul>` : ''}
      ${m ? `<h4 class="bs__h">沒招到</h4><ul class="grew">${m}</ul>` : ''}
      ${!j ? '<p class="last__note">一個都沒招到。四月會有幾個自己來的，但都很弱。</p>' : ''}
    </div>`;
  }

  if (l.eventResult) {
    const e = l.eventResult;
    return `<div class="last last--plain">
      <span class="last__head">突發事件：${e.title}</span>
      <p class="last__note">你選了「<b>${e.choice}</b>」。${e.result}</p>
    </div>`;
  }

  if (l.transferResult) {
    const t = l.transferResult;
    return `<div class="last last--win${t.superstar ? ' last--superstar' : ''}">
      <span class="last__head">${l.event}</span>
      <p class="last__note">
        <b>${t.name}</b> ${positionById(t.position)?.short || ''}・${t.gradeYear}年級
        <span class="cand__talent">${'★'.repeat(t.talent)}${'☆'.repeat(5 - t.talent)}</span>
        ${t.superstar ? '<span class="superstar-tag">傳說中的等級</span>' : ''}
        加入球隊了。${t.note}
      </p>
    </div>`;
  }

  if (l.awakenResult) {
    const a = l.awakenResult;
    const cls = a.outcome === 'success' ? 'win' : a.outcome === 'pass' ? 'plain' : 'lose';
    return `<div class="last last--${cls}">
      <span class="last__head">能力覺醒：${a.name}（${a.skill}）</span>
      <p class="last__note">${a.note}</p>
    </div>`;
  }

  if (l.scoutVisit) {
    return `<div class="last last--plain">
      <span class="last__head">上一週：${l.action}</span>
      <div class="last__row">
        <span class="delta"><i>好感度</i><b>+${l.scoutVisit.gained}</b></span>
        <span class="muted">現在 ${l.scoutVisit.interest} / ${l.scoutVisit.threshold}</span>
      </div>
    </div>`;
  }

  if (l.retired) {
    return `<div class="last last--plain">
      <span class="last__head">上一週：${l.event}</span>
      <p class="last__note">三年級 ${l.retired} 人退隊，已經從名單上移除。</p>
      ${l.joined ? `<p class="last__note">人數不夠 9 個，
        校內有 ${l.joined} 個同學來入部（都很弱）。</p>` : ''}
    </div>`;
  }

  if (!l.gains) return '';

  const deltas = l.gains.avg.map((g) => `
    <span class="delta"><i>${g.name}</i><b>+${g.value.toFixed(1)}</b></span>`).join('');
  const ups = l.gains.ups.slice(0, 6).map((u) => `
    <li><b>${u.name}</b> ${u.stat}
      <span class="g g--${u.from}">${u.from}</span> →
      <span class="g g--${u.to}">${u.to}</span></li>`).join('');
  const more = l.gains.ups.length > 6
    ? `<li class="muted">還有 ${l.gains.ups.length - 6} 個人升級</li>` : '';

  return `
    <div class="last last--train">
      <span class="last__head">上一週：${l.action}
        <em>效率 ${pct(l.efficiency)}</em>
        ${l.boost ? `<em class="boost">事件加成 ×${l.boost.toFixed(2)}</em>` : ''}</span>
      <div class="last__row">${deltas || '<span class="muted">沒什麼變化</span>'}</div>
      ${ups ? `<ul class="ups">${ups}${more}</ul>` : ''}
      ${(l.injured || []).length ? `<ul class="injs">${l.injured.map((x) => `
        <li class="inj inj--${x.severity}"><b>${x.name}</b> 練習時${x.label}（${x.cause}）
          休養 ${x.weeks} 週、能力 −${x.drop}
          ${x.permanent ? `<span class="inj__perm">上限永久 −${x.permanent}</span>` : ''}
        </li>`).join('')}</ul>` : ''}
    </div>`;
}

/** 現在有誰在養傷 */
function injuryList(game) {
  const hurt = active(game.team.players).filter(isInjured)
    .sort((a, b) => b.injury.weeks - a.injury.weeks);
  if (!hurt.length) return '';
  const items = hurt.map((p) => `
    <li class="inj inj--${p.injury.severity}">
      <b>${p.name}</b> ${p.injury.name}（${p.injury.cause}）
      <span class="inj__weeks">還要 ${p.injury.weeks} 週</span>
    </li>`).join('');
  return `<h3 class="sec">養傷中<span class="hint">（不能上場也不會練習）</span></h3>
    <ul class="injs">${items}</ul>`;
}

function logList(game) {
  const items = game.log.slice(-12).reverse().map((l) => {
    if (l.results) {
      const rs = l.results.map((r) => `
        <span class="res res--${r.won ? 'win' : 'lose'}">${r.round} ${r.won ? '勝' : '敗'}</span>`).join('');
      return `<li class="log log--match"><span class="log__wk">#${l.week}</span>
        <span class="log__body"><b>${l.event}</b>${rs}</span></li>`;
    }
    if (l.eventResult) {
      return `<li class="log log--event"><span class="log__wk">#${l.week}</span>
        <span class="log__body">${l.eventResult.title}
        → <b>${l.eventResult.choice}</b></span></li>`;
    }
    if (l.transferResult) {
      return `<li class="log log--transfer"><span class="log__wk">#${l.week}</span>
        <span class="log__body">${l.event}
        → <b>${l.transferResult.name}</b></span></li>`;
    }
    if (l.awakenResult) {
      return `<li class="log log--awaken"><span class="log__wk">#${l.week}</span>
        <span class="log__body">${l.event}（${l.awakenResult.name}）
        → <b>${{ success: '學會了', fail: '賭輸了', pass: '先算了' }[l.awakenResult.outcome]}</b></span></li>`;
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

  // 三選一還沒選就什麼都不能做 —— 這是整局最重要的選擇
  if (game.pendingDraft?.length) {
    root.innerHTML = weekBar(game, w) + perkStrip(game) + draftPanel(game);
    bindActions(root, game, onChange);
    return;
  }

  const ready = !game.tacticChoices?.length || !!game.tactic;

  const body = w.kind === 'match'
    ? `${tacticPanel(game)}
       <div class="acts acts--match">
         <button type="button" class="act act--go" data-act="__play" ${ready ? '' : 'disabled'}>
           <b>${ready ? '開始比賽' : '先選一個作戰'}</b>
           <span>這一週要打 ${w.games.length} 場：${w.games.join('、')}</span>
         </button>
       </div>`
    : w.kind === 'training'
      ? (game.pendingTransfer ? transferPanel(game)
        : game.pendingAwaken ? awakenPanel(game)
          : game.pendingEvent ? eventPanel(game) : actionButtons(game))
      : `<div class="acts acts--match">
           <button type="button" class="act act--go" data-act="__next">
             <b>下一步</b><span>${w.event}</span>
           </button>
         </div>`;

  root.innerHTML = `
    ${weekBar(game, w)}
    ${perkStrip(game)}
    ${lastResultBox(game)}
    ${w.kind === 'training' && !game.pendingEvent && !game.pendingTransfer && !game.pendingAwaken ? moraleBox(game) : ''}
    ${body}

    ${injuryList(game)}

    <h3 class="sec">最近發生的事</h3>
    ${logList(game)}`;

  bindGameCards(root);
  bindActions(root, game, onChange);
}

function weekBar(game, w) {
  const kind = { match: '比賽週', training: '練習週', transition: '過場週' }[w.kind];
  return `
    <div class="weekbar">
      <div class="weekbar__now">
        <span class="weekbar__pos">第 ${game.cursor.year} 年　第 ${game.cursor.week} 週</span>
        <h2 class="weekbar__event">${w.event}</h2>
        <span class="weekbar__month">${w.month}
          ・${w.eliminated ? '已淘汰，改成練習' : kind}</span>
      </div>
      <div class="weekbar__str">
        <b>${teamStrength(game.team.players)}</b><span>目前戰力</span>
      </div>
    </div>`;
}

/** 按鈕。三選一、事件、作戰不會讓時間往前走，其他的會 */
function bindActions(root, game, onChange) {
  const push = (log) => {
    if (!log) return;
    game.log.push(log);
    if (game.log.length > 40) game.log = game.log.slice(-40);
  };

  root.querySelectorAll('[data-act]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.act;

      if (id.startsWith('draft:')) {
        choosePerk(game, id.slice(6));
        onChange();
        return;
      }
      if (id.startsWith('event:')) {
        push(resolveEvent(game, Number(id.slice(6))));
        onChange();
        return;
      }
      if (id.startsWith('transfer:')) {
        push(resolveTransfer(game, id.slice(9)));
        onChange();
        return;
      }
      if (id.startsWith('awaken:')) {
        push(resolveAwaken(game, id.slice(7)));
        onChange();
        return;
      }
      if (id.startsWith('tactic:')) {
        game.tactic = id.slice(7);
        onChange();
        return;
      }

      push(takeAction(game, id === '__play' || id === '__next' ? null : id));
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
