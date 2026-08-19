import { UI } from '../strings.js';

const KIND_LABEL = { match: '試合', training: '育成', transition: '過渡' };

/**
 * 就任後の確認画面。ゲームループ実装までの暫定画面で、
 * 生成されたラン全体の週スケジュールを表示する。
 */
export function renderSchedule(root, game, onReset) {
  const { manager, school, difficulty, schedule } = game;

  const years = schedule.map((weeks, i) => `
    <section class="year">
      <h3 class="year__title">
        ${UI.yearLabels[i]}
        <span class="year__count">${weeks.length} ${UI.unitWeek}</span>
      </h3>
      <ol class="weeks">
        ${weeks.map((w) => `
          <li class="week week--${w.kind}${w.conditional ? ' is-conditional' : ''}">
            <span class="week__abs">${w.abs}</span>
            <span class="week__month">${w.month}</span>
            <span class="week__event">${w.event}</span>
            <span class="week__kind">${KIND_LABEL[w.kind]}${w.conditional ? '※' : ''}</span>
          </li>`).join('')}
      </ol>
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

      <p class="notice">
        進入畫面已完成。以下是依所選都道府県自動生成的完整賽程，遊戲主迴圈尚未實作。
        <strong>※</strong> 為條件性週次，敗退時轉為育成週。
      </p>

      <div class="years">${years}</div>

      <button type="button" class="btn btn--ghost btn--wide" id="resetBtn">重新開始</button>
    </div>`;

  root.querySelector('#resetBtn').addEventListener('click', onReset);
}
