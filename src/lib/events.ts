import type { AttributeKey } from "./types";

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
