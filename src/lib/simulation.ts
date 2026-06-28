import type { Attributes, AttributeKey, Character, DispositionId, LogEntry, Rival } from "./types";
import { DISPOSITIONS, getDisposition } from "./dispositions";
import { getEra, ERA_SPAN } from "./eras";
import { resolveGame, resolveRivalGame } from "./strategy";
import {
  dispositionEvent,
  eraFlavorEvent,
  MILESTONES,
  randomRivalName,
} from "./events";
import { nextWonder } from "./wonders";
import { captureSnapshot } from "./scene";
import { chaosR, logisticStep, makeRng } from "./chaos";

export const BASE_YEARS_PER_SECOND = 0.4; // at speed = 1 (보통)
export const MAX_LOG_ENTRIES = 240;

const BASE_GROWTH = 0.12; // per year, every attribute
const START_TERRITORY = 7;
const MAX_TERRITORY = 13;
const MAX_RIVALS = 5;

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

/** Tech gained per year. 정신(spirit) now contributes — insight drives progress. */
function techRate(character: Character): number {
  const disp = getDisposition(character.disposition);
  const a = character.attributes;
  const mind = a.knowledge * 0.6 + a.creativity * 0.4 + a.spirit * 0.15;
  return (0.3 + mind / 220) * disp.techAffinity * (character.techMult ?? 1);
}

/** Years until the next event — grows with age but is capped so events never dry up. */
function choiceInterval(age: number): number {
  return Math.min(20, Math.max(4, age * 0.12));
}

/** Civilization score the realm must reach for its next territorial expansion. */
function expandThreshold(territory: number): number {
  return 70 * Math.pow(1.4, territory - START_TERRITORY);
}

function civScore(c: Character): number {
  const a = c.attributes;
  return a.knowledge + a.creativity + a.wealth + a.charisma;
}

export interface AdvanceResult {
  character: Character;
  newLogs: LogEntry[];
}

export function advance(character: Character, dtYears: number): AdvanceResult {
  const disp = getDisposition(character.disposition);
  const c: Character = {
    ...character,
    attributes: { ...character.attributes },
    rivals: character.rivals.map((r) => ({ ...r })),
    milestones: [...character.milestones],
    wonders: [...character.wonders],
  };
  const newLogs: LogEntry[] = [];

  let remaining = Math.min(dtYears, 4000); // safety clamp for very long gaps
  const STEP = 1;
  const r = chaosR(c.seed);

  const log = (type: LogEntry["type"], title: string, description: string) =>
    newLogs.push({
      id: uid(),
      gameYear: Math.floor(c.age),
      eraName: getEra(c.techLevel).name,
      type,
      title,
      description,
      snapshot: captureSnapshot(c, title),
    });

  while (remaining > 0) {
    const dt = Math.min(STEP, remaining);
    remaining -= dt;

    const prevEraIndex = getEra(c.techLevel).index;

    // --- chaotic fortune (logistic map) ---
    c.chaos = logisticStep(c.chaos, r);
    const fortune = c.chaos;
    const growthMult = 0.55 + fortune * 1.1;

    // --- growth ---
    const growth: Partial<Attributes> = {};
    (Object.keys(c.attributes) as AttributeKey[]).forEach((k) => {
      const bias = disp.growth[k] ?? 0;
      growth[k] = (BASE_GROWTH + bias) * growthMult * dt;
    });
    c.attributes = addAttrs(c.attributes, growth);
    c.age += dt;
    c.techLevel += techRate(c) * (0.7 + fortune * 0.6) * dt;

    // --- era advancement ---
    const era = getEra(c.techLevel);
    if (era.index > prevEraIndex) {
      log(
        "era",
        `${era.name} 진입`,
        `${Math.floor(c.age)}세, ${c.name}은(는) 새로운 시대의 문턱을 넘었다. ${era.description}`,
      );
    }

    // --- territory expansion (decoupled from era; fires when civ crosses a rising bar) ---
    if (c.territory < MAX_TERRITORY) {
      const threshold = expandThreshold(c.territory);
      if (civScore(c) >= threshold && fortune > 0.35) {
        c.territory += 1;
        log(
          "expand",
          `영토 확장 (${c.territory - 1}→${c.territory})`,
          `${era.name}, 문명 지수 ${Math.floor(civScore(c))}이(가) 임계(${Math.floor(
            threshold,
          )})를 넘어섰다. 시류가 따라준 덕에 ${c.name}의 영역이 더 넓은 대지로 확장되었다.`,
        );
      }
    }

    // --- great wonders: built when the realm clears a wonder's conditions ---
    {
      const wrand = rngFrom((c.seed ^ 0x77de) + c.wonders.length * 6151 + Math.floor(c.age));
      const w = nextWonder(c, era.index, wrand);
      if (w) {
        c.wonders.push(w.id);
        if (w.effect.attrBonus) c.attributes = addAttrs(c.attributes, w.effect.attrBonus);
        if (w.effect.techMult) c.techMult = (c.techMult ?? 1) * w.effect.techMult;
        if (w.effect.territory) c.territory = Math.min(MAX_TERRITORY, c.territory + w.effect.territory);
        log("wonder", `불가사의 건립: ${w.name}`, `${era.name}, ${Math.floor(c.age)}세. ${w.blurb}`);
      }
    }

    // --- important events (game / flavour / theme / rival), capped cadence ---
    if (c.age >= c.nextChoiceAge) {
      c.nextChoiceAge += choiceInterval(c.age);
      const rand = rngFrom((Math.floor(c.age) * 2654435761) ^ (c.seed + c.choicesMade * 40503));
      c.choicesMade += 1;
      const roll = rand();

      if (roll < 0.4) {
        // game-theoretic decision
        const res = resolveGame(c, disp, era, fortune, rand);
        c.attributes = addAttrs(c.attributes, res.reward);
        if (res.techDelta) c.techLevel += res.techDelta;
        log(res.setback ? "setback" : "choice", res.title, res.description);
      } else if (roll < 0.65) {
        // era flavour event
        const ev = eraFlavorEvent(c, era, fortune, rand);
        c.attributes = addAttrs(c.attributes, ev.reward);
        log(ev.type, ev.title, ev.description);
      } else if (roll < 0.82) {
        // disposition-themed personal event
        const ev = dispositionEvent(c, disp, era, fortune, rand);
        c.attributes = addAttrs(c.attributes, ev.reward);
        log(ev.type, ev.title, ev.description);
      } else {
        // relationship event with a recurring rival
        const rival = pickOrCreateRival(c, rand);
        const res = resolveRivalGame(c, rival, disp, fortune, rand);
        c.attributes = addAttrs(c.attributes, res.reward);
        rival.affinity = Math.max(-100, Math.min(100, rival.affinity + res.affinityDelta));
        rival.lastCooperated = res.rivalCooperated;
        log("rival", res.title, res.description);
      }
    }

    // --- legendary milestones (fire once each) ---
    for (const m of MILESTONES) {
      if (!c.milestones.includes(m.id) && m.test(c)) {
        c.milestones.push(m.id);
        log("legend", `🏛️ ${m.title}`, m.text(c));
      }
    }
  }

  return { character: c, newLogs };
}

