import { UI } from '../strings.js';
import { runSummary } from '../data/calendar.js';

const KIND_LABEL = { match: '試合', training: '育成', transition: '過渡' };

/**
 * 就任後の確認画面。ゲームループ実装までの暫定画面で、
 * 生成されたラン全体の週スケジュールを表示する。
 */
export function renderSchedule(root, game, onReset) {
  const { manager, school, difficulty, schedule } = game;
  const s = runSummary(difficulty.wins);

  const week = (w) => {
    const games = w.games.length;
    const badge =
      w.kind === 'match'
        ? `<span class="week__games">${games}試合</span>`
        : games
          ? '<span class="week__games week__games--practice">1試合</span>'
          : '<span class="week__games"></span>';
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
          ${difficulty.teams}${UI.unitTeam}／甲子園まで ${difficulty.wins}${UI.unitWin}
          ・<span class="tier">${difficulty.tier}</span>
        </p>
      </header>

      <ul class="tally">
        <li><b>${s.total}</b><span>總週數</span></li>
        <li><b>${s.officialGames}</b><span>公式戦</span></li>
        <li><b>${s.practiceGames}</b><span>練習試合</span></li>
        <li><b>${s.match}</b><span>試合週</span></li>
        <li><b>${s.training}</b><span>育成週</span></li>
        <li><b>${s.transition}</b><span>過渡週</span></li>
      </ul>

      <p class="notice">
        公式戦は 1 週最大 3 試合、練習試合は 1 週 1 試合。
        <strong>※</strong> 為條件性週次，敗退時轉為育成週。遊戲主迴圈尚未實作。
      </p>

      <div class="years">${years}</div>

      <button type="button" class="btn btn--ghost btn--wide" id="resetBtn">重新開始</button>
    </div>`;

  root.querySelector('#resetBtn').addEventListener('click', onReset);
}
