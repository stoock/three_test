import type { Attributes, AttributeKey, Character, Disposition, DispositionId, Era, Rival } from "./types";
import { attrLabel } from "./events";

// Game-theory engine. Every important choice is framed as a 2-strategy game
// played against a chaotic environment. The character is a *bounded-rational*
// agent: it favours the higher-expected-payoff strategy but chooses via a
// softmax (mixed strategy), so it is never fully predictable. The environment's
// hidden move is the logistic "fortune" draw, so outcomes — including
// setbacks — diverge between runs. High 정신(spirit) lets a character "master
// fate", nudging outcomes in its favour.

interface Strat {
  label: string;
  attrs: AttributeKey[];
  base: number; // payoff magnitude
  risk: number; // 0 = safe, 1 = high variance (can backfire)
}

interface GameDef {
  name: string;
  intro: (era: Era) => string;
  a: Strat;
  b: Strat;
}

const GAMES: GameDef[] = [
  {
    name: "죄수의 딜레마",
    intro: (e) => `${e.name}, 협력과 배신 사이의 고전적 딜레마가 펼쳐졌다`,
    a: { label: "협력", attrs: ["charisma", "spirit"], base: 1.0, risk: 0.2 },
    b: { label: "배신", attrs: ["wealth", "strength"], base: 1.4, risk: 0.85 },
  },
  {
    name: "매-비둘기 게임",
    intro: (e) => `${e.name}, 자원을 두고 강경과 회피의 수싸움이 벌어졌다`,
    a: { label: "매(강경)", attrs: ["strength", "charisma"], base: 1.3, risk: 0.8 },
    b: { label: "비둘기(회피)", attrs: ["spirit", "knowledge"], base: 0.9, risk: 0.25 },
  },
  {
    name: "탐색-활용 딜레마",
    intro: (e) => `${e.name}, 미지의 가능성과 확실한 이득 사이에서 균형을 재었다`,
    a: { label: "탐색", attrs: ["knowledge", "creativity"], base: 1.2, risk: 0.7 },
    b: { label: "활용", attrs: ["wealth", "strength"], base: 1.0, risk: 0.3 },
  },
  {
    name: "사슴 사냥",
    intro: (e) => `${e.name}, 위험한 공조와 안전한 단독행동의 갈림길에 섰다`,
    a: { label: "공조(사슴)", attrs: ["wealth", "charisma"], base: 1.5, risk: 0.75 },
    b: { label: "단독(토끼)", attrs: ["strength", "spirit"], base: 0.85, risk: 0.2 },
  },
  {
    name: "공유지의 비극",
    intro: (e) => `${e.name}, 공동의 자원을 절제할지 독차지할지 결정해야 했다`,
    a: { label: "절제", attrs: ["spirit", "knowledge"], base: 0.95, risk: 0.25 },
    b: { label: "남용", attrs: ["wealth", "creativity"], base: 1.45, risk: 0.9 },
  },
];

function utility(strat: Strat, disp: Disposition): number {
  let aff = 0;
  for (const k of strat.attrs) aff += disp.growth[k] ?? 0.15;
  return strat.base * 0.6 + aff;
}

/** 정신이 높을수록 운명을 다스려 결과가 유리해진다(최대 +0.18). */
function spiritEdge(c: Character): number {
  return Math.min(0.18, c.attributes.spirit / 1500);
}

export interface GameResult {
  title: string;
  description: string;
  reward: Partial<Attributes>;
  setback: boolean;
  /** Extra tech progress granted by a decisive victory. */
  techDelta: number;
}

const SCALE = 16;

export function resolveGame(
  character: Character,
  disp: Disposition,
  era: Era,
  fortune: number,
  rand: () => number,
): GameResult {
  const game = GAMES[Math.floor(rand() * GAMES.length)];

  const uA = utility(game.a, disp);
  const uB = utility(game.b, disp);
  const T = 0.35 + 0.9 * fortune;
  const eA = Math.exp(uA / T);
  const eB = Math.exp(uB / T);
  const pA = eA / (eA + eB);
  const chose = rand() < pA ? game.a : game.b;

  // The environment's favour, nudged by the character's mastery of fate (정신).
  const favour = Math.min(1, 0.5 * fortune + 0.5 * rand() + spiritEdge(character));
  const outcome = chose.base * (favour * 1.7 - chose.risk * 0.55);
  const setback = outcome < 0;

  const per = (outcome * SCALE) / chose.attrs.length;
  const reward: Partial<Attributes> = {};
  for (const k of chose.attrs) reward[k] = (reward[k] ?? 0) + per;

  // Even failure teaches: a small 지식/정신 consolation softens the loss.
  if (setback) {
    reward.knowledge = (reward.knowledge ?? 0) + 4;
    reward.spirit = (reward.spirit ?? 0) + 5;
  }

  const techDelta = !setback && outcome > 0.9 ? outcome * 3 : 0;

  const gained = chose.attrs.map((k) => attrLabel(k)).join("·");
  const favourWord = favour > 0.6 ? "시류가 유리하게 흘렀고" : favour > 0.4 ? "상황은 팽팽했으나" : "운이 따르지 않았지만";
  const resultWord = setback
    ? `결과는 뼈아픈 시련이 되어 ${gained}에 손실을 남겼다(하지만 값진 교훈을 얻었다)`
    : techDelta > 0
      ? `${gained}이(가) 크게 단단해졌고, 결단이 시대의 진보마저 앞당겼다`
      : `${gained}이(가) 단단해졌다`;

  const title = `${game.name}: ${chose.label}`;
  const description = `${game.intro(era)}. ${Math.floor(
    character.age,
  )}세의 ${character.name}은(는) ${disp.name}답게 '${chose.label}' 전략을 택했다(선택 확률 ${Math.round(
    (chose === game.a ? pA : 1 - pA) * 100,
  )}%). ${favourWord} ${resultWord}.`;

  return { title, description, reward, setback, techDelta };
}

