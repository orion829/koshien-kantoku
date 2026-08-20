// Roguelike 要素
//
// 這個檔案放「每一局都不一樣」的東西。分成四種：
//
//   1. 傳統   一局裡會遇到 5 次三選一，選到的效果整局都有效
//   2. 突發事件 練習週有機率跳出來，兩個選項各有好壞
//   3. 作戰   比賽週開打前三選一，只影響這一週的比賽
//   4. 對手特色 每支對手學校都有一個特色，不是每場都一樣
//
// 所有的加成都寫進同一個「加成表」（mods），
// 這樣比賽、練習、招生只要看這張表就好，不用到處寫 if。

import { createPlayer } from './player.js';
import { addRecruits, active } from './roster.js';
import { injure } from './injury.js';
import { MAX_ABILITY } from '../data/abilities.js';

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
];

export const eventById = (id) => EVENTS.find((e) => e.id === id);

/** 這一週要不要跳事件。回傳事件的 id，或 null */
export function rollEvent(game, rng = Math.random, chance = 0.18) {
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
  game.recentEvents = [...(game.recentEvents || []), ev.id].slice(-4);

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

export { clamp };
