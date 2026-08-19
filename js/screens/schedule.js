import { UI } from '../strings.js';
import { runSummary } from '../data/calendar.js';

const KIND_LABEL = {
  match: UI.kindMatch,
  training: UI.kindTraining,
  transition: UI.kindTransition,
};

/**
 * 上任之後的確認畫面。遊戲主要玩法還沒做，
 * 這裡先把整局的賽程表列出來。
 */
export function renderSchedule(root, game, onReset) {
  const { manager, school, difficulty, schedule } = game;
  const s = runSummary(difficulty.wins);

  const week = (w) => {
    let badge = '<span class="week__games"></span>';
    if (w.kind === 'match') {
      badge = `<span class="week__games">${w.games.length} ${UI.unitGame}</span>`;
    } else if (w.defaultPractice) {
      badge = `<span class="week__games week__games--practice">${UI.badgePractice}</span>`;
    } else if (w.canPractice) {
      badge = `<span class="week__games week__games--optional">${UI.badgeCanPractice}</span>`;
    }
    return `
      <li class="week week--${w.kind}${w.conditional ? ' is-conditional' : ''}">
        <span class="week__abs">${w.abs}</span>
        <span class="week__month">${w.month}</span>
        <span class="week__event">${w.event}</span>
        ${badge}
        <span class="week__kind">${KIND_LABEL[w.kind]}${w.conditional ? '※' : ''}</span>
      </li>`;
  };

  const years = schedule.map((weeks, i) => `
    <section class="year">
      <h3 class="year__title">
        ${UI.yearLabels[i]}
        <span class="year__count">${weeks.length} ${UI.unitWeek}</span>
      </h3>
      <ol class="weeks">${weeks.map(week).join('')}</ol>
    </section>`).join('');

  root.innerHTML = `
    <div class="screen schedule-screen">
      <header class="masthead masthead--compact">
        <h1 class="masthead__title">${school.name}</h1>
        <p class="masthead__sub">${school.prefectureName}　監督 ${manager.name}</p>
        <p class="masthead__meta">
          ${difficulty.teams} ${UI.unitTeam}／${UI.toKoshien} ${difficulty.wins} ${UI.unitWin}
          ・<span class="tier">${difficulty.tier}</span>
        </p>
      </header>

      <ul class="tally">
        <li><b>${s.total}</b><span>${UI.tallyTotal}</span></li>
        <li><b>${s.officialGames}</b><span>${UI.tallyOfficial}</span></li>
        <li><b>${s.practiceSlots}</b><span>${UI.tallyPractice}</span></li>
        <li><b>${s.match}</b><span>${UI.tallyMatchWeek}</span></li>
        <li><b>${s.training}</b><span>${UI.tallyTrainWeek}</span></li>
        <li><b>${s.transition}</b><span>${UI.tallyTransWeek}</span></li>
      </ul>

      <p class="notice">
        ${UI.scheduleNote}<strong>※</strong> ${UI.scheduleNote2}
      </p>

      <div class="years">${years}</div>

      <button type="button" class="btn btn--ghost btn--wide" id="resetBtn">${UI.resetBtn}</button>
    </div>`;

  root.querySelector('#resetBtn').addEventListener('click', onReset);
}
