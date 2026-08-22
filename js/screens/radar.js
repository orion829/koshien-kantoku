// 隊伍能力雷達圖
//
// 八個角：前四個是打者（先發九人的平均），後四個是投手（所有能上場
// 投手的平均）。兩邊都要是「平均」才能公平比較——如果打者這邊是
// 一群人的平均、投手那邊卻只挑王牌一個人的數字，投手那一半看起來
// 一定會比較漂亮（因為沒被其他人拉低），不是隊伍真的比較會投。
// 一眼就看得出這支隊伍是打擊型還是投手型。

import { grade } from '../data/abilities.js';
import { overall, isPitcher } from '../rules/player.js';
import { active } from '../rules/roster.js';
import { isInjured } from '../rules/injury.js';

const AXES = [
  { id: 'meet', name: '打擊', side: 'bat' },
  { id: 'power', name: '力量', side: 'bat' },
  { id: 'speed', name: '速度', side: 'bat' },
  { id: 'field', name: '守備', side: 'bat' },
  { id: 'velocity', name: '球速', side: 'pit' },
  { id: 'control', name: '控球', side: 'pit' },
  { id: 'stamina', name: '耐力', side: 'pit' },
  { id: 'breaking', name: '變化球', side: 'pit' },
];

/** 算出八個角的數值（0〜90） */
export function teamProfile(all) {
  const pool = active(all).filter((p) => !isInjured(p));
  const batters = pool.filter((p) => !isPitcher(p))
    .sort((a, b) => overall(b) - overall(a)).slice(0, 9);
  const pitchers = pool.filter(isPitcher);

  const mean = (list, id) => (list.length
    ? list.reduce((n, p) => n + p.abilities[id], 0) / list.length : 0);

  return AXES.map((a) => ({
    ...a,
    value: a.side === 'bat' ? mean(batters, a.id) : mean(pitchers, a.id),
  }));
}

const MAX = 90;   // 高中生的上限

/**
 * 畫出雷達圖。size 是整張圖的寬高。
 * 回傳一段 SVG 字串。
 */
export function radarSVG(all, { size = 210 } = {}) {
  const data = teamProfile(all);
  const c = size / 2;
  const r = size * 0.33;
  const n = data.length;

  // 第 i 個角的座標（從正上方開始順時針）
  const pt = (i, ratio) => {
    const ang = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [c + Math.cos(ang) * r * ratio, c + Math.sin(ang) * r * ratio];
  };

  // 背景的格線（四層）
  const rings = [0.25, 0.5, 0.75, 1].map((k) => {
    const pts = data.map((_, i) => pt(i, k).map((v) => v.toFixed(1)).join(',')).join(' ');
    return `<polygon points="${pts}" class="radar__ring"/>`;
  }).join('');

  const spokes = data.map((_, i) => {
    const [x, y] = pt(i, 1);
    return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar__spoke"/>`;
  }).join('');

  const shape = data
    .map((d, i) => pt(i, Math.max(0.04, d.value / MAX)).map((v) => v.toFixed(1)).join(','))
    .join(' ');

  const dots = data.map((d, i) => {
    const [x, y] = pt(i, Math.max(0.04, d.value / MAX));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2" class="radar__dot"/>`;
  }).join('');

  const labels = data.map((d, i) => {
    const [x, y] = pt(i, 1.32);
    const g = grade(d.value);
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}"
      class="radar__label radar__label--${d.side}">${d.name}<tspan
      class="radar__g g g--${g}" dx="3">${g}</tspan></text>`;
  }).join('');

  return `
    <svg class="radar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"
         role="img" aria-label="隊伍能力雷達圖">
      ${rings}${spokes}
      <polygon points="${shape}" class="radar__shape"/>
      ${dots}${labels}
    </svg>`;
}
