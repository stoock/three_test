import type { Attributes, AttributeKey, Character, LogEntry } from "./types";
import { getDisposition } from "./dispositions";
import { getEra, ERA_SPAN } from "./eras";
import { generateChoice, choiceReward } from "./events";
import { captureSnapshot } from "./scene";

export const BASE_YEARS_PER_SECOND = 0.4; // at speed = 1 (보통)
export const MAX_LOG_ENTRIES = 120;

const BASE_GROWTH = 0.12; // per year, every attribute

function rngFrom(seed: number): () => number {
  let s = Math.floor(seed) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function addAttrs(attrs: Attributes, delta: Partial<Attributes>): Attributes {
  const out = { ...attrs };
  for (const k of Object.keys(delta) as AttributeKey[]) {
    out[k] = Math.max(0, out[k] + (delta[k] ?? 0));
  }
  return out;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Tech gained per year given the character's mind and disposition. */
function techRate(character: Character): number {
  const disp = getDisposition(character.disposition);
  const mind = character.attributes.knowledge * 0.6 + character.attributes.creativity * 0.4;
  return (0.3 + mind / 220) * disp.techAffinity;
}

/** Years until the character's next important choice — spaces out as it ages. */
function choiceInterval(age: number): number {
  return Math.max(4, age * 0.18);
}

export interface AdvanceResult {
  character: Character;
  newLogs: LogEntry[];
}

/**
 * Advances the simulation by `dtYears`, stepping year-by-year so era crossings
 * and important choices are never skipped. Returns the new character plus any
 * log entries (with snapshots) generated during the interval.
 */
export function advance(character: Character, dtYears: number): AdvanceResult {
  const disp = getDisposition(character.disposition);
  let c: Character = { ...character, attributes: { ...character.attributes } };
  const newLogs: LogEntry[] = [];

  let remaining = Math.min(dtYears, 4000); // safety clamp for very long gaps
  const STEP = 1;

  while (remaining > 0) {
    const dt = Math.min(STEP, remaining);
    remaining -= dt;

    const prevEraIndex = getEra(c.techLevel).index;

    // --- growth ---
    const growth: Partial<Attributes> = {};
    (Object.keys(c.attributes) as AttributeKey[]).forEach((k) => {
      const bias = disp.growth[k] ?? 0;
      growth[k] = (BASE_GROWTH + bias) * dt;
    });
    c.attributes = addAttrs(c.attributes, growth);
    c.age += dt;
    c.techLevel += techRate(c) * dt;

    // --- era advancement ---
    const era = getEra(c.techLevel);
    if (era.index > prevEraIndex) {
      newLogs.push({
        id: uid(),
        gameYear: Math.floor(c.age),
        eraName: era.name,
        type: "era",
        title: `${era.name} 진입`,
        description: `${Math.floor(c.age)}세, ${c.name}은(는) 새로운 시대의 문턱을 넘었다. ${era.description}`,
        snapshot: captureSnapshot(c, `${era.name} 진입`),
      });
    }

    // --- important choices ---
    if (c.age >= nextChoiceThreshold(c)) {
      const rand = rngFrom(Math.floor(c.age * 1000) + c.choicesMade * 7 + era.index * 13);
      const choice = generateChoice(c, disp, era, rand);
      c.attributes = addAttrs(c.attributes, choiceReward(disp));
      c.choicesMade += 1;
      newLogs.push({
        id: uid(),
        gameYear: Math.floor(c.age),
        eraName: era.name,
        type: "choice",
        title: choice.title,
        description: choice.description,
        snapshot: captureSnapshot(c, choice.title),
      });
    }
  }

  return { character: c, newLogs };
}

// We schedule choices by accumulated count: the Nth choice happens once age
// reaches the running sum of intervals. Approximated incrementally so it stays
// cheap: store choicesMade and derive the next age from it.
function nextChoiceThreshold(c: Character): number {
  // Reconstruct an approximate next-choice age from how many have been made.
  // Intervals grow with age, so we step the schedule forward from a small base.
  let age = 3;
  for (let i = 0; i < c.choicesMade; i++) {
    age += choiceInterval(age);
  }
  return age;
}

export function createCharacter(name: string, disposition: Character["disposition"]): Character {
  return {
    name: name.trim() || "이름없는 자",
    disposition,
    age: 0,
    techLevel: 0,
    choicesMade: 0,
    attributes: {
      knowledge: 5,
      strength: 5,
      creativity: 5,
      charisma: 5,
      spirit: 5,
      wealth: 5,
    },
  };
}

export function birthLog(character: Character): LogEntry {
  const era = getEra(character.techLevel);
  return {
    id: uid(),
    gameYear: 0,
    eraName: era.name,
    type: "birth",
    title: `${character.name} 탄생`,
    description: `${era.name}, 한 불멸의 존재가 태어났다. ${getDisposition(
      character.disposition,
    ).name}의 길을 걷게 될 ${character.name}의 끝없는 여정이 시작된다.`,
    snapshot: captureSnapshot(character, `${character.name} 탄생`),
  };
}

/** Convenience used by the store to keep the log bounded. */
export function trimLog(log: LogEntry[]): LogEntry[] {
  if (log.length <= MAX_LOG_ENTRIES) return log;
  return log.slice(log.length - MAX_LOG_ENTRIES);
}

export { ERA_SPAN };
