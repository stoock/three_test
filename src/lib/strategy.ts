import type { Attributes, AttributeKey, Character, Disposition, Era } from "./types";
import { attrLabel } from "./events";

// Game-theory engine. Every important choice is framed as a 2-strategy game
// played against a chaotic environment. The character is a *bounded-rational*
// agent: it favours the higher-expected-payoff strategy but chooses via a
// softmax (mixed strategy), so it is never fully predictable. The environment's
// hidden move is the logistic "fortune" draw, so outcomes — including
// setbacks — diverge between runs.

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
  // The character values strategies that build the attributes its disposition
  // already favours, plus the raw payoff.
  let aff = 0;
  for (const k of strat.attrs) aff += disp.growth[k] ?? 0.15;
  return strat.base * 0.6 + aff;
}

export interface GameResult {
  title: string;
  description: string;
  reward: Partial<Attributes>;
  setback: boolean;
}

/**
 * Resolves one strategic game.
 * @param fortune the chaotic environment state in (0,1) — the "opponent's move".
 * @param rand    seeded RNG for the mixed-strategy draw.
 */
export function resolveGame(
  character: Character,
  disp: Disposition,
  era: Era,
  fortune: number,
  rand: () => number,
): GameResult {
  const game = GAMES[Math.floor(rand() * GAMES.length)];

  // Bounded-rational softmax choice. Temperature rises with fortune-driven
  // chaos, so in turbulent times the choice is more erratic.
  const uA = utility(game.a, disp);
  const uB = utility(game.b, disp);
  const T = 0.35 + 0.9 * fortune;
  const eA = Math.exp(uA / T);
  const eB = Math.exp(uB / T);
  const pA = eA / (eA + eB);
  const chose = rand() < pA ? game.a : game.b;

  // The environment's favour: a fresh draw blended with the chaotic fortune.
  const favour = 0.5 * fortune + 0.5 * rand();
  // High-risk strategies swing hard with favour and can go negative.
  const outcome = chose.base * (favour * 1.9 - chose.risk * 0.85);
  const setback = outcome < 0;

  const scale = 5;
  const per = (outcome * scale) / chose.attrs.length;
  const reward: Partial<Attributes> = {};
  for (const k of chose.attrs) reward[k] = (reward[k] ?? 0) + per;

  const gained = chose.attrs.map((k) => attrLabel(k)).join("·");
  const favourWord = favour > 0.6 ? "시류가 유리하게 흘렀고" : favour > 0.4 ? "상황은 팽팽했으나" : "운이 따르지 않았지만";
  const resultWord = setback
    ? `결과는 뼈아픈 시련이 되어 ${gained}에 손실을 남겼다`
    : `${gained}이(가) 크게 단단해졌다`;

  const title = `${game.name}: ${chose.label}`;
  const description = `${game.intro(era)}. ${Math.floor(
    character.age,
  )}세의 ${character.name}은(는) ${disp.name}답게 '${chose.label}' 전략을 택했다(선택 확률 ${Math.round(
    (chose === game.a ? pA : 1 - pA) * 100,
  )}%). ${favourWord} ${resultWord}.`;

  return { title, description, reward, setback };
}
