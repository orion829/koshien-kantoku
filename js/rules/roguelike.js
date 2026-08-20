// Roguelike 要素
//
// 這個檔案放「每一局都不一樣」的東西。分成六種：
//
//   1. 傳統   一局裡會遇到 5 次三選一，選到的效果整局都有效
//   2. 突發事件 每個練習週都會遇到一個，兩個選項各有好壞
//   3. 作戰   比賽週開打前三選一，只影響這一週的比賽
//   4. 對手特色 每支對手學校都有一個特色，不是每場都一樣
//   5. 轉學生 一年一定會遇到一個，隨機年級，極低機率是超神等級
//   6. 能力覺醒 能力練過門檻時可能跳卡片，賭贏學會新能力，
//             賭輸能力會掉或換來壞習慣
//
// 所有的加成都寫進同一個「加成表」（mods），
// 這樣比賽、練習、招生只要看這張表就好，不用到處寫 if。

import { createPlayer } from './player.js';
import { addRecruits, active } from './roster.js';
import { injure } from './injury.js';
import {
  MAX_ABILITY, BATTER_STATS, PITCHER_STATS, POSITIONS, skillsFor, skillById,
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
];

export const eventById = (id) => EVENTS.find((e) => e.id === id);

/**
 * 這一週要不要跳事件。現在是每個練習週都會遇到一個（chance 預設 1），
 * 保留 chance 參數只是方便以後想調整、或測試用。
 */
export function rollEvent(game, rng = Math.random, chance = 1) {
  if (rng() >= chance) return null;
  const recent = new Set(game.recentEvents || []);
  const pool = EVENTS.filter((e) => !recent.has(e.id));
  const ev = pickOne(pool.length ? pool : EVENTS, rng);
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

export { clamp };
