import {
  BATTER_STATS, PITCHER_STATS, POSITIONS, positionById, grade, skillById, GROWTH_TYPES,
} from '../data/abilities.js';
import {
  overall, overallGrade, isPitcher, playerVelocity, fieldingAt,
} from '../rules/player.js';
import { rosterSummary, ROSTER_LIMIT, active } from '../rules/roster.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const gradeYearLabel = (n) => `${n}年`;

/** 一列球員（收合狀態） */
function playerRow(p) {
  const pos = positionById(p.position);
  const main = isPitcher(p) ? PITCHER_STATS : BATTER_STATS;
  const chips = main
    .map((s) => {
      const g = grade(p.abilities[s.id]);
      return `<span class="stat"><i>${s.name}</i><b class="g g--${g}">${g}</b></span>`;
    })
    .join('');
  const skills = p.skills
    .map((id) => skillById(id))
    .map((s) => `<span class="skill skill--${s.good ? 'good' : 'bad'}">${s.name}</span>`)
    .join('');

  const gt = GROWTH_TYPES[p.growthType] || GROWTH_TYPES.normal;

  return `
    <li class="player" data-player="${p.id}">
      <button type="button" class="player__head">
        <span class="player__year y${p.gradeYear}">${gradeYearLabel(p.gradeYear)}</span>
        <span class="player__pos">${pos.short}</span>
        <span class="player__name">${p.name}</span>
        <span class="growth growth--${gt.id}">${gt.name}</span>
        <span class="player__talent">${stars(p.talent)}</span>
        <span class="player__ovr g g--${overallGrade(p)}">${overallGrade(p)}</span>
      </button>
      <div class="player__stats">${chips}</div>
      ${skills ? `<div class="player__skills">${skills}</div>` : ''}
      <div class="player__detail" hidden></div>
    </li>`;
}

/** 展開後的完整資料 */
function playerDetail(p) {
  const row = (list) => list.map((s) => {
    const v = Math.round(p.abilities[s.id]);
    const cap = Math.round(p.potential?.[s.id] ?? v);
    const g = grade(v);
    const extra = s.id === 'velocity' ? ` <i>${playerVelocity(p)} km/h</i>` : '';
    // 進度條：現在練到哪、上限在哪
    const bar = `<span class="bar"><i style="width:${Math.min(100, v)}%"></i>
      <u style="width:${Math.min(100, cap)}%"></u></span>`;
    return `<tr>
      <td>${s.name}</td>
      <td class="g g--${g}">${g}</td>
      <td class="barcell">${bar}</td>
      <td class="num">${v}<em>/${cap}</em>${extra}</td>
    </tr>`;
  }).join('');

  const gt = GROWTH_TYPES[p.growthType] || GROWTH_TYPES.normal;

  const apt = POSITIONS.map((pos) => {
    const a = p.aptitudes[pos.id];
    return `<span class="apt"><i>${pos.short}</i><b class="g g--${a}">${a}</b>
      <em>${fieldingAt(p, pos.id)}</em></span>`;
  }).join('');

  const skills = p.skills.map((id) => {
    const s = skillById(id);
    return `<li class="skill-line skill-line--${s.good ? 'good' : 'bad'}">
      <b>${s.name}</b><span>${s.desc}</span></li>`;
  }).join('');

  return `
    <p class="growth-line">
      成長期 <span class="growth growth--${gt.id}">${gt.name}</span>
      <span class="muted">${gt.desc}</span>
    </p>
    <div class="detail__grid">
      <div>
        <h4>打者能力<span class="hint">（現在／上限）</span></h4>
        <table class="abil">${row(BATTER_STATS)}</table>
      </div>
      <div>
        <h4>投手能力<span class="hint">（現在／上限）</span></h4>
        <table class="abil">${row(PITCHER_STATS)}</table>
      </div>
    </div>
    <h4>守備適性<span class="hint">（數字＝放在那個位置時的守備）</span></h4>
    <div class="apts">${apt}</div>
    <h4>特殊能力</h4>
    ${skills ? `<ul class="skill-lines">${skills}</ul>` : '<p class="muted">沒有特殊能力。</p>'}
    <p class="muted">${p.throws === 'L' ? '左投' : '右投'}${p.bats === 'L' ? '左打' : '右打'}
      ・整體評價 ${overall(p)}</p>`;
}

export function renderRoster(root, game) {
  // 退隊的三年級不顯示。他們還在學校，但不再上場了。
  const players = active(game.team.players);
  const s = rosterSummary(game.team.players);
  const arch = game.team.archetype;

  const groups = [3, 2, 1].map((gy) => {
    const list = players.filter((p) => p.gradeYear === gy);
    if (!list.length) return '';
    return `
      <section class="grade-group">
        <h3 class="grade-group__title">
          ${gradeYearLabel(gy)}
          <span class="grade-group__count">${list.length} 人</span>
          ${gy === 3 ? '<span class="warn">八月退隊</span>' : ''}
        </h3>
        <ul class="players">${list.map(playerRow).join('')}</ul>
      </section>`;
  }).join('');

  root.innerHTML = `
    <div class="roster">
      <div class="archetype archetype--${arch.id}">
        <b>${arch.name}</b>
        <span>${arch.desc}</span>
      </div>

      <ul class="tally">
        <li><b>${s.total}</b><span>總人數</span></li>
        ${s.retired
    ? `<li><b>${s.retired}</b><span>已退隊</span></li>`
    : `<li><b>${s.byGrade[3]}</b><span>三年級</span></li>
           <li><b>${s.afterGraduation}</b><span>八月後剩下</span></li>`}
        <li><b>${s.pitchers}</b><span>投手</span></li>
        <li><b class="g g--${grade(s.overall)}">${grade(s.overall)}</b><span>隊伍平均</span></li>
        <li><b class="g g--${overallGrade(s.best)}">${overallGrade(s.best)}</b><span>最強球員</span></li>
      </ul>

      ${s.overLimit > 0 ? `<p class="notice">
        比賽只能登錄 ${ROSTER_LIMIT} 人，你現在有 ${s.total} 人。
        <strong>七月抽籤那一週要砍掉 ${s.overLimit} 個人。</strong>
      </p>` : ''}

      ${groups}
    </div>`;

  root.querySelectorAll('.player__head').forEach((btn) => {
    btn.addEventListener('click', () => {
      const li = btn.closest('.player');
      const box = li.querySelector('.player__detail');
      const p = players.find((x) => x.id === li.dataset.player);
      if (box.hidden) {
        box.innerHTML = playerDetail(p);
        box.hidden = false;
        li.classList.add('is-open');
      } else {
        box.hidden = true;
        li.classList.remove('is-open');
      }
    });
  });
}
