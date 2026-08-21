// 成績單：把這一路走來的成績做成一張可以存檔的圖
//
// 內容三塊：歷年戰績、隊伍能力平均、被職棒選走的畢業生。
// 用 SVG 畫，因為不用套件、不用 canvas 像素運算，
// 而且 SVG 本身就是一個合法的圖檔格式，直接存檔就能看。

import { positionById, grade } from '../data/abilities.js';
import { teamStrength } from '../rules/game.js';
import { teamProfile } from './radar.js';

const COLORS = {
  bg: '#0d1418',
  line: '#27363d',
  text: '#e7eae8',
  muted: '#8d9c9a',
  accent: '#d98a4a',
  accentInk: '#1a1005',
  green: '#6fae7a',
  blue: '#6f9dc4',
};

const PHASE_NAME = {
  regional: '地區大賽', koshien: '甲子園', autumn: '秋季縣大賽',
  autumnArea: '秋季地區大賽', senbatsu: '春季甲子園',
};

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 產生成績單的 SVG 字串 */
export function buildSummarySVG(game) {
  const W = 720;
  const pad = 44;
  const parts = [];
  let y = 0;

  const text = (x, yy, str, opts = {}) => {
    const {
      size = 13, color = COLORS.text, weight = 400, anchor = 'start',
    } = opts;
    parts.push(`<text x="${x}" y="${yy.toFixed(1)}" font-size="${size}" fill="${color}"
      font-weight="${weight}" text-anchor="${anchor}"
      font-family="'Noto Sans TC','Microsoft JhengHei',sans-serif">${esc(str)}</text>`);
  };
  const rect = (x, yy, w, h, opts = {}) => {
    const { fill = COLORS.line, rx = 3 } = opts;
    parts.push(`<rect x="${x}" y="${yy.toFixed(1)}" width="${Math.max(0, w).toFixed(1)}"
      height="${h}" rx="${rx}" fill="${fill}"/>`);
  };
  const hr = (yy) => parts.push(
    `<line x1="${pad}" y1="${yy}" x2="${W - pad}" y2="${yy}" stroke="${COLORS.line}"/>`,
  );
  const heading = (str) => {
    y += 30;
    text(pad, y, str, { size: 16, weight: 700, color: COLORS.accent });
    y += 12;
  };

  // ── 標題 ──
  y = 54;
  text(pad, y, game.school.name, { size: 28, weight: 700 });
  y += 24;
  text(pad, y, `${game.school.prefectureName}　監督 ${game.manager.name}`,
    { size: 13, color: COLORS.muted });
  y += 20;
  text(pad, y, `第 ${game.cursor.year} 年結算　目前戰力 ${teamStrength(game.team.players)}`,
    { size: 13, color: COLORS.accent, weight: 600 });
  y += 14;
  hr(y);

  // ── 歷年戰績 ──
  heading('歷年戰績');
  game.progress.forEach((p, i) => {
    const cells = Object.entries(PHASE_NAME)
      .map(([k, name]) => {
        const v = p[k];
        if (!v) return null;
        return v.champion ? `${name}優勝` : `${name}止步於${v.lastRound}`;
      })
      .filter(Boolean);
    text(pad, y, `第 ${i + 1} 年`, { size: 12.5, weight: 700 });
    text(pad + 66, y, cells.length ? cells.join('　') : '（還沒開始）', {
      size: 11.5, color: COLORS.muted,
    });
    y += 21;
  });

  // ── 隊伍能力平均 ──
  heading('隊伍能力（目前平均）');
  const axes = teamProfile(game.team.players);
  const barX = pad + 62;
  const barMaxW = W - pad - barX - 34;
  axes.forEach((a) => {
    const w = (Math.max(0, a.value) / 90) * barMaxW;
    text(pad, y + 10, a.name, { size: 11.5, color: COLORS.muted });
    rect(barX, y, barMaxW, 13, { fill: '#1a262d' });
    rect(barX, y, w, 13, { fill: a.side === 'bat' ? COLORS.accent : COLORS.blue });
    text(barX + barMaxW + 10, y + 10, grade(a.value), { size: 12, weight: 700 });
    y += 20;
  });

  // ── 職棒選秀 ──
  heading('職棒選秀');
  const alumni = game.proAlumni || [];
  if (!alumni.length) {
    text(pad, y, '還沒有人被職棒選走。', { size: 12, color: COLORS.muted });
    y += 20;
  } else {
    alumni.forEach((a) => {
      const pos = positionById(a.position)?.short || '';
      const stars = '★'.repeat(a.talent) + '☆'.repeat(5 - a.talent);
      text(pad, y + 10, `${a.name}`, { size: 12.5, weight: 700 });
      text(pad + 90, y + 10, `${pos}　第 ${a.year} 年畢業　${stars}　注目度 ${a.attention}`, {
        size: 11.5, color: COLORS.muted,
      });
      y += 18;
      if (a.career) {
        text(pad + 14, y + 10, `高中生涯：${a.career}`, { size: 10.5, color: COLORS.muted });
        y += 16;
      }
      y += 5;
    });
  }

  y += 24;
  text(pad, y, `${new Date().toLocaleDateString('zh-TW')}　甲子園監督`, {
    size: 10.5, color: COLORS.muted,
  });
  y += 20;

  const H = Math.ceil(y);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"
    role="img" aria-label="球隊成績單">
    <rect x="0" y="0" width="${W}" height="${H}" fill="${COLORS.bg}"/>
    ${parts.join('\n')}
  </svg>`;
}

/** 把成績單存成 .svg 檔案下載下來 */
export function downloadSummary(game) {
  const svg = buildSummarySVG(game);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${game.school.name}_第${game.cursor.year}年成績單.svg`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
