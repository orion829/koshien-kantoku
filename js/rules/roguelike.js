// Roguelike 要素
//
// 這個檔案放「每一局都不一樣」的東西。分成十三種：
//
//   1. 傳統   一局裡會遇到 5 次三選一，選到的效果整局都有效
//   2. 突發事件 每個練習週都會遇到一個，兩個選項各有好壞
//   3. 作戰   比賽週開打前三選一，只影響這一週的比賽
//   4. 對手特色 每支對手學校都有一個特色，不是每場都一樣
//   5. 轉學生 一年一定會遇到一個，隨機年級，極低機率是超神等級
//   6. 能力覺醒 能力練過門檻時可能跳卡片，賭贏學會新能力，
//             賭輸能力會掉或換來壞習慣
//   7. 學長探班 打得夠好被職棒選走的畢業生，偶爾回來幫學校一把
//   8. 校務投資 每年戰績換傳承點數，拿去買永久升級——
//             這是「學校越帶越強」的主要來源，球員換血也不會消失
//   9. 學力與考試 夏／秋／春各有一次期末考，考不過那一輪大賽不能出賽
//  10. 球隊經理 一年招一個，常駐 2〜3 個，特殊能力有好有壞，三年後畢業
//  11. 畢業去向 沒被職棒選走的畢業生（和畢業的經理）抽一個未來的路，
//             全部記進 game.alumni，給校友錄畫面回顧用
//  12. 畢業生回訪 走上千奇百怪那條路的校友，偶爾會回來串門子，
//             帶一點跟職業有關的小驚喜，純加分沒有風險
//  13. 奇妙事件 比賽週、練習週都偶爾會發生的小插曲，系統直接決定，
//             有正面也有負面：比賽週的跟注目度有關，練習週的
//             加了園遊會、運動會、戀愛、惡搞這些校園生活花絮
//
// 所有的加成都寫進同一個「加成表」（mods），
// 這樣比賽、練習、招生只要看這張表就好，不用到處寫 if。

import { createPlayer, boostPotential } from './player.js';
import { addRecruits, active } from './roster.js';
import { injure, isInjured } from './injury.js';
import { randomManagerName } from '../data/names.js';
import {
  MAX_ABILITY, BATTER_STATS, PITCHER_STATS, POSITIONS, skillsFor, skillById, grade,
} from '../data/abilities.js';

// ── 加成表 ──────────────────────────────────────────────

/** 一張全部都是 0 的加成表 */
export function baseMods() {
  return {
    // 隊伍經營
    trainGain: 1,        // 練習成長倍率
    trainInjury: 1,      // 練習受傷倍率
    matchInjury: 1,      // 比賽受傷倍率
    healSpeed: 1,        // 一週好幾週的傷
    fame: 0,             // 注目度加成
    scoutExtra: 0,       // 招生名單多幾個人
    scoutKnown: false,   // 一開始就看得到成長期
    rosterBonus: 0,      // 部員上限
    walkOnBonus: 0,      // 每年自己來的新生
    moraleRewind: 0,     // 練習賽多拉回幾週
    weights: {},         // 練習項目的額外權重
    alumniChance: 0,      // 學長探班機率加成
    thresholdCut: 0,      // 招生好感度門檻降低多少
    potentialBonus: 0,    // 新加入的人，每一項能力上限 +多少

    // 比賽
    meet: 0, power: 0, speed: 0,
    defence: 0, control: 0, stuff: 0,
    extraBase: 0,        // 長打機率
    advance: 0,          // 跑者多跑一個壘的機率
    dp: 0,               // 被雙殺的機率
    staminaMult: 1,      // 投手撐幾球
    comeback: 0,         // 落後時的加成
    eye: 0,              // 選球（對方比較容易投四壞）
    early: 0,            // 前兩局的加成
  };
}

// ── 1. 傳統（整局有效）──────────────────────────────────

export const PERKS = [
  {
    id: 'hardWork',
    name: '猛特訓',
    desc: '練習成長 +12%，但練習受傷的機率變兩倍。',
    apply: (m) => { m.trainGain *= 1.12; m.trainInjury *= 2; },
  },
  {
    id: 'medical',
    name: '校醫進駐',
    desc: '養傷速度變兩倍，一週好兩週。',
    apply: (m) => { m.healSpeed = 2; },
  },
  {
    id: 'famous',
    name: '名門的招牌',
    desc: '注目度 +8，招生名單多 2 個人。',
    apply: (m) => { m.fame += 8; m.scoutExtra += 2; },
  },
  {
    id: 'eye',
    name: '伯樂',
    desc: '還沒去看，就知道候選人是早熟還是晚成。',
    apply: (m) => { m.scoutKnown = true; },
  },
  {
    id: 'ironArm',
    name: '鐵臂養成',
    desc: '投手比較晚累，比賽受傷機率 −35%。',
    apply: (m) => { m.staminaMult *= 1.2; m.matchInjury *= 0.65; },
  },
  {
    id: 'defenceFirst',
    name: '守備至上',
    desc: '比賽時守備 +7，但打擊 −2。',
    apply: (m) => { m.defence += 7; m.meet -= 2; },
  },
  {
    id: 'bigSwing',
    name: '強打線',
    desc: '比賽時力量 +8，練打擊的效果也比較好。',
    apply: (m) => { m.power += 8; m.weights.meet = (m.weights.meet || 0) + 0.2; },
  },
  {
    id: 'spirit',
    name: '精神論',
    desc: '打練習賽的時候，士氣多拉回 2 週。',
    apply: (m) => { m.moraleRewind += 2; },
  },
  {
    id: 'numbers',
    name: '人海戰術',
    desc: '部員上限 +3，每年自己來報名的新生多 3 個。',
    apply: (m) => { m.rosterBonus += 3; m.walkOnBonus += 3; },
  },
  {
    id: 'comeback',
    name: '不放棄',
    desc: '比賽落後的時候，打擊和力量 +6。',
    apply: (m) => { m.comeback += 6; },
  },
  {
    id: 'fastStart',
    name: '先制攻擊',
    desc: '比賽前兩局，打擊和力量 +10。',
    apply: (m) => { m.early += 10; },
  },
  {
    id: 'noWalk',
    name: '不送四壞',
    desc: '我方投手的控球 +8。',
    apply: (m) => { m.control += 8; },
  },
  {
    id: 'legwork',
    name: '腳程訓練',
    desc: '比賽時速度 +8，跑者比較會多跑一個壘。',
    apply: (m) => { m.speed += 8; m.advance += 0.1; },
  },
  {
    id: 'gym',
    name: '重訓室',
    desc: '練體能和長打的效果比較好。',
    apply: (m) => {
      m.weights.power = (m.weights.power || 0) + 0.2;
      m.weights.stamina = (m.weights.stamina || 0) + 0.15;
    },
  },
];

export const perkById = (id) => PERKS.find((p) => p.id === id);

/** 這一局目前拿到的所有加成 */
export function modifiers(game) {
  const m = baseMods();
  (game?.perks || []).forEach((id) => perkById(id)?.apply(m));
  // 校務投資是永久的，跟傳統一樣疊進同一張加成表，
  // 不會因為球員畢業、甚至傳統整套換掉而消失
  Object.entries(game?.upgrades || {}).forEach(([id, level]) => {
    const u = upgradeById(id);
    if (!u) return;
    for (let i = 0; i < level; i += 1) u.apply(m);
  });
  // 經理的特殊能力也是永久生效的，只要她還在隊上——好的能力和
  // 壞的能力用同一套邏輯疊進去，不特別偏袒玩家
  activeManagers(game?.team?.managers).forEach((mgr) => {
    managerSkillById(mgr.skillId)?.apply(m);
  });
  return m;
}

