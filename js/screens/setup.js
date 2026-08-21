import { REGIONS, byRegion, byId, TOTAL_TEAMS, REPRESENTATIVES } from '../data/prefectures.js';
import { runSummary } from '../data/calendar.js';
import { UI, randomManagerName, randomSchoolName } from '../strings.js';
import { calendarYear } from '../rules/game.js';

const stars = (n) => '★'.repeat(n) + '☆'.repeat(4 - n);

export function renderSetup(root, onStart) {
  let regionId = REGIONS[0].id;
  let prefId = null;

  root.innerHTML = `
    <div class="screen setup">
      <header class="masthead">
        <h1 class="masthead__title">${UI.appTitle}</h1>
        <p class="masthead__sub">${UI.appSubtitle}</p>
        <p class="masthead__meta">全國 ${REPRESENTATIVES} 區・${TOTAL_TEAMS.toLocaleString()} ${UI.unitTeam}</p>
      </header>

      <div class="setup__body">
        <section class="card">
          <h2 class="card__title">${UI.setupHeading}</h2>
          <p class="card__lead">${UI.setupLead}</p>

          <label class="field">
            <span class="field__label">${UI.managerLabel}</span>
            <span class="field__row">
              <input id="managerName" type="text" maxlength="20"
                     placeholder="${UI.managerPlaceholder}" autocomplete="off">
              <button type="button" class="btn btn--ghost" data-roll="manager">${UI.randomBtn}</button>
            </span>
          </label>

          <label class="field">
            <span class="field__label">${UI.schoolLabel}</span>
            <span class="field__row">
              <input id="schoolName" type="text" maxlength="24"
                     placeholder="${UI.schoolPlaceholder}" autocomplete="off">
              <button type="button" class="btn btn--ghost" data-roll="school">${UI.randomBtn}</button>
            </span>
          </label>

          <div class="field">
            <span class="field__label">${UI.regionLabel}</span>
            <div class="chips" id="regionChips"></div>
          </div>

          <div class="field">
            <span class="field__label">${UI.prefectureLabel}</span>
            <div class="chips chips--pref" id="prefChips"></div>
          </div>

          <p class="error" id="setupError" role="alert" hidden></p>
          <button type="button" class="btn btn--primary btn--wide" id="startBtn">${UI.startBtn}</button>
        </section>

        <aside class="card card--brief">
          <h2 class="card__title">${UI.briefHeading}</h2>
          <div id="brief"><p class="muted">${UI.briefEmpty}</p></div>
        </aside>
      </div>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const regionChips = $('#regionChips');
  const prefChips = $('#prefChips');
  const brief = $('#brief');
  const errorEl = $('#setupError');

  function drawRegions() {
    regionChips.innerHTML = REGIONS.map((r) =>
      `<button type="button" class="chip${r.id === regionId ? ' is-active' : ''}"
               data-region="${r.id}">${r.name}</button>`).join('');
  }

  function drawPrefs() {
    prefChips.innerHTML = byRegion(regionId).map((p) =>
      `<button type="button" class="chip chip--pref${p.id === prefId ? ' is-active' : ''}"
               data-pref="${p.id}">
         <span class="chip__name">${p.name}</span>
         <span class="chip__meta">${p.teams}${UI.unitTeam}</span>
       </button>`).join('');
  }

  function drawBrief() {
    if (!prefId) {
      brief.innerHTML = `<p class="muted">${UI.briefEmpty}</p>`;
      return;
    }
    const p = byId(prefId);
    const s = runSummary(p.wins);
    brief.innerHTML = `
      <p class="brief__pref">${p.name}</p>
      <dl class="brief">
        <dt>${UI.briefTeams}</dt><dd>${p.teams} ${UI.unitTeam}</dd>
        <dt>${UI.briefWins}</dt><dd>${p.wins} ${UI.unitWin}</dd>
        <dt>${UI.briefTier}</dt>
        <dd><span class="tier tier--${p.tierId}">${p.label}</span>
            <span class="stars">${stars(p.stars)}</span></dd>
        <dt>${UI.briefScout}</dt><dd><span class="stars">${stars(p.scoutPool)}</span></dd>
        <dt>${UI.briefRunLength}</dt><dd>${s.total} ${UI.unitWeek}</dd>
        <dt>${UI.briefYears}</dt>
        <dd>${s.years.map((n, i) => `${calendarYear(i + 1)}年 ${n}${UI.unitWeek}`).join(' ／ ')}</dd>
      </dl>
      <p class="brief__split">
        <span class="swatch swatch--match"></span>${UI.kindMatch} ${s.match}
        <span class="swatch swatch--training"></span>${UI.kindTraining} ${s.training}
        <span class="swatch swatch--transition"></span>${UI.kindTransition} ${s.transition}
      </p>`;
  }

  function fail(msg, focusSel) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    if (focusSel) $(focusSel).focus();
  }

  regionChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-region]');
    if (!b) return;
    regionId = b.dataset.region;
    drawRegions();
    drawPrefs();
  });

  prefChips.addEventListener('click', (e) => {
    const b = e.target.closest('[data-pref]');
    if (!b) return;
    prefId = b.dataset.pref;
    errorEl.hidden = true;
    drawPrefs();
    drawBrief();
  });

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-roll]');
    if (!b) return;
    if (b.dataset.roll === 'manager') $('#managerName').value = randomManagerName();
    else $('#schoolName').value = randomSchoolName();
    errorEl.hidden = true;
  });

  root.querySelectorAll('input').forEach((el) =>
    el.addEventListener('input', () => { errorEl.hidden = true; }));

  $('#startBtn').addEventListener('click', () => {
    const managerName = $('#managerName').value.trim();
    const schoolName = $('#schoolName').value.trim();
    if (!managerName) return fail(UI.errName, '#managerName');
    if (!schoolName) return fail(UI.errSchool, '#schoolName');
    if (!prefId) return fail(UI.errPref);
    onStart({ managerName, schoolName, prefectureId: prefId });
  });

  drawRegions();
  drawPrefs();
  drawBrief();
}
