import type { Attributes, AttributeKey, Character, LogEntry } from "./types";
import { getDisposition } from "./dispositions";
import { getEra, ERA_SPAN } from "./eras";
import { resolveGame } from "./strategy";
import { captureSnapshot } from "./scene";
import { chaosR, logisticStep, makeRng } from "./chaos";

export const BASE_YEARS_PER_SECOND = 0.4; // at speed = 1 (보통)
export const MAX_LOG_ENTRIES = 120;

const BASE_GROWTH = 0.12; // per year, every attribute
const START_TERRITORY = 5;
const MAX_TERRITORY = 13;

function rngFrom(seed: number): () => number {
  return makeRng(seed >>> 0);
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
  const r = chaosR(c.seed);

  while (remaining > 0) {
    const dt = Math.min(STEP, remaining);
    remaining -= dt;

    const prevEraIndex = getEra(c.techLevel).index;

    // --- chaotic fortune (logistic map) ---
    // Evolve once per whole year so the orbit stays in its chaotic regime.
    c.chaos = logisticStep(c.chaos, r);
    const fortune = c.chaos; // (0,1): low = lean years, high = boom years
    const growthMult = 0.55 + fortune * 1.1; // 0.55× .. 1.65× — never identical

    // --- growth ---
    const growth: Partial<Attributes> = {};
    (Object.keys(c.attributes) as AttributeKey[]).forEach((k) => {
      const bias = disp.growth[k] ?? 0;
      growth[k] = (BASE_GROWTH + bias) * growthMult * dt;
    });
    c.attributes = addAttrs(c.attributes, growth);
    c.age += dt;
    c.techLevel += techRate(c) * (0.7 + fortune * 0.6) * dt;

    // --- era advancement (+ possible territory expansion) ---
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

      // Meaningful condition for the realm to grow: a civilization score must
      // clear a rising threshold, AND fortune must be on the realm's side.
      if (c.territory < MAX_TERRITORY) {
        const civScore =
          c.attributes.knowledge +
          c.attributes.creativity +
          c.attributes.wealth +
          c.attributes.charisma;
        const threshold = expandThreshold(c.territory);
        if (civScore >= threshold && fortune > 0.35) {
          c.territory += 1;
          newLogs.push({
            id: uid(),
            gameYear: Math.floor(c.age),
            eraName: era.name,
            type: "expand",
            title: `영토 확장 (${c.territory - 1}→${c.territory})`,
            description: `${era.name}, 문명 지수 ${Math.floor(
              civScore,
            )}이(가) 임계(${Math.floor(
              threshold,
            )})를 넘어섰다. 시류가 따라준 덕에 ${c.name}의 영역이 더 넓은 대지로 확장되었다.`,
            snapshot: captureSnapshot(c, `영토 확장 → ${c.territory}`),
          });
        }
      }
    }

    // --- important choices, resolved as game-theoretic decisions ---
    if (c.age >= nextChoiceThreshold(c)) {
      const rand = rngFrom((Math.floor(c.age) * 2654435761) ^ (c.seed + c.choicesMade * 40503));
      const result = resolveGame(c, disp, era, fortune, rand);
      c.attributes = addAttrs(c.attributes, result.reward);
      c.choicesMade += 1;
      newLogs.push({
        id: uid(),
        gameYear: Math.floor(c.age),
        eraName: era.name,
        type: result.setback ? "milestone" : "choice",
        title: result.title,
        description: result.description,
        snapshot: captureSnapshot(c, result.title),
      });
    }
  }

  return { character: c, newLogs };
}

/** Civilization score the realm must reach for its next territorial expansion. */
function expandThreshold(territory: number): number {
  return 70 * Math.pow(1.85, territory - START_TERRITORY);
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
  // A fresh, high-entropy seed per life — guarantees no two runs are alike.
  const seed =
    ((Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff) ^ (Math.random() * 0x9e3779b9)) >>> 0;
  // Initial chaos state: sensitive dependence means this tiny value matters.
  const chaos = 0.2 + makeRng(seed)() * 0.6;
  return {
    name: name.trim() || "이름없는 자",
    disposition,
    age: 0,
    techLevel: 0,
    choicesMade: 0,
    seed,
    chaos,
    territory: START_TERRITORY,
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