function pickOrCreateRival(c: Character, rand: () => number): Rival {
  if (c.rivals.length > 0 && (c.rivals.length >= MAX_RIVALS || rand() < 0.6)) {
    return c.rivals[Math.floor(rand() * c.rivals.length)];
  }
  // Find a name not already in play (so the cast stays distinct).
  let name = randomRivalName(rand);
  for (let i = 0; i < 8 && c.rivals.some((r) => r.name === name); i++) {
    name = randomRivalName(rand);
  }
  if (c.rivals.some((r) => r.name === name)) {
    // pool exhausted — reuse an existing acquaintance instead of duplicating
    return c.rivals[Math.floor(rand() * c.rivals.length)];
  }
  const dispId = DISPOSITIONS[Math.floor(rand() * DISPOSITIONS.length)].id as DispositionId;
  const rival: Rival = { name, disposition: dispId, affinity: 0, lastCooperated: true };
  c.rivals.push(rival);
  return rival;
}

export function createCharacter(name: string, disposition: Character["disposition"]): Character {
  const seed =
    ((Date.now() >>> 0) ^ Math.floor(Math.random() * 0xffffffff) ^ (Math.random() * 0x9e3779b9)) >>> 0;
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
    nextChoiceAge: 3,
    rivals: [],
    milestones: [],
    wonders: [],
    techMult: 1,
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
  const disp = getDisposition(character.disposition);
  return {
    id: uid(),
    gameYear: 0,
    eraName: era.name,
    type: "birth",
    title: `${character.name} 탄생`,
    description: `${era.name}, 한 불멸의 존재가 태어났다. ${disp.name}의 길을 걷게 될 ${character.name}. ${disp.description} 죽음이 없는 그의 연대기가 지금 시작된다.`,
    snapshot: captureSnapshot(character, `${character.name} 탄생`),
  };
}

/** Convenience used by the store to keep the log bounded. */
export function trimLog(log: LogEntry[]): LogEntry[] {
  if (log.length <= MAX_LOG_ENTRIES) return log;
  return log.slice(log.length - MAX_LOG_ENTRIES);
}

export { ERA_SPAN };