/** 抽 n 張還沒拿過的傳統出來給玩家選 */
export function drawPerks(game, n = 3, rng = Math.random) {
  const owned = new Set(game?.perks || []);
  const pool = PERKS.filter((p) => !owned.has(p.id));
  const shuffled = pool
    .map((p) => ({ p, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .map((x) => x.p.id);
  return shuffled.slice(0, n);
}

/** 選了一張傳統 */
export function choosePerk(game, id) {
  if (!perkById(id)) return null;
  if (!game.perks) game.perks = [];
  if (!game.perks.includes(id)) game.perks.push(id);
  game.pendingDraft = null;
  return perkById(id);
}

// ── 2. 突發事件 ─────────────────────────────────────────

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pickOne = (list, rng) => list[Math.floor(rng() * list.length)];

const canPlay = (game) => active(game.team.players)
  .filter((p) => !p.injury || p.injury.weeks <= 0);

/** 隨機挑幾個人，某一項能力 +x（不會超過他自己的上限） */
function bump(list, stat, amount) {
  let n = 0;
  list.forEach((p) => {
    const cap = p.potential?.[stat] ?? MAX_ABILITY;
    if (p.abilities[stat] >= cap) return;
    p.abilities[stat] = Math.min(cap, p.abilities[stat] + amount);
    n += 1;
  });
  return n;
}

/** 隨機挑幾個人，學力 +x（上限 100，跟球技上限沒關係） */
function bumpGak(list, amount) {
  let n = 0;
  list.forEach((p) => {
    if (p.gakuryoku >= 100) return;
    p.gakuryoku = Math.min(100, p.gakuryoku + amount);
    n += 1;
  });
  return n;
}

function someone(game, count, rng) {
  const pool = canPlay(game);
  return pool
    .map((p) => ({ p, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, count)
    .map((x) => x.p);
}

/** 士氣計時器往回撥（數字越小士氣越好） */
const cheerUp = (game, n) => {
  game.morale.weeksSinceMatch = Math.max(0, game.morale.weeksSinceMatch - n);
};

export const EVENTS = [
  {
    id: 'rain',
    title: '練習到一半下大雨',
    text: '雨越下越大，場地已經開始積水了。',
    options: [
      {
        label: '照練',
        hint: '這週成長 +15%，但比較容易受傷',
        effect: (game) => {
          game.weekBoost = { gain: 1.15, injury: 2.5 };
          return '全隊淋著雨練完了。滿身泥巴，但眼神不一樣了。';
        },
      },
      {
        label: '收隊',
        hint: '早點回家，士氣變好',
        effect: (game) => {
          cheerUp(game, 2);
          game.weekBoost = { gain: 0.9, injury: 1 };
          return '大家早早回家洗了個熱水澡，心情很好。';
        },
      },
    ],
  },
  {
    id: 'obog',
    title: '畢業的學長回來探班',
    text: '去年的隊長帶著飲料出現在球場邊。',
    options: [
      {
        label: '請他訓話',
        hint: '士氣變好',
        effect: (game) => {
          cheerUp(game, 3);
          return '學長講到甲子園那一戰，好幾個人眼眶紅了。';
        },
      },
      {
        label: '請他指導守備',
        hint: '4 個人的守備 +3',
        effect: (game, rng) => {
          const n = bump(someone(game, 4, rng), 'field', 3);
          return `學長蹲下來一個一個示範。${n} 個人的守備進步了。`;
        },
      },
    ],
  },
  {
    id: 'fight',
    title: '兩個隊員吵起來了',
    text: '為了守備位置，兩個人在休息室大吵。',
    options: [
      {
        label: '全隊罰跑',
        hint: '全隊速度 +2，但士氣變差',
        effect: (game) => {
          const n = bump(canPlay(game), 'speed', 2);
          game.morale.weeksSinceMatch += 3;
          return `全隊繞球場跑了二十圈。${n} 個人的速度進步了，但大家都在瞪你。`;
        },
      },
      {
        label: '坐下來談',
        hint: '士氣變好，但今天沒練到球',
        effect: (game) => {
          cheerUp(game, 3);
          game.weekBoost = { gain: 0.85, injury: 1 };
          return '談了兩個小時。球沒練到，但兩個人握手了。';
        },
      },
    ],
  },
  {
    id: 'gear',
    title: '打擊網破了',
    text: '用了十年的打擊網終於破了一個大洞。',
    options: [
      {
        label: '全隊自己修',
        hint: '全隊接球 +2，這週成長打折',
        effect: (game) => {
          const n = bump(canPlay(game), 'catch', 2);
          game.weekBoost = { gain: 0.85, injury: 1 };
          return `花了一整天補網。${n} 個人的接球進步了（雖然不知道為什麼）。`;
        },
      },
      {
        label: '去跟學校要錢',
        hint: '注目度 +3，但這週在跑行政',
        effect: (game) => {
          game.extraFame = (game.extraFame || 0) + 3;
          game.weekBoost = { gain: 0.9, injury: 1 };
          return '校長很爽快就簽了，順便把球隊寫進校刊。';
        },
      },
    ],
  },
  {
    id: 'visit',
    title: '附近的國中生來參觀',
    text: '一群國中生站在圍網外面看你們練球。',
    options: [
      {
        label: '好好招待',
        hint: '注目度 +5',
        effect: (game) => {
          game.extraFame = (game.extraFame || 0) + 5;
          return '讓他們下場摸了一下球棒。有幾個眼睛都亮了。';
        },
      },
      {
        label: '照常練習',
        hint: '這週成長 +10%',
        effect: (game) => {
          game.weekBoost = { gain: 1.1, injury: 1 };
          return '被人看著，大家反而練得比平常認真。';
        },
      },
    ],
  },
  {
    id: 'ace',
    title: '王牌說手肘怪怪的',
    text: '他自己說沒事，但表情不太對。',
    options: [
      {
        label: '叫他休息',
        hint: '他休養 2 週',
        effect: (game) => {
          const ace = canPlay(game)
            .filter((p) => p.position === 'P')
            .sort((a, b) => b.abilities.velocity - a.abilities.velocity)[0];
          if (!ace) return '結果隊上根本沒有投手。';
          ace.injury = {
            severity: 'light', name: '輕傷', cause: '手肘疲勞',
            weeks: 2, totalWeeks: 2, drop: 0, permanent: 0,
          };
          return `${ace.name} 去休息了。兩週後回來。`;
        },
      },
      {
        label: '讓他忍一下',
        hint: '有機會直接受傷，沒事的話耐力 +5',
        effect: (game, rng) => {
          const ace = canPlay(game)
            .filter((p) => p.position === 'P')
            .sort((a, b) => b.abilities.velocity - a.abilities.velocity)[0];
          if (!ace) return '結果隊上根本沒有投手。';
          if (rng() < 0.3) {
            const r = injure(ace, rng);
            return `${ace.name} 投到一半整個人蹲下去 —— ${r.label}，要休養 ${r.weeks} 週。`;
          }
          bump([ace], 'stamina', 5);
          return `${ace.name} 咬牙投完了。耐力進步了。`;
        },
      },
    ],
  },
  {
    id: 'challenge',
    title: '隔壁學校來踢館',
    text: '對方監督說：「要不要打一場？」',
    options: [
      {
        label: '接受',
        hint: '當作打了一場練習賽，士氣變好',
        effect: (game) => {
          cheerUp(game, 4);
          return '打了一場亂七八糟但很痛快的比賽。';
        },
      },
      {
        label: '拒絕，專心練習',
        hint: '這週成長 +12%',
        effect: (game) => {
          game.weekBoost = { gain: 1.12, injury: 1 };
          return '你說：「先把自己的事做好。」大家沒有多說什麼。';
        },
      },
    ],
  },
  {
    id: 'walkin',
    title: '有個同學想入部',
    text: '完全沒打過棒球，但他說想試試看。',
    options: [
      {
        label: '收他',
        hint: '多一個部員（很弱）',
        effect: (game, rng) => {
          const p = createPlayer({ gradeYear: rng() < 0.5 ? 1 : 2, talent: 1, rng });
          game.team.players = addRecruits(game.team.players, [p]);
          return `${p.name} 入部了。連握棒都不會，但很努力。`;
        },
      },
      {
        label: '婉拒',
        hint: '全隊打擊 +1',
        effect: (game) => {
          const n = bump(canPlay(game), 'meet', 1);
          return `你說現在不是時候。${n} 個人默默地多揮了一百下。`;
        },
      },
    ],
  },
  {
    id: 'supper',
    title: '家長會送宵夜來',
    text: '一大鍋咖哩，香味整個球場都聞得到。',
    options: [
      {
        label: '全隊一起吃',
        hint: '士氣變好，全隊力量 +1',
        effect: (game) => {
          cheerUp(game, 2);
          bump(canPlay(game), 'power', 1);
          return '一鍋咖哩十分鐘就沒了。';
        },
      },
      {
        label: '留給三年級',
        hint: '三年級打擊 +3，但學弟們有點失落',
        effect: (game) => {
          const seniors = canPlay(game).filter((p) => p.gradeYear === 3);
          const n = bump(seniors, 'meet', 3);
          game.morale.weeksSinceMatch += 1;
          return `${n} 個三年級吃得很滿足。學弟們在旁邊看著。`;
        },
      },
    ],
  },
  {
    id: 'cold',
    title: '有人感冒了',
    text: '一早就聽到咳嗽聲，臉色也不太好。',
    options: [
      {
        label: '讓他請假',
        hint: '那個人休息 1 週，但不會傳給別人',
        effect: (game, rng) => {
          const p = pickOne(canPlay(game), rng);
          if (!p) return '結果隊上沒人。';
          p.injury = {
            severity: 'light', name: '感冒', cause: '著涼',
            weeks: 1, totalWeeks: 1, drop: 0, permanent: 0,
          };
          return `${p.name} 請假一週在家休息。`;
        },
      },
      {
        label: '硬撐著練',
        hint: '這週容易傳染，受傷（生病）機率變高',
        effect: (game) => {
          game.weekBoost = { gain: 1, injury: 1.6 };
          return '他還是咬牙練完了，但旁邊的人開始有點擔心自己會不會也中鏢。';
        },
      },
    ],
  },
  {
    id: 'festival',
    title: '學校運動會',
    text: '今天全校都在操場上，班際大隊接力吵得很熱鬧。',
    options: [
      {
        label: '全隊下去參加',
        hint: '士氣變好，但這週練習打折',
        effect: (game) => {
          cheerUp(game, 4);
          game.weekBoost = { gain: 0.6, injury: 1 };
          return '球隊代表班上拿了接力冠軍，士氣整個衝上來。';
        },
      },
      {
        label: '缺席，照常練球',
        hint: '這週成長 +10%，但同學有點不諒解',
        effect: (game) => {
          game.weekBoost = { gain: 1.1, injury: 1 };
          game.morale.weeksSinceMatch += 2;
          return '空蕩蕩的球場只有你們在練習，感覺有點孤單。';
        },
      },
    ],
  },
  {
    id: 'newspaper',
    title: '地方報紙來採訪',
    text: '記者說想寫一篇「無名球隊的挑戰」。',
    options: [
      {
        label: '大方受訪',
        hint: '注目度 +4',
        effect: (game) => {
          game.extraFame = (game.extraFame || 0) + 4;
          return '隔天報紙上真的登出來了，隊員們剪下來貼在休息室。';
        },
      },
      {
        label: '婉拒，專心練習',
        hint: '這週成長 +8%',
        effect: (game) => {
          game.weekBoost = { gain: 1.08, injury: 1 };
          return '你說：「等我們打出成績再說。」';
        },
      },
    ],
  },
  {
    id: 'uniform',
    title: '球衣舊到快看不出隊名',
    text: '袖口都磨破了，號碼也快掉光。',
    options: [
      {
        label: '訂新球衣',
        hint: '士氣變好',
        effect: (game) => {
          cheerUp(game, 3);
          return '穿上新球衣的那天，大家走路都有風。';
        },
      },
      {
        label: '繼續穿舊的',
        hint: '把錢省下來，全隊守備 +2',
        effect: (game, rng) => {
          const n = bump(someone(game, 6, rng), 'field', 2);
          return `錢省下來加買了幾個手套。${n} 個人的守備進步了。`;
        },
      },
    ],
  },
  {
    id: 'construction',
    title: '隔壁工地在施工',
    text: '打樁機的聲音蓋過了教練的喊聲。',
    options: [
      {
        label: '換個地方練',
        hint: '這週成長打折，但比較安靜',
        effect: (game) => {
          game.weekBoost = { gain: 0.85, injury: 1 };
          return '借了隔壁學校的球場，勉強練完了。';
        },
      },
      {
        label: '照舊練，習慣就好',
        hint: '全隊耐力 +2',
        effect: (game, rng) => {
          const n = bump(canPlay(game), 'stamina', 2);
          return `吵歸吵，${n} 個人反而練出了忍耐力。`;
        },
      },
    ],
  },
  {
    id: 'checkup',
    title: '學校安排定期體檢',
    text: '校醫來幫全隊量血壓、聽心跳。',
    options: [
      {
        label: '照規定做完整檢查',
        hint: '這週受傷機率大降',
        effect: (game) => {
          game.weekBoost = { gain: 1, injury: 0.4 };
          return '順便發現兩個人有點過度疲勞，提早叫他們收操。';
        },
      },
      {
        label: '隨便量一量',
        hint: '這週成長 +5%',
        effect: (game) => {
          game.weekBoost = { gain: 1.05, injury: 1 };
          return '排隊排一下就結束了，剩下的時間拿去練球。';
        },
      },
    ],
  },
  {
    id: 'homework',
    title: '作業寫不完',
    text: '明天要交的作業，好幾個人都還沒動筆。',
    options: [
      {
        label: '留下來一起寫',
        hint: '4 個人的學力 +5，但這週成長打折',
        effect: (game, rng) => {
          const n = bumpGak(someone(game, 4, rng), 5);
          game.weekBoost = { gain: 0.9, injury: 1 };
          return `留到晚上九點才寫完。${n} 個人的學力進步了。`;
        },
      },
      {
        label: '練球優先，作業自己想辦法',
        hint: '這週成長 +8%',
        effect: (game) => {
          game.weekBoost = { gain: 1.08, injury: 1 };
          return '你說：「先練球，作業回家自己解決。」';
        },
      },
    ],
  },
  {
    id: 'tutor',
    title: '家長會請了家教',
    text: '有家長擔心大家的成績，自掏腰包請了一位老師來惡補。',
    options: [
      {
        label: '全隊一起上課',
        hint: '全隊學力 +3，這週沒練到球',
        effect: (game) => {
          const n = bumpGak(canPlay(game), 3);
          game.weekBoost = { gain: 0.7, injury: 1 };
          return `補了一整個下午的課。${n} 個人的學力進步了。`;
        },
      },
      {
        label: '婉拒，練球優先',
        hint: '士氣變好',
        effect: (game) => {
          cheerUp(game, 2);
          return '大家聽到不用上課都鬆了一口氣，練球特別有精神。';
        },
      },
    ],
  },
  {
    id: 'managerNotes',
    title: '經理在整理球探筆記',
    text: '她把每個人的比賽數據都存了下來，說想幫忙找出弱點。',
    available: (game) => activeManagers(game.team?.managers).length > 0,
    options: [
      {
        label: '請她繼續做',
        hint: '注目度 +3',
        effect: (game) => {
          game.extraFame = (game.extraFame || 0) + 3;
          return '整理好的資料後來真的被球探拿去參考了。';
        },
      },
      {
        label: '謝謝就好，練習優先',
        hint: '這週成長 +8%',
        effect: (game) => {
          game.weekBoost = { gain: 1.08, injury: 1 };
          return '大家婉拒了好意，專心練球。';
        },
      },
    ],
  },
  {
    id: 'managerSnack',
    title: '經理自己做點心給大家加油',
    text: '一大盒手工餅乾放在休息室的桌上。',
    available: (game) => activeManagers(game.team?.managers).length > 0,
    options: [
      {
        label: '大家開心地吃',
        hint: '士氣變好',
        effect: (game) => {
          cheerUp(game, 2);
          return '休息室的氣氛整個變好了。';
        },
      },
      {
        label: '客氣婉拒，怕吃壞肚子',
        hint: '4 個人的守備 +1',
        effect: (game, rng) => {
          const n = bump(someone(game, 4, rng), 'field', 1);
          return `雖然婉拒了，但大家練得更專心。${n} 個人的守備進步了。`;
        },
      },
    ],
  },
  {
    id: 'madScientist',
    title: '一個自稱「博士」的怪人出現在球場邊',
    text: '他說他研究出一種特殊的訓練法，想找人試試看。',
    options: [
      {
        label: '半信半疑讓他試試',
        hint: '賭一把：可能大幅成長，也可能練到受傷',
        effect: (game, rng) => {
          const targets = someone(game, 3, rng);
          if (!targets.length) return '結果隊上沒人願意當白老鼠。';
          if (rng() < 0.5) {
            const n = bump(targets, 'power', 6) + bump(targets, 'speed', 6);
            return `博士的方法居然真的有效！${n} 人份的能力大幅進步，博士得意地笑著消失在夜色中。`;
          }
          const hurt = targets[0];
          const r = injure(hurt, rng);
          return `博士的「特訓法」練過頭了——${hurt.name} ${r.label}，要休養 ${r.weeks} 週。博士早就跑得不見人影了。`;
        },
      },
      {
        label: '婉拒，把他請出球場',
        hint: '這週成長 +6%',
        effect: (game) => {
          game.weekBoost = { gain: 1.06, injury: 1 };
          return '博士喃喃自語地走了，留下一句「總有一天你們會後悔」。';
        },
      },
    ],
  },
];

export const eventById = (id) => EVENTS.find((e) => e.id === id);

/**
 * 這一週要不要跳事件。現在是每個練習週都會遇到一個（chance 預設 1），
 * 保留 chance 參數只是方便以後想調整、或測試用。
 * 有些事件有出現條件（例如經理相關的事件要先有經理在隊上），
 * available 沒寫就當作一直都能出現。
 */
export function rollEvent(game, rng = Math.random, chance = 1) {
  if (rng() >= chance) return null;
  const eligible = EVENTS.filter((e) => !e.available || e.available(game));
  const recent = new Set(game.recentEvents || []);
  const pool = eligible.filter((e) => !recent.has(e.id));
  const ev = pickOne(pool.length ? pool : eligible, rng);
  return ev.id;
}

/** 選了事件的某一個選項。回傳一筆給畫面看的紀錄 */
export function resolveEvent(game, index, rng = Math.random) {
  const ev = eventById(game.pendingEvent);
  if (!ev) return null;
  const opt = ev.options[index];
  if (!opt) return null;

  const result = opt.effect(game, rng);

  game.pendingEvent = null;
  game.recentEvents = [...(game.recentEvents || []), ev.id].slice(-6);

  return {
    week: game.cursor.abs,
    kind: 'event',
    event: '突發事件',
    eventResult: { title: ev.title, choice: opt.label, result },
  };
}

// ── 3. 作戰（只影響這一週的比賽）────────────────────────

export const TACTICS = [
  {
    id: 'allOut',
    name: '強攻',
    desc: '力量 +14、打擊 −2。要嘛全壘打，要嘛三振。',
    apply: (m) => { m.power += 14; m.meet -= 2; },
  },
  {
    id: 'smallBall',
    name: '小球',
    desc: '打擊 +5、力量 −8，跑者比較會多跑一個壘。',
    apply: (m) => { m.meet += 5; m.power -= 8; m.advance += 0.14; },
  },
  {
    id: 'legs',
    name: '機動力',
    desc: '速度 +10，長打變多，也比較不會被雙殺。',
    apply: (m) => { m.speed += 10; m.extraBase += 0.035; m.dp -= 0.06; },
  },
  {
    id: 'lockDown',
    name: '死守',
    desc: '守備 +12、控球 +7，但打擊 −5。守住就好。',
    apply: (m) => { m.defence += 12; m.control += 7; m.meet -= 5; },
  },
  {
    id: 'aceOut',
    name: '王牌全開',
    desc: '球質 +5、投手比較晚累，但受傷機率變兩倍。',
    apply: (m) => { m.stuff += 5; m.staminaMult *= 1.35; m.matchInjury *= 2; },
  },
  {
    id: 'calm',
    name: '穩紮穩打',
    desc: '不勉強任何人。受傷機率 −50%，能力沒有加成。',
    apply: (m) => { m.matchInjury *= 0.5; },
  },
  {
    id: 'lastStand',
    name: '背水一戰',
    desc: '打擊、力量、守備各 +5，但受傷機率 ×2.5。',
    apply: (m) => {
      m.meet += 5; m.power += 5; m.defence += 5; m.matchInjury *= 2.5;
    },
  },
  {
    id: 'patience',
    name: '耐心等球',
    desc: '對方比較容易投出四壞，但我方揮棒也變保守。',
    apply: (m) => { m.eye += 0.03; m.power -= 5; },
  },
];

export const tacticById = (id) => TACTICS.find((t) => t.id === id);

/** 抽 3 個作戰給玩家選 */
export function drawTactics(rng = Math.random, n = 3) {
  return TACTICS
    .map((t) => ({ t, k: rng() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, n)
    .map((x) => x.t.id);
}

/** 傳統 + 這週的作戰，合成一張比賽用的加成表 */
export function matchMods(game) {
  const m = modifiers(game);
  tacticById(game?.tactic)?.apply(m);
  return m;
}

// ── 4. 對手學校的特色 ───────────────────────────────────

export const OPPONENT_TRAITS = [
  {
    id: 'slugger', name: '強打線', desc: '打線很兇，但守備普通',
    apply: (m) => { m.power += 12; m.meet += 3; m.defence -= 6; },
  },
  {
    id: 'wall', name: '鐵壁守備', desc: '幾乎不失誤，但打線很弱',
    apply: (m) => { m.defence += 12; m.power -= 8; },
  },
  {
    id: 'monster', name: '怪物投手', desc: '王牌很強，但打線靠他撐',
    apply: (m) => { m.stuff += 9; m.control += 3; m.meet -= 6; },
  },
  {
    id: 'legs', name: '快腿軍團', desc: '跑壘很積極，但沒有長打',
    apply: (m) => { m.speed += 12; m.advance += 0.16; m.power -= 9; },
  },
  {
    id: 'wild', name: '控球不穩', desc: '球很威但不準，四壞會送很多',
    apply: (m) => { m.control -= 13; m.stuff += 6; },
  },
  {
    id: 'green', name: '經驗不足', desc: '大場面容易緊張',
    apply: (m) => { m.meet -= 4; m.defence -= 4; },
  },
  {
    id: 'iron', name: '鐵人投手', desc: '投再多也不累，但球質普通',
    apply: (m) => { m.staminaMult *= 1.45; m.stuff -= 4; },
  },
  {
    id: 'late', name: '後勁強', desc: '前面很鬆，越後面越可怕',
    apply: (m) => { m.comeback += 11; m.early -= 8; },
  },
  { id: 'plain', name: '四平八穩', desc: '沒有明顯的長處和短處', apply: () => {} },
];

/** 隨機給對手一個特色，回傳 { trait, mods } */
export function rollOpponentTrait(rng = Math.random) {
  const t = pickOne(OPPONENT_TRAITS, rng);
  const m = baseMods();
  t.apply(m);
  return { trait: { id: t.id, name: t.name, desc: t.desc }, mods: m };
}

// ── 5. 轉學生（一年一定會遇到一個）──────────────────────
//
// 隨機挑一個練習週，那一週不跳突發事件，改成轉學生入學。
// 年級隨機（1〜3年級都可能），入學是確定的，選項只影響一點小加成。
// 有極低機率（2.5%）拿到「超神轉學生」—— 他的專長能力直接頂到頂點。

/** 超神轉學生的機率 */
export const TRANSFER_SUPERSTAR_CHANCE = 0.025;

/** 這一年要在哪一個練習週遇到轉學生（回傳陣列索引，不是 week 編號） */
export function pickTransferWeek(weeks, rng = Math.random) {
  const idxs = [];
  weeks.forEach((w, i) => { if (w.kind === 'training') idxs.push(i); });
  if (!idxs.length) return -1;
  return idxs[Math.floor(rng() * idxs.length)];
}

/** 生一個轉學生。回傳 { player, superstar } */
export function rollTransferStudent(game, rng = Math.random) {
  const gradeYear = 1 + Math.floor(rng() * 3);
  const superstar = rng() < TRANSFER_SUPERSTAR_CHANCE;

  // 隊上缺的位置優先給他，這樣他一定用得到
  const have = {};
  active(game.team.players).forEach((p) => { have[p.position] = (have[p.position] || 0) + 1; });
  const needed = POSITIONS.map((p) => p.id).sort((a, b) => (have[a] || 0) - (have[b] || 0));
  const position = needed[0];

  const talent = superstar ? 5 : 1 + Math.floor(rng() * 4);
  const player = createPlayer({
    gradeYear, talent, position, rng,
  });

  if (superstar) {
    // 只頂他的專長（投手頂投手能力、野手頂打者能力），
    // 不是全能超人，這樣還是像一個真的很強的球員，不是外掛
    const roleStats = position === 'P' ? PITCHER_STATS : BATTER_STATS;
    roleStats.forEach((s) => {
      player.potential[s.id] = MAX_ABILITY;
      player.abilities[s.id] = clamp(player.abilities[s.id] + 24, 1, MAX_ABILITY);
    });

    // 保底兩個好能力，壞能力全拿掉
    const role = position === 'P' ? 'pitcher' : 'batter';
    player.skills = player.skills.filter((id) => skillById(id)?.good);
    const pool = skillsFor(role, true).map((s) => s.id).filter((id) => !player.skills.includes(id));
    while (player.skills.length < 2 && pool.length) {
      player.skills.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
  }

  return { player, superstar };
}

/** 轉學生入學的兩個選項都會讓他加入，差別只在一點小加成 */
export function resolveTransfer(game, choice, rng = Math.random) {
  const t = game.pendingTransfer;
  if (!t) return null;
  const { player, superstar } = t;

  // 「英才培育」升級對轉學生一樣有效
  boostPotential([player], modifiers(game).potentialBonus);
  game.team.players = addRecruits(game.team.players, [player]);
  game.pendingTransfer = null;

  let note;
  if (choice === 'warm') {
    game.morale.weeksSinceMatch = Math.max(0, game.morale.weeksSinceMatch - 2);
    note = '全隊夾道歡迎，氣氛很好。';
  } else {
    const n = bump(someone(game, 4, rng), 'meet', 1);
    note = `照平常一樣練習。${n} 個人反而練得更專心了。`;
  }

  return {
    week: game.cursor.abs,
    kind: 'transfer',
    event: superstar ? '傳說中的轉學生' : '轉學生入學',
    transferResult: {
      name: player.name, position: player.position, gradeYear: player.gradeYear,
      talent: player.talent, superstar, note,
    },
  };
}

// ── 6. 能力覺醒（賭運氣的卡片）──────────────────────────
//
// 特殊能力平常都是一出生就定好，不會再變。但練到某項能力過了門檻
// （能力表裡的 req），代表這個人已經「摸到那個能力的邊」了，
// 這時候會跳出一張卡：要不要賭一把讓他正式學會？
// 賭贏就多一個好能力，賭輸的話能力會掉、或是換來一個壞習慣——
// 這是真的有代價的賭注，不是純加分。

/** 這一週跳出覺醒卡的機率（前提是隊上真的有人「摸到邊」了） */
export const AWAKEN_CHANCE = 0.22;

const STAT_NAME_LOOKUP = Object.fromEntries(
  [...BATTER_STATS, ...PITCHER_STATS].map((s) => [s.id, s.name]),
);

const skillAllowed = (s, abilities) => {
  if (!s.req) return true;
  const v = abilities[s.req.stat];
  if (s.req.min !== undefined && v < s.req.min) return false;
  if (s.req.max !== undefined && v > s.req.max) return false;
  return true;
};

/**
 * 誰「摸到邊」了：能力已經過門檻，但還沒拿到那個好能力，
 * 而且沒有已經賭輸過（賭輸的組合不會再跳第二次）。
 * 只看有門檻（req）的能力——沒有門檻的能力就只能出生就帶，靠賭是賭不到的。
 */
function findAwakenCandidates(game) {
  const tried = new Set(game.awakenSeen || []);
  const out = [];
  active(game.team.players).forEach((p) => {
    if (p.injury && p.injury.weeks > 0) return;
    const role = p.position === 'P' ? 'pitcher' : 'batter';
    skillsFor(role, true).filter((s) => s.req).forEach((s) => {
      if (p.skills.includes(s.id)) return;
      if (tried.has(`${p.id}:${s.id}`)) return;
      if (!skillAllowed(s, p.abilities)) return;
      out.push({ player: p, skill: s });
    });
  });
  return out;
}

/** 這一週要不要跳覺醒卡。回傳 { player, skill }，或 null */
export function rollAwaken(game, rng = Math.random) {
  const candidates = findAwakenCandidates(game);
  if (!candidates.length) return null;
  if (rng() >= AWAKEN_CHANCE) return null;
  return pickOne(candidates, rng);
}

/** 賭下去，或先算了。回傳一筆給畫面看的紀錄 */
export function resolveAwaken(game, choice, rng = Math.random) {
  const a = game.pendingAwaken;
  if (!a) return null;
  const { player: p, skill } = a;
  game.pendingAwaken = null;

  const log = (outcome, note) => ({
    week: game.cursor.abs,
    kind: 'awaken',
    event: '能力覺醒',
    awakenResult: {
      name: p.name, skill: skill.name, outcome, note,
    },
  });

  if (choice !== 'bet') {
    return log('pass', '先按兵不動，這個機會之後可能還會再出現。');
  }

  // 賭輸的組合就別再跳第二次了，一人一個能力只有一次機會
  game.awakenSeen = [...(game.awakenSeen || []), `${p.id}:${skill.id}`];

  const winChance = clamp(0.35 + p.talent * 0.07, 0.3, 0.75);
  if (rng() < winChance) {
    p.skills.push(skill.id);
    return log('success', `賭對了！${p.name} 正式學會了「${skill.name}」。`);
  }

  // 賭輸：一半機率能力受挫掉一點，一半機率換成壞習慣
  const role = p.position === 'P' ? 'pitcher' : 'batter';
  const badPool = skillsFor(role, false)
    .filter((s) => skillAllowed(s, p.abilities) && !p.skills.includes(s.id));

  if (rng() < 0.5 || !badPool.length) {
    const statId = skill.req.stat;
    const drop = 3 + Math.floor(rng() * 5);
    p.abilities[statId] = Math.max(1, p.abilities[statId] - drop);
    return log('fail', `賭輸了。練過頭傷到手感，${STAT_NAME_LOOKUP[statId] || statId} −${drop}。`);
  }

  const bad = badPool[Math.floor(rng() * badPool.length)];
  p.skills.push(bad.id);
  return log('fail', `賭輸了，還練壞了習慣——${p.name} 多了一個「${bad.name}」。`);
}

// ── 7. 學長回來幫忙（職棒選手探班）──────────────────────
//
// 打得夠好的三年級退隊時可能被職棒選走（見 game.js 的 checkDraft）。
// 選走之後，偶爾會在練習週跳出來探班，帶一點實質的幫助回來——
// 這是純加分的事件，沒有賭輸的風險，算是長期栽培出好選手的回報。

/** 每個練習週跳出探班事件的機率（前提是至少有一個人被選進職棒） */
export const ALUMNI_VISIT_CHANCE = 0.08;

/** 這一週要不要跳探班事件。回傳被選進職棒的其中一人，或 null */
export function rollAlumniVisit(game, rng = Math.random) {
  const pool = game.proAlumni || [];
  if (!pool.length) return null;
  const chance = ALUMNI_VISIT_CHANCE + modifiers(game).alumniChance;
  if (rng() >= chance) return null;
  return pickOne(pool, rng);
}

/** 請學長指導，或請他辦簽名會 */
export function resolveAlumniVisit(game, choice, rng = Math.random) {
  const a = game.pendingAlumniVisit;
  if (!a) return null;
  game.pendingAlumniVisit = null;

  let note;
  if (choice === 'signing') {
    game.extraFame = (game.extraFame || 0) + 6;
    note = `${a.name} 學長回來辦簽名會，地方報紙又報導了一次學校的棒球隊。`;
  } else {
    const role = a.position === 'P' ? 'pitcher' : 'batter';
    const stats = role === 'pitcher' ? PITCHER_STATS : BATTER_STATS;
    const stat = stats[Math.floor(rng() * stats.length)];
    const n = bump(canPlay(game), stat.id, 4);
    note = `${a.name} 學長回來指導了一下午。${n} 個人的${stat.name}進步了。`;
  }

  return {
    week: game.cursor.abs,
    kind: 'alumni',
    event: '職棒學長回來探班',
    alumniResult: { name: a.name, note },
  };
}

// ── 8. 校務投資（永久升級，讓學校越帶越強）──────────────
//
// 遊戲不會自己結束，球員會一直畢業、一直換血，但學校本身可以越蓋越大。
// 每年三年級退隊時，那一年的戰績會換成「傳承點數」，可以拿去買升級——
// 升級是永久的，不會因為換了一批球員、甚至傳統整套重抽就消失。
// 這是「一年比一年強」的主要來源，跟球員本身的成長是兩條線。

/** 每提升一級，下一級要多花多少點 */
export const UPGRADE_COST_STEP = 2;

export const UPGRADES = [
  {
    id: 'facility',
    name: '訓練設備',
    desc: '練習成長 +6%（可疊加）',
    baseCost: 3,
    apply: (m) => { m.trainGain *= 1.06; },
  },
  {
    id: 'dorm',
    name: '宿舍擴建',
    desc: '部員上限 +2、每年自己來的新生 +2',
    baseCost: 3,
    apply: (m) => { m.rosterBonus += 2; m.walkOnBonus += 2; },
  },
  {
    id: 'clinic',
    name: '運動醫學中心',
    desc: '養傷速度 +20%、比賽受傷機率 −8%',
    baseCost: 4,
    apply: (m) => { m.healSpeed *= 1.2; m.matchInjury *= 0.92; },
  },
  {
    id: 'network',
    name: '校友網絡',
    desc: '注目度 +5、學長探班機率 +3%',
    baseCost: 4,
    apply: (m) => { m.fame += 5; m.alumniChance += 0.03; },
  },
  {
    id: 'reputation',
    name: '招生口碑',
    desc: '招生名單多 1 個人、好感度門檻 −4',
    baseCost: 5,
    apply: (m) => { m.scoutExtra += 1; m.thresholdCut += 4; },
  },
  {
    id: 'academy',
    name: '英才培育',
    desc: '之後加入的新人（新生、轉學生），每項能力上限 +3',
    baseCost: 6,
    apply: (m) => { m.potentialBonus += 3; },
  },
];

export const upgradeById = (id) => UPGRADES.find((u) => u.id === id);

/** 這個升級現在要花多少點才能再買一級 */
export function upgradeCost(game, id) {
  const u = upgradeById(id);
  if (!u) return Infinity;
  const level = (game.upgrades && game.upgrades[id]) || 0;
  return u.baseCost + level * UPGRADE_COST_STEP;
}

/** 買一級升級。點數不夠會失敗，回傳有沒有買成功 */
export function buyUpgrade(game, id) {
  const u = upgradeById(id);
  if (!u) return false;
  const cost = upgradeCost(game, id);
  if ((game.legacyPoints || 0) < cost) return false;
  game.legacyPoints -= cost;
  game.upgrades = game.upgrades || {};
  game.upgrades[id] = (game.upgrades[id] || 0) + 1;
  return true;
}

/** 各種成績能換到多少傳承點數（跟注目度的 FAME 表結構一樣，但這是可以花掉的） */
const LEGACY_POINTS = {
  koshienChampion: 8,
  koshienEntry: 4,
  senbatsuChampion: 5,
  senbatsuEntry: 2,
  autumnAreaChampion: 2,
  regionalFinal: 1,
};

/**
 * 這一年賺了多少傳承點數。撐過一年就有 3 點保底——這個保底很重要，
 * 不然打不出成績的年份完全沒有進展，違背「每年都能有所成長」的設計目標。
 * 打得越好、送越多人進職棒，賺得越多。
 */
export function legacyPointsFor(yearProgress, draftedCount = 0) {
  const p = yearProgress || {};
  let pts = 3;
  if (p.regional?.champion) pts += LEGACY_POINTS.koshienEntry;
  else if (p.regional?.lastRound === '冠軍賽') pts += LEGACY_POINTS.regionalFinal;
  if (p.koshien?.champion) pts += LEGACY_POINTS.koshienChampion;
  if (p.autumnArea?.champion) pts += LEGACY_POINTS.autumnAreaChampion;
  if (p.senbatsu) pts += LEGACY_POINTS.senbatsuEntry;
  if (p.senbatsu?.champion) pts += LEGACY_POINTS.senbatsuChampion;
  pts += draftedCount * 3;
  return pts;
}

// ── 9. 學力與考試 ───────────────────────────────────────
//
// 夏／秋／春的大賽開打前各有一次期末考（跟真的日本學校學期對得上）。
// 學力越高越容易過，考不過的人下一輪大賽不能出賽，直到下次考試重考。
// 保底：就算全隊考爛，也一定留 EXAM_MIN_ELIGIBLE 個人能上場，
// 不然球隊會因為一次爛考試直接湊不出 9 人開不成賽。

export const EXAM_MIN_ELIGIBLE = 12;

/**
 * 及格機率照學力的字母等級分，不是連續公式——這樣「畫面上寫 A 卻不及格」
 * 才不會常常發生。A／S 幾乎穩過（極少數的意外，不是常態），
 * 真正有風險的是 D 以下。
 */
const EXAM_PASS_BY_GRADE = {
  S: 0.99, A: 0.97, B: 0.95, C: 0.90, D: 0.82, E: 0.70, F: 0.55, G: 0.40,
};
const examPassChance = (p) => EXAM_PASS_BY_GRADE[grade(p.gakuryoku)];

/**
 * 考期末考。回傳 { failed: [名字...] } 給畫面顯示，
 * game.examBanned 存不能出賽的球員 id，下次考試會整批重算（不會一路禁到畢業）。
 */
export function resolveExam(game, rng = Math.random) {
  const players = active(game.team.players);
  const passed = [];
  const failed = [];
  players.forEach((p) => {
    if (rng() < examPassChance(p)) passed.push(p); else failed.push(p);
  });

  // 保底：學力最高的那幾個「補考」過，不會真的把隊伍打到湊不出人
  failed.sort((a, b) => b.gakuryoku - a.gakuryoku);
  const floor = Math.min(EXAM_MIN_ELIGIBLE, players.length);
  while (passed.length < floor && failed.length) {
    passed.push(failed.shift());
  }

  game.examBanned = failed.map((p) => p.id);
  return { failed: failed.map((p) => ({ name: p.name, gakuryoku: p.gakuryoku })) };
}

// 停賽是「學力不夠」造成的，考完之後如果靠讀書／事件把學力拉回安全範圍，
// 就不該還掛著禁賽——不然會出現「畫面上明明是 A、C 卻還在停賽」這種
// 看起來像壞掉的怪事。每週都檢查一次，跟停賽原因（學力）保持一致。
const EXAM_SAFE_GRADES = new Set(['S', 'A', 'B', 'C']);

/** 學力已經追回安全等級的人，直接解除停賽，不用等到下次考試 */
export function refreshExamEligibility(game) {
  if (!game.examBanned?.length) return;
  game.examBanned = game.examBanned.filter((id) => {
    const p = game.team.players.find((x) => x.id === id && !x.retired);
    if (!p) return false;
    return !EXAM_SAFE_GRADES.has(grade(p.gakuryoku));
  });
}

// ── 10. 球隊經理 ────────────────────────────────────────
//
// 一年招一個經理（一年級入學），三年後跟球員一樣畢業——
// 常態會有 2〜3 個經理同時在（一、二、三年級各一個）。
// 每個經理入學時就定了一個固定的特殊能力，好壞都有可能：
// 大部分是幫忙（降低受傷、加快養傷、多一點注目度……），
// 但也有機率是「幫倒忙」型的，這是真實的一部分，不是每個經理都好用。

export const MANAGER_SKILLS = [
  {
    id: 'meticulous', name: '細心', good: true,
    desc: '做事很仔細，練習和比賽的受傷機率都 −8%。',
    apply: (m) => { m.matchInjury *= 0.92; m.trainInjury *= 0.92; },
  },
  {
    id: 'healer', name: '照顧周到', good: true,
    desc: '很會照顧養傷中的人，養傷速度 +15%。',
    apply: (m) => { m.healSpeed *= 1.15; },
  },
  {
    id: 'connections', name: '人面很廣', good: true,
    desc: '認識很多校外的人，注目度 +3、招生名單多 1 個人。',
    apply: (m) => { m.fame += 3; m.scoutExtra += 1; },
  },
  {
    id: 'cheerleader', name: '氣氛帶動者', good: true,
    desc: '很會炒熱氣氛，打練習賽的時候士氣多拉回 1 週。',
    apply: (m) => { m.moraleRewind += 1; },
  },
  {
    id: 'clumsy', name: '手忙腳亂', good: false,
    desc: '常常狀況外，練習和比賽的受傷機率都 +10%。',
    apply: (m) => { m.matchInjury *= 1.1; m.trainInjury *= 1.1; },
  },
  {
    id: 'strict', name: '要求嚴格', good: false,
    desc: '對來看的國中生太嚴格，好感度門檻反而變高。',
    apply: (m) => { m.thresholdCut -= 3; },
  },
];

export const managerSkillById = (id) => MANAGER_SKILLS.find((s) => s.id === id);

/**
 * 隨機生一個新經理。好能力的機率比較高（7 成），但壞能力是真的存在，
 * 不是每個經理都對球隊有幫助——這是設計上刻意保留的風險。
 */
export function createManager(gradeYear, rng = Math.random) {
  const wantGood = rng() < 0.7;
  const pool = MANAGER_SKILLS.filter((s) => s.good === wantGood);
  const skill = pickOne(pool.length ? pool : MANAGER_SKILLS, rng);
  return {
    id: `m${Math.floor(rng() * 1e9).toString(36)}`,
    name: randomManagerName(rng),
    gradeYear,
    retired: false,
    skillId: skill.id,
  };
}

/** 還在隊上的經理（跟 active(players) 是一樣的概念） */
export const activeManagers = (managers) => (managers || []).filter((m) => !m.retired);

// ── 11. 畢業去向與校友錄 ────────────────────────────────
//
// 沒被職棒選走的畢業生（和畢業的經理）也該有個去處，不是就這樣消失。
// 這裡抽出來的都是「花絮」等級的隨機結果，不影響任何數值，
// 純粹是給校友錄畫面回顧用的。天賦、學力越高的人，越可能抽到
// 「繼續打球」或「升學」這類比較風光的結果，但完全不保證。

export const GRADUATE_PATHS = [
  {
    id: 'collegeBall', label: '考上大學，繼續打棒球',
    weight: (p) => 2 + (p?.talent || 1),
  },
  {
    id: 'shakaijin', label: '進了社會人球隊，繼續打球',
    weight: (p) => 1 + Math.max(0, (p?.talent || 1) - 2),
  },
  {
    id: 'college', label: '考上大學，專心讀書去了',
    weight: (p) => 3 + (p?.gakuryoku ?? 50) / 20,
  },
  {
    id: 'job', label: '畢業後直接就業',
    weight: () => 3,
  },
  {
    id: 'family', label: '回家繼承家業',
    weight: () => 1,
  },
  // 以下是故意安排得比較誇張的去向——「千奇百怪」本身就是賣點，
  // 每一個都掛了一個對應的 WILD_ALUMNI_JOBS，之後偶爾會回來探班。
  {
    id: 'youtuber', label: '當了 YouTuber，靠當年打球的故事開頻道',
    weight: () => 1,
  },
  {
    id: 'vtuber', label: '轉行當 VTuber，沒人知道螢幕後面是他',
    weight: () => 1,
  },
  {
    id: 'idol', label: '出道當偶像，完全看不出來以前是打棒球的',
    weight: () => 1,
  },
  {
    id: 'underworld', label: '聽說混進了道上，好像混得還不錯（不要問細節）',
    weight: () => 1,
  },
  {
    id: 'nurse', label: '考上護理，現在在醫院上班',
    weight: () => 1,
  },
  {
    id: 'hairdresser', label: '開了間理髮店，手藝意外地好',
    weight: () => 1,
  },
  // 再加一批，讓「千奇百怪」名符其實——大部分是純花絮，沒有回訪效果，
  // 只有 coach、commentator 特別安排了 WILD_ALUMNI_JOBS（跟棒球還有關係）。
  {
    id: 'firefighter', label: '考上消防員，體能派上用場',
    weight: () => 1,
  },
  {
    id: 'police', label: '考上警察，在地方上算是個人物',
    weight: () => 1,
  },
  {
    id: 'chef', label: '開了間拉麵店，意外地好吃',
    weight: () => 1,
  },
  {
    id: 'coach', label: '回母校附近的少棒隊當教練，把這套棒球魂傳下去',
    weight: (p) => 1 + Math.max(0, (p?.talent || 1) - 2),
  },
  {
    id: 'peTeacher', label: '考上體育老師，還是天天泡在球場旁邊',
    weight: () => 1,
  },
  {
    id: 'salesman', label: '進了保險業，同學會最怕遇到他',
    weight: () => 1,
  },
  {
    id: 'civilServant', label: '考上公務員，過上安穩生活',
    weight: (p) => 1 + (p?.gakuryoku ?? 50) / 40,
  },
  {
    id: 'freelancer', label: '接案維生，作息很隨性',
    weight: () => 1,
  },
  {
    id: 'esports', label: '轉戰電競，手速比球速還快',
    weight: () => 1,
  },
  {
    id: 'monk', label: '想通了，剃度出家去了',
    weight: () => 0.6,
  },
  {
    id: 'commentator', label: '在電視台當球評，講起比賽頭頭是道',
    weight: (p) => 1 + Math.max(0, (p?.talent || 1) - 3),
  },
  {
    id: 'doctor', label: '考上醫學系，現在是醫生了',
    weight: (p) => 0.5 + (p?.gakuryoku ?? 50) / 25,
  },
  {
    id: 'lawyer', label: '考上法律系，當了律師',
    weight: (p) => 0.5 + (p?.gakuryoku ?? 50) / 30,
  },
  {
    id: 'traveler', label: '拿著這幾年打工存的錢，環遊世界去了',
    weight: () => 1,
  },
  {
    id: 'fighter', label: '轉練格鬥，聽說戰績還不錯',
    weight: (p) => 1 + Math.max(0, (p?.talent || 1) - 2),
  },
];

export const graduatePathById = (id) => GRADUATE_PATHS.find((g) => g.id === id);

/** 抽一個畢業去向。player 可以是球員或 null（經理沒有 talent／gakuryoku，就用預設值） */
export function rollGraduatePath(player, rng = Math.random) {
  const weighted = GRADUATE_PATHS.map((g) => ({ g, w: Math.max(0.1, g.weight(player)) }));
  const total = weighted.reduce((n, x) => n + x.w, 0);
  let r = rng() * total;
  for (const { g, w } of weighted) {
    r -= w;
    if (r <= 0) return g.id;
  }
  return weighted[weighted.length - 1].g.id;
}

// ── 12. 畢業生回訪（千奇百怪的畢業去向）────────────────
//
// 跟第 7 節的「職棒學長探班」是同一種概念，但對象是走上 YouTuber、
// VTuber、偶像……這些路的畢業生。效果比職棒學長小一點、也搞笑一點，
// 沒有選擇，直接收下就好——重點是花絮的樂趣，不是又一個要精算的決策。

export const WILD_ALUMNI_JOBS = {
  youtuber: {
    name: 'YouTuber',
    apply(game) {
      game.extraFame = (game.extraFame || 0) + 4;
      return '回來拍了一支「特訓大公開」的影片，意外爆紅，注目度 +4。';
    },
  },
  vtuber: {
    name: 'VTuber',
    apply(game) {
      game.extraFame = (game.extraFame || 0) + 4;
      return '用 VTuber 的身份直播幫忙宣傳，留言區洗版式應援，注目度 +4。';
    },
  },
  idol: {
    name: '偶像',
    apply(game) {
      game.morale.weeksSinceMatch = Math.max(0, game.morale.weeksSinceMatch - 2);
      return '回來幫大家加油打氣，士氣好像充飽電了一樣。';
    },
  },
  underworld: {
    name: '道上兄弟',
    apply(game) {
      game.legacyPoints = (game.legacyPoints || 0) + 2;
      return '塞了一筆來路不明的「贊助費」，還是別追問細節比較好——傳承點數 +2。';
    },
  },
  nurse: {
    name: '護士',
    apply(game) {
      const hurt = active(game.team.players).filter((p) => isInjured(p));
      if (hurt.length) {
        hurt.forEach((p) => {
          p.injury.weeks = Math.max(0, p.injury.weeks - 2);
          if (p.injury.weeks <= 0) p.injury = null;
        });
        return `幫養傷中的人看了診，${hurt.length} 個人的傷好得比較快了。`;
      }
      active(game.team.players).forEach((p) => { p.fatigue = Math.max(0, (p.fatigue || 0) - 15); });
      return '幫全隊做了一次健康檢查，大家都比較不累了。';
    },
  },
  hairdresser: {
    name: '理髮師',
    apply(game) {
      active(game.team.players).forEach((p) => { p.fatigue = Math.max(0, (p.fatigue || 0) - 15); });
      return '免費幫全隊剪頭髮，剪完神清氣爽，大家都比較不累了。';
    },
  },
  coach: {
    name: '少棒教練',
    apply(game, rng = Math.random) {
      const picked = someone(game, 4, rng);
      const stats = [...BATTER_STATS, ...PITCHER_STATS];
      const stat = stats[Math.floor(rng() * stats.length)];
      const n = bump(picked, stat.id, 3);
      return `回來指導了一個下午，把當年那套棒球魂傳下去，${n} 個人的${stat.name}進步了。`;
    },
  },
  commentator: {
    name: '球評',
    apply(game) {
      game.extraFame = (game.extraFame || 0) + 5;
      return '在轉播上特別提到母校，講得頭頭是道，注目度 +5。';
    },
  },
};

/** 每個練習週跳出畢業生回訪事件的機率（前提是校友錄裡至少有一個千奇百怪的去向） */
export const WILD_VISIT_CHANCE = 0.05;

/** 這一週要不要跳畢業生回訪事件。回傳被抽到的那個校友，或 null */
export function rollWildVisit(game, rng = Math.random) {
  const pool = (game.alumni || []).filter((a) => WILD_ALUMNI_JOBS[a.path]);
  if (!pool.length) return null;
  if (rng() >= WILD_VISIT_CHANCE) return null;
  return pickOne(pool, rng);
}

/** 收下這次回訪帶來的小驚喜 */
export function resolveWildVisit(game) {
  const a = game.pendingWildVisit;
  if (!a) return null;
  game.pendingWildVisit = null;
  const job = WILD_ALUMNI_JOBS[a.path];
  const note = job.apply(game);
  return {
    week: game.cursor.abs,
    kind: 'wildVisit',
    event: `畢業的${job.name}回來串門子`,
    wildVisitResult: { name: a.name, job: job.name, note },
  };
}

// ── 13. 奇妙事件（比賽當天偶爾發生的小插曲）───────────────
//
// 跟第 2 節的「突發事件」不一樣：那個是練習週、玩家要選；這個是比賽週，
// 系統直接決定，只影響那一週的比賽，跟對手特色一樣打完就沒了，
// 不用玩家做任何選擇。有正面也有負面，其中「被知名 YouTuber 盯上」
// 需要注目度夠高才會出現——名氣越大，招來的關注不見得都是好事。

/**
 * 每個比賽週跳出奇妙事件的機率（前提是至少有一個事件的條件成立）。
 * 設 1 是刻意的——每週都要有花絮，這樣才有「每週都在發生什麼事」的感覺。
 */
export const WONDER_EVENT_CHANCE = 1;

export const WONDER_EVENTS = [
  {
    id: 'hihi',
    name: '被知名棒球 YouTuber 盯上了',
    negative: true,
    desc: '一位 J 開頭、超有名的棒球 YouTuber 也在關注這場比賽，鏡頭一多大家都不自在，被「hihi」了一下。',
    available: (game, fame) => fame >= 60,
    apply: (m) => {
      m.meet -= 6; m.power -= 6; m.defence -= 6;
      m.control -= 6; m.stuff -= 6; m.speed -= 4;
    },
  },
  {
    id: 'packedStands',
    name: '看台坐滿了',
    negative: false,
    desc: '名氣夠大，這場比賽看台坐得滿滿的，加油聲勢驚人。',
    available: (game, fame) => fame >= 25,
    apply: (m) => { m.meet += 5; m.power += 5; m.control += 3; },
  },
  {
    id: 'localNews',
    name: '地方新聞來採訪',
    negative: false,
    desc: '地方電視台來拍新聞，難得上鏡，大家都打起精神來。',
    available: () => true,
    apply: (m) => { m.meet += 4; m.power += 3; m.defence += 3; },
  },
  {
    id: 'rainyField',
    name: '賽前下了場雨',
    negative: true,
    desc: '比賽前下了場雨，場地有點泥濘，球感、腳步都受影響。',
    available: () => true,
    apply: (m) => { m.defence -= 6; m.speed -= 5; m.control -= 4; },
  },
  {
    id: 'goodBento',
    name: '中午的便當特別好吃',
    negative: false,
    desc: '不知道為什麼，今天的便當特別好吃，大家心情都很好。',
    available: () => true,
    apply: (m) => { m.meet += 2; m.power += 2; },
  },
];

export const wonderEventById = (id) => WONDER_EVENTS.find((e) => e.id === id);

/**
 * 這一週的比賽要不要跳奇妙事件。fame 要先算好傳進來（scouting.js 的
 * fameOf 反過來也要用到這個檔案的 modifiers，直接 import 會變成循環依賴）。
 */
export function rollWonderEvent(game, fame, rng = Math.random) {
  const pool = WONDER_EVENTS.filter((e) => e.available(game, fame));
  if (!pool.length || rng() >= WONDER_EVENT_CHANCE) return null;
  return pickOne(pool, rng);
}

// ── 13b. 奇妙事件（練習週版：學園祭、運動會、戀愛、惡搞）─────
//
// 跟上面比賽週的奇妙事件是同一個概念，只是換成練習週會遇到的花絮——
// 不用玩家選，練完當週的練習之後直接跳出結果，跟「突發事件」（兩個
// 選項要玩家選）是不同的東西，這個純粹是錦上添花的驚喜。
// 「學姐回來開演唱會」要校友錄裡真的有一個當偶像的經理才會出現，
// 呼應第 12 節畢業生回訪——她已經畢業了，這是難得的返校演出。
//
// 學園祭、運動會這種一年只會辦一次的活動，掛了 yearlyGroup 標記——
// 同一個 yearlyGroup 一年只會抽中一次（不管抽到的是哪一個子事件），
// 抽過之後那個 group 要等到明年才會再出現，不然學園祭一年跳好幾次
// 就很奇怪。

// 設 1 是刻意的——每個練習週都要有花絮，跟比賽週那邊一樣
export const TRAINING_WONDER_EVENT_CHANCE = 1;

export const TRAINING_WONDER_EVENTS = [
  {
    id: 'idolConcert',
    name: '學姐回來開迷你演唱會',
    yearlyGroup: 'schoolFestival',
    available: (game) => (game.alumni || []).some((a) => a.role === 'manager' && a.path === 'idol'),
    apply: (game) => {
      game.extraFame = (game.extraFame || 0) + 10;
      cheerUp(game, 3);
      return {
        note: '學園祭那天，當偶像的學姐回母校開了一場迷你演唱會，全校擠得水洩不通，'
          + '注目度 +10，士氣也跟著沸騰起來。',
        negative: false,
      };
    },
  },
  {
    id: 'sportsDay',
    name: '運動會',
    yearlyGroup: 'sportsDay',
    available: () => true,
    apply: (game, rng) => {
      const picked = someone(game, 6, rng);
      const n = bump(picked, 'speed', 3) + bump(picked, 'power', 2);
      return {
        note: `運動會辦得很熱血，大隊接力、拔河都練得很兇，${n} 人次的體能悄悄變好了。`,
        negative: false,
      };
    },
  },
  {
    id: 'schoolFairStall',
    name: '學園祭擺攤',
    yearlyGroup: 'schoolFestival',
    available: () => true,
    apply: (game) => {
      game.extraFame = (game.extraFame || 0) + 5;
      return { note: '棒球隊在學園祭擺了攤，意外大成功，還上了校內新聞，注目度 +5。', negative: false };
    },
  },
  {
    id: 'confession',
    name: '學園祭告白事件',
    yearlyGroup: 'schoolFestival',
    available: (game) => canPlay(game).length > 0,
    apply: (game, rng) => {
      const p = pickOne(canPlay(game), rng);
      if (rng() < 0.5) {
        const stats = p.position === 'P' ? PITCHER_STATS : BATTER_STATS;
        const stat = stats[Math.floor(rng() * stats.length)];
        bump([p], stat.id, 3);
        return {
          note: `${p.name} 在學園祭被告白，還答應了。戀愛的力量讓他這幾天狀態特別好，${stat.name}進步了。`,
          negative: false,
        };
      }
      p.fatigue = clamp((p.fatigue || 0) + 8, 0, 100);
      return {
        note: `${p.name} 在學園祭告白失敗了，這幾天有點心不在焉，練習有點恍神。`,
        negative: true,
      };
    },
  },
  {
    id: 'prank',
    name: '惡作劇',
    available: () => true,
    apply: (game) => {
      cheerUp(game, 1);
      return { note: '有人在教練室門口設了整人陷阱，全隊笑到不行，氣氛意外變好了。', negative: false };
    },
  },
  {
    id: 'scandal',
    name: '爆出小醜聞',
    // 太沒沒無聞的學校不會有人八卦——要先小有名氣（注目度 >= 15）才會被盯上，
    // 跟「看台坐滿」（25）、「被YouTuber盯上」（60）是同一條「越紅越麻煩」的路線，
    // 只是這是最先開始出現的那一階。
    available: (game, fame) => fame >= 15,
    apply: (game, rng) => {
      const loss = 4 + Math.floor(rng() * 5);
      game.extraFame = Math.max(0, (game.extraFame || 0) - loss);
      return {
        note: `不知道哪裡傳出關於球隊的謠言，鬧了一陣子小風波，注目度 −${loss}。`,
        negative: true,
      };
    },
  },
  {
    id: 'clubExchange',
    name: '校際交流賽',
    available: () => true,
    apply: (game, rng) => {
      const picked = someone(game, 5, rng);
      const n = bump(picked, 'meet', 2) + bump(picked, 'field', 2);
      return { note: `跟鄰校社團辦了場交流賽，難得跟不同風格的對手練習，${n} 人次悄悄變好了。`, negative: false };
    },
  },
  {
    id: 'coldSeason',
    name: '集體感冒',
    available: () => true,
    apply: (game, rng) => {
      const picked = someone(game, 5, rng);
      picked.forEach((p) => { p.fatigue = clamp((p.fatigue || 0) + 10, 0, 100); });
      return { note: `換季的時候隊上一口氣有${picked.length}個人感冒，練習有點沒力氣。`, negative: true };
    },
  },
  {
    id: 'newGear',
    name: '廠商來試裝備',
    available: () => true,
    apply: (game, rng) => {
      const picked = someone(game, 4, rng);
      const n = bump(picked, 'catch', 2) + bump(picked, 'arm', 2);
      return { note: `體育用品廠商來讓大家試新手套，${n} 人次手感意外變好了。`, negative: false };
    },
  },
  {
    id: 'emptyStall',
    name: '擺攤生意冷清',
    yearlyGroup: 'schoolFestival',
    available: () => true,
    apply: (game) => {
      game.extraFame = Math.max(0, (game.extraFame || 0) - 3);
      return { note: '學園祭擺的攤沒什麼人來，大家有點小尷尬，注目度 −3。', negative: true };
    },
  },
  {
    id: 'obVisit',
    name: '熱心校友來加油',
    available: () => true,
    apply: (game) => {
      cheerUp(game, 1);
      return { note: '一個不知道哪一屆的學長突然出現在球場邊加油，大家精神都來了。', negative: false };
    },
  },
  {
    id: 'targetedByYoutuber',
    name: '被知名棒球YouTuber點名關注了',
    // 隊伍本身要先小有名氣才會被盯上，跟「被知名YouTuber盯上」（比賽週
    // 版，60）是同一條「越紅越麻煩」路線上更早的一階，但這次是點名
    // 「某一個人」，不是全隊——比賽週那個是全隊那天都不自在，
    // 這個是單一球員接下來幾場比賽都會受影響。
    available: (game, fame) => fame >= 40 && canPlay(game).length > 0,
    apply: (game, rng) => {
      const p = pickOne(canPlay(game), rng);
      p.badConditionGames = (p.badConditionGames || 0) + 2;
      let note = `一位 J 開頭、超有名的棒球 YouTuber 在影片裡點名關注了 ${p.name}，`
        + '壓力一下子變好大，接下來兩場比賽狀態應該會很差。';
      if (rng() < 0.35) {
        const inj = injure(p, rng);
        note += `而且練習時一個閃神受傷了——${inj.label}（${inj.cause}），要休養 ${inj.weeks} 週。`;
      }
      return { note, negative: true };
    },
  },
  {
    id: 'proScoutVisit',
    name: '職棒球探默默關注',
    available: (game) => canPlay(game).length > 0,
    apply: (game, rng) => {
      const p = pickOne(canPlay(game), rng);
      const gain = 6 + Math.floor(rng() * 8);
      p.scoutAttention = Math.min(100, (p.scoutAttention || 0) + gain);
      return {
        note: `有個職棒球探默默來看了幾次球，${p.name} 被記在筆記本上了，球探注目度 +${gain}。`,
        negative: false,
      };
    },
  },
  {
    id: 'universityInvite',
    name: '大學球隊來邀約練習賽',
    available: () => true,
    apply: (game, rng) => {
      const picked = someone(game, 5, rng);
      const n = bump(picked, 'power', 2) + bump(picked, 'control', 2);
      return {
        note: `附近的大學棒球隊來邀約練習賽，跟程度更高的對手交手，${n} 人次悄悄變好了。`,
        negative: false,
      };
    },
  },
  {
    id: 'corporateTeamVisit',
    name: '社會人球隊來交流',
    available: () => true,
    apply: (game, rng) => {
      const picked = someone(game, 5, rng);
      const n = bump(picked, 'stamina', 2) + bump(picked, 'field', 2);
      return {
        note: `附近的社會人球隊來交流，老練的球風讓大家學到不少，${n} 人次悄悄變好了。`,
        negative: false,
      };
    },
  },
];

export const trainingWonderEventById = (id) => TRAINING_WONDER_EVENTS.find((e) => e.id === id);

/**
 * 這一週的練習要不要跳奇妙事件。跟比賽週那個獨立，兩邊互不影響。
 * fame 要先算好傳進來，理由跟 rollWonderEvent 一樣（避免循環 import）。
 *
 * yearlyGroup 的事件（學園祭、運動會）一年只會抽中一次——抽到之後
 * 把這個 group 標記成「這一年用過了」，同一年不會再抽到同一組的
 * 任何一個子事件，明年才會重新開放。
 */
export function rollTrainingWonderEvent(game, fame, rng = Math.random) {
  const usedThisYear = (group) => (game.yearlyEventsUsed || {})[group] === game.cursor.year;
  const pool = TRAINING_WONDER_EVENTS
    .filter((e) => e.available(game, fame) && (!e.yearlyGroup || !usedThisYear(e.yearlyGroup)));
  if (!pool.length || rng() >= TRAINING_WONDER_EVENT_CHANCE) return null;
  const ev = pickOne(pool, rng);
  if (ev.yearlyGroup) {
    game.yearlyEventsUsed = game.yearlyEventsUsed || {};
    game.yearlyEventsUsed[ev.yearlyGroup] = game.cursor.year;
  }
  const { note, negative } = ev.apply(game, rng);
  return {
    id: ev.id, name: ev.name, desc: note, negative: !!negative,
  };
}

export { clamp };
