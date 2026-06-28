import type { AttributeKey, Attributes, Character, DispositionId } from "./types";

// Great historical landmarks. Silhouettes mirror real-world wonders; names are
// fictionalised so the world keeps its own identity. One or two appear per era
// when conditions are met, chosen deterministically from the world seed.

export type Silhouette =
  | "pyramid" // stepped pyramid / ziggurat
  | "henge" // ring of standing stones
  | "colonnade" // columned temple with pediment
  | "arena" // tiered oval ring
  | "dome" // great dome on a base
  | "spire" // tall cathedral with a steeple
  | "hall" // long glass-and-iron hall
  | "lattice" // tapered lattice tower (Eiffel-like)
  | "rocket" // launch gantry with a rocket
  | "core" // giant faceted neon polyhedron
  | "beam" // space elevator beam (screen overlay)
  | "ring"; // orbital ring / Dyson arc (screen overlay)

export interface Wonder {
  id: string;
  name: string; // Korean display name
  motif: string; // English real-world inspiration
  eraIndex: number; // earliest era it can appear
  civThreshold: number;
  reqAttr?: { key: AttributeKey; min: number };
  reqDisposition?: DispositionId;
  effect: {
    attrBonus?: Partial<Attributes>;
    techMult?: number; // permanent multiplier (e.g. 1.05)
    territory?: number; // immediate +N grid
  };
  footprint: number; // how many city tiles it reserves (visual scale)
  silhouette: Silhouette;
  blurb: string;
}