// ---- rivals: repeated Prisoner's Dilemma with tit-for-tat ----------------

const COOP_BASE: Record<DispositionId, number> = {
  leader: 0.62,
  merchant: 0.6,
  mystic: 0.58,
  scholar: 0.55,
  artisan: 0.52,
  explorer: 0.48,
  warrior: 0.38,
};

export interface RivalResult {
  title: string;
  description: string;
  reward: Partial<Attributes>;
  affinityDelta: number;
  rivalCooperated: boolean;
  type: "rival";
}

/**
 * One round of a repeated game with a recurring acquaintance. The character
 * plays roughly tit-for-tat (cooperate if the rival cooperated last time),
 * tempered by disposition and fortune. Relationships drift toward friendship
 * or enmity over many encounters — generating ongoing human drama in the log.
 */
export function resolveRivalGame(
  character: Character,
  rival: Rival,
  disp: Disposition,
  fortune: number,
  rand: () => number,
): RivalResult {
  // Character's move: tit-for-tat around its disposition's cooperativeness.
  let coopP = COOP_BASE[disp.id] + (rival.lastCooperated ? 0.28 : -0.22) + (fortune - 0.5) * 0.25;
  coopP = Math.max(0.05, Math.min(0.95, coopP));
  const charCoop = rand() < coopP;

  // Rival's move: its own disposition + warmth of the relationship.
  let rCoopP = COOP_BASE[rival.disposition] + rival.affinity / 200;
  rCoopP = Math.max(0.05, Math.min(0.95, rCoopP));
  const rivalCoop = rand() < rCoopP;

  const reward: Partial<Attributes> = {};
  let affinityDelta = 0;
  let outcomeText = "";

  if (charCoop && rivalCoop) {
    reward.charisma = 12;
    reward.wealth = 10;
    affinityDelta = 12;
    outcomeText = "둘 다 손을 맞잡아 함께 번영했다";
  } else if (charCoop && !rivalCoop) {
    reward.spirit = 8;
    reward.knowledge = 4;
    affinityDelta = -22;
    outcomeText = `${character.name}이(가) 내민 손을 ${rival.name}이(가) 뿌리쳤다. 배신의 상처가 남았다`;
  } else if (!charCoop && rivalCoop) {
    reward.wealth = 18;
    reward.strength = 6;
    affinityDelta = -14;
    outcomeText = `${character.name}이(가) ${rival.name}의 신뢰를 이용해 이득을 챙겼다`;
  } else {
    reward.strength = 6;
    affinityDelta = -6;
    outcomeText = "둘 다 경계하며 맞서 별 소득 없이 갈라섰다";
  }

  const bond =
    rival.affinity + affinityDelta >= 50
      ? "이제 둘은 둘도 없는 벗이다"
      : rival.affinity + affinityDelta <= -50
        ? "둘은 시대를 가로지르는 숙적이 되었다"
        : "둘의 관계는 미묘하게 출렁였다";

  const title = `${rival.name}와(과)의 ${charCoop && rivalCoop ? "공조" : affinityDelta < -15 ? "대립" : "거래"}`;
  const description = `${Math.floor(character.age)}세, 또다시 마주친 ${rival.name}(${
    getDispName(rival.disposition)
  }). ${outcomeText}. ${bond}.`;

  return { title, description, reward, affinityDelta, rivalCooperated: rivalCoop, type: "rival" };
}

function getDispName(id: DispositionId): string {
  const map: Record<DispositionId, string> = {
    explorer: "탐험가",
    scholar: "학자",
    warrior: "전사",
    artisan: "장인",
    merchant: "상인",
    mystic: "신비주의자",
    leader: "지도자",
  };
  return map[id];
}
