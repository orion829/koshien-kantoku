// 主頁面的一年時間線
//
// 把「你現在在這一年的哪裡」畫成一條橫線。
// 每一格是一週，顏色代表比賽／練習／過場，
// 下面再用一整排標出季節（春季練習、夏季大賽……）。

const PHASE_GROUP = {
  newterm: 'spring', practice: 'spring', pretourn: 'spring',
  regional: 'summer', koshien: 'summer',
  handover: 'autumn', autumn: 'autumn', autumnArea: 'autumn',
  winter: 'winter',
  senbatsu: 'senbatsu',
};

const GROUP_LABEL = {
  spring: '春季練習', summer: '夏季大賽', autumn: '秋季大賽',
  winter: '冬季招生', senbatsu: '春季甲子園',
};

/** 把同一季節的週數接在一起，算出每一段要佔多寬 */
function phaseSpans(weeks) {
  const spans = [];
  weeks.forEach((w) => {
    const g = PHASE_GROUP[w.phase] || 'spring';
    const last = spans[spans.length - 1];
    if (last && last.group === g) last.count += 1;
    else spans.push({ group: g, count: 1 });
  });
  return spans;
}

export function renderTimeline(game) {
  const weeks = game.schedule[game.cursor.year - 1];
  if (!weeks?.length) return '';

  const idx = game.cursor.week - 1;
  const weights = weeks.map((w) => Math.max(1, w.games?.length || 1));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const before = weights.slice(0, idx).reduce((a, b) => a + b, 0);
  // 指標放在「現在這一格」的正中間，不是格子邊界
  const markerPct = ((before + weights[idx] / 2) / totalWeight) * 100;

  const cells = weeks.map((w, i) => {
    // w.week 是原始賽程裡的編號，第1年被切過所以對不上游標，用陣列位置比對才準
    const now = i === idx;
    return `<span class="tl tl--${w.kind}${now ? ' is-now' : ''}"
      style="flex:${weights[i]}"
      title="${w.month}　${w.event}"></span>`;
  }).join('');

  const spans = phaseSpans(weeks).map((s) => `
    <span class="tl-phase" style="flex:${s.count}">${GROUP_LABEL[s.group]}</span>`).join('');

  return `
    <div class="timeline">
      <div class="timeline__head">
        <span>第 ${game.cursor.year} 年　時間軸</span>
        <span class="timeline__pos">你在這裡：第 ${game.cursor.week} ／ ${weeks.length} 週</span>
      </div>
      <div class="timeline__track">
        <div class="timeline__marker" style="left:${markerPct}%" aria-hidden="true">
          <i class="timeline__flag">現在</i>
          <b class="timeline__arrow">▼</b>
        </div>
        <div class="timeline__row">${cells}</div>
      </div>
      <div class="timeline__phases">${spans}</div>
    </div>`;
}