export const WONDERS: Wonder[] = [
  {
    id: "sun-tomb",
    name: "태양의 대분묘",
    motif: "Great Pyramid",
    eraIndex: 0,
    civThreshold: 120,
    effect: { attrBonus: { spirit: 30, charisma: 15 }, territory: 1 },
    footprint: 2,
    silhouette: "pyramid",
    blurb: "사막의 지평선을 가르며 거대한 돌무덤이 솟았다. 불멸자의 이름이 영원에 새겨진다.",
  },
  {
    id: "standing-stones",
    name: "선돌 환상열석",
    motif: "Stonehenge",
    eraIndex: 0,
    civThreshold: 60,
    reqAttr: { key: "spirit", min: 40 },
    effect: { attrBonus: { spirit: 25, knowledge: 10 } },
    footprint: 1,
    silhouette: "henge",
    blurb: "거석들이 하늘의 운행에 맞추어 둥글게 세워졌다. 운명의 격동이 한결 잦아든다.",
  },
  {
    id: "sky-stair",
    name: "하늘 계단 신전",
    motif: "Ziggurat",
    eraIndex: 1,
    civThreshold: 220,
    effect: { attrBonus: { knowledge: 25, charisma: 15 }, techMult: 1.04 },
    footprint: 2,
    silhouette: "pyramid",
    blurb: "신들에게 닿으려는 계단이 층층이 쌓였다. 도시는 별을 읽기 시작한다.",
  },
  {
    id: "colonnade",
    name: "신들의 열주전",
    motif: "Parthenon",
    eraIndex: 2,
    civThreshold: 320,
    effect: { attrBonus: { charisma: 30, spirit: 20 } },
    footprint: 2,
    silhouette: "colonnade",
    blurb: "흰 대리석 기둥이 줄지어 신전을 떠받친다. 도시의 자부심이 하늘을 찌른다.",
  },
  {
    id: "grand-arena",
    name: "대원형 투기장",
    motif: "Colosseum",
    eraIndex: 2,
    civThreshold: 380,
    reqAttr: { key: "strength", min: 90 },
    effect: { attrBonus: { strength: 40, charisma: 15 } },
    footprint: 2,
    silhouette: "arena",
    blurb: "수만 군중의 함성이 돌벽을 울린다. 영웅과 비극이 모래 위에 새겨진다.",
  },
  {
    id: "endless-wall",
    name: "만리 성벽",
    motif: "Great Wall",
    eraIndex: 3,
    civThreshold: 470,
    effect: { territory: 1, attrBonus: { strength: 25 } },
    footprint: 2,
    silhouette: "colonnade",
    blurb: "끝이 보이지 않는 성벽이 변경을 따라 뻗는다. 시대의 격동에도 영역은 굳건하다.",
  },
  {
    id: "great-cathedral",
    name: "첨탑 대성당",
    motif: "Gothic Cathedral",
    eraIndex: 3,
    civThreshold: 520,
    effect: { attrBonus: { charisma: 35, spirit: 25 } },
    footprint: 2,
    silhouette: "spire",
    blurb: "스테인드글라스가 빛을 물들이고 첨탑이 구름을 가른다. 신앙이 돌로 빚어졌다.",
  },
  {
    id: "domed-basilica",
    name: "대원개 성당",
    motif: "Renaissance Dome",
    eraIndex: 4,
    civThreshold: 620,
    reqAttr: { key: "creativity", min: 130 },
    effect: { attrBonus: { creativity: 40 }, techMult: 1.05 },
    footprint: 2,
    silhouette: "dome",
    blurb: "거대한 돔이 도시를 굽어본다. 예술과 기하가 하나로 완성되었다.",
  },
  {
    id: "crystal-hall",
    name: "수정 대궁전",
    motif: "Crystal Palace",
    eraIndex: 5,
    civThreshold: 700,
    effect: { attrBonus: { wealth: 50 }, techMult: 1.06 },
    footprint: 2,
    silhouette: "hall",
    blurb: "유리와 강철로 지은 거대한 전당이 빛을 머금는다. 산업의 위용이 전시된다.",
  },
  {
    id: "iron-spire",
    name: "강철 첨탑",
    motif: "Eiffel Tower",
    eraIndex: 6,
    civThreshold: 760,
    effect: { attrBonus: { charisma: 45, creativity: 20 } },
    footprint: 2,
    silhouette: "lattice",
    blurb: "하늘을 찌르는 격자 철탑이 도시의 상징이 된다. 근대의 야망이 우뚝 섰다.",
  },
  {
    id: "world-skyport",
    name: "세계 관문 공항",
    motif: "Mega Airport",
    eraIndex: 7,
    civThreshold: 840,
    effect: { attrBonus: { wealth: 50, charisma: 20 }, techMult: 1.06 },
    footprint: 3,
    silhouette: "hall",
    blurb: "세계의 길이 한 점으로 모인다. 빛의 활주로 위로 끝없는 왕래가 흐른다.",
  },
  {
    id: "launch-spire",
    name: "궤도 발사대",
    motif: "Launch Complex",
    eraIndex: 8,
    civThreshold: 920,
    effect: { attrBonus: { knowledge: 50 }, techMult: 1.08, territory: 1 },
    footprint: 2,
    silhouette: "rocket",
    blurb: "거대한 발사탑에서 불기둥이 솟는다. 문명은 마침내 중력을 벗어난다.",
  },
  {
    id: "orbital-ring",
    name: "궤도 고리",
    motif: "Orbital Ring",
    eraIndex: 8,
    civThreshold: 980,
    reqAttr: { key: "knowledge", min: 320 },
    effect: { attrBonus: { knowledge: 80, spirit: 20 }, techMult: 1.05 },
    footprint: 1,
    silhouette: "ring",
    blurb: "행성을 두른 빛의 고리가 하늘을 가로지른다. 별은 이제 이웃이 되었다.",
  },
  {
    id: "space-elevator",
    name: "궤도 엘리베이터",
    motif: "Space Elevator",
    eraIndex: 9,
    civThreshold: 1100,
    effect: { techMult: 1.1, territory: 1, attrBonus: { knowledge: 60 } },
    footprint: 1,
    silhouette: "beam",
    blurb: "지상에서 우주로 뻗은 한 줄기 빛의 기둥. 하늘과 땅의 경계가 사라진다.",
  },
  {
    id: "dyson-ring",
    name: "다이슨 환",
    motif: "Dyson Swarm",
    eraIndex: 9,
    civThreshold: 1400,
    reqAttr: { key: "knowledge", min: 500 },
    effect: { attrBonus: { knowledge: 120, creativity: 80, wealth: 80 }, techMult: 1.12 },
    footprint: 1,
    silhouette: "ring",
    blurb: "별 하나를 통째로 에워싼 구조물이 그 빛을 거둔다. 문명은 항성의 주인이 된다.",
  },
  {
    id: "arcology-core",
    name: "아콜로지 코어",
    motif: "Arcology",
    eraIndex: 9,
    civThreshold: 1250,
    effect: { attrBonus: { creativity: 100, charisma: 60 }, techMult: 1.06 },
    footprint: 2,
    silhouette: "core",
    blurb: "도시 전체가 하나의 생명체처럼 빛나는 거대 다면체로 응축된다.",
  },
];

function civScore(c: Character): number {
  const a = c.attributes;
  return a.knowledge + a.creativity + a.wealth + a.charisma;
}

/**
 * Picks one not-yet-built wonder whose conditions are currently met, chosen
 * deterministically from the seed so each life builds a different set. Returns
 * null if none qualifies right now.
 */
export function nextWonder(c: Character, eraIndex: number, rand: () => number): Wonder | null {
  const score = civScore(c);
  const eligible = WONDERS.filter(
    (w) =>
      !c.wonders.includes(w.id) &&
      eraIndex >= w.eraIndex &&
      score >= w.civThreshold &&
      (!w.reqAttr || c.attributes[w.reqAttr.key] >= w.reqAttr.min) &&
      (!w.reqDisposition || w.reqDisposition === c.disposition),
  );
  if (eligible.length === 0) return null;
  return eligible[Math.floor(rand() * eligible.length)];
}

export function getWonder(id: string): Wonder | undefined {
  return WONDERS.find((w) => w.id === id);
}
