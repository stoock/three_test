import type { Attributes, AttributeKey, Character, Disposition, Era } from "./types";

const ATTR_LABEL: Record<AttributeKey, string> = {
  knowledge: "지식",
  strength: "체력",
  creativity: "창의력",
  charisma: "영향력",
  spirit: "정신",
  wealth: "부",
};

export function attrLabel(k: AttributeKey): string {
  return ATTR_LABEL[k];
}

function dominantAttr(attrs: Attributes): AttributeKey {
  return (Object.keys(attrs) as AttributeKey[]).reduce((a, b) => (attrs[a] >= attrs[b] ? a : b));
}

export interface GeneratedChoice {
  title: string;
  description: string;
}

// Produces a flavour "important choice" the character resolves based on its
// disposition. The wording reflects the disposition's themes and the era.
export function generateChoice(
  character: Character,
  disp: Disposition,
  era: Era,
  rand: () => number,
): GeneratedChoice {
  const theme = disp.themes[Math.floor(rand() * disp.themes.length)];
  const dom = dominantAttr(character.attributes);
  const age = Math.floor(character.age);

  const stakes = [
    "갈림길에 섰다",
    "결단의 순간이 왔다",
    "운명을 가를 선택이 놓였다",
    "시대가 그에게 물었다",
  ];
  const stake = stakes[Math.floor(rand() * stakes.length)];

  const title = `${theme}하다`;
  const description = `${era.name}, ${age}세. ${character.name}은(는) ${stake}. ${disp.name}의 본성을 따라 ${theme}하기로 결심했고, 이 선택은 그의 ${ATTR_LABEL[dom]}을(를) 더욱 단단하게 만들었다.`;
  return { title, description };
}

// The reward an important choice grants, weighted by disposition.
export function choiceReward(disp: Disposition): Partial<Attributes> {
  const reward: Partial<Attributes> = {};
  for (const [k, v] of Object.entries(disp.growth) as [AttributeKey, number][]) {
    reward[k] = v * 4; // a choice is worth ~4 years of focused growth
  }
  return reward;
}
