import type { Era } from "./types";

// Each era spans 100 tech points. Beyond the last named era, "초미래" eras are
// generated procedurally so the timeline never ends.
export const ERA_SPAN = 100;

export const ERAS: Era[] = [
  {
    index: 0,
    name: "고대 농경 시대",
    englishName: "Ancient Agricultural Age",
    threshold: 0,
    structure: "hut",
    description: "흙과 씨앗의 시대. 인류는 정착하여 땅을 일구기 시작한다.",
    palette: {
      sky: "#cfe8c2",
      ground: "#8bbf5b",
      ground2: "#79a94f",
      structure: "#b08a4f",
      structureRoof: "#7d5a2e",
      accent: "#e8d27a",
    },
  },
  {
    index: 1,
    name: "청동기 시대",
    englishName: "Bronze Age",
    threshold: 100,
    structure: "temple",
    description: "금속을 다루기 시작하며 도시와 신전이 솟아난다.",
    palette: {
      sky: "#d8d0b0",
      ground: "#9cae64",
      ground2: "#869a55",
      structure: "#c2a878",
      structureRoof: "#9c7b3e",
      accent: "#caa24a",
    },
  },
  {
    index: 2,
    name: "고전 문명 시대",
    englishName: "Classical Age",
    threshold: 200,
    structure: "temple",
    description: "철학과 법, 거대한 제국이 세계를 형성한다.",
    palette: {
      sky: "#cfe0e8",
      ground: "#94b070",
      ground2: "#7f9c5e",
      structure: "#e6e0d2",
      structureRoof: "#b04a3a",
      accent: "#d8c068",
    },
  },
  {
    index: 3,
    name: "중세 시대",
    englishName: "Medieval Age",
    threshold: 300,
    structure: "keep",
    description: "성과 기사의 시대. 신앙과 봉건 질서가 땅을 나눈다.",
    palette: {
      sky: "#b8c4cf",
      ground: "#6f9258",
      ground2: "#5e7f4a",
      structure: "#8d8f96",
      structureRoof: "#5b4a6e",
      accent: "#9c5a3a",
    },
  },
  {
    index: 4,
    name: "르네상스 시대",
    englishName: "Renaissance",
    threshold: 400,
    structure: "manor",
    description: "예술과 과학이 다시 깨어나 인간의 시대를 연다.",
    palette: {
      sky: "#dccfb0",
      ground: "#7fa05e",
      ground2: "#6c8b50",
      structure: "#d8c8a0",
      structureRoof: "#a14a3a",
      accent: "#c8923a",
    },
  },
  {
    index: 5,
    name: "산업 혁명 시대",
    englishName: "Industrial Age",
    threshold: 500,
    structure: "factory",
    description: "증기와 강철. 굴뚝 연기가 하늘을 덮고 기계가 세상을 바꾼다.",
    palette: {
      sky: "#b0a89c",
      ground: "#6e7a52",
      ground2: "#5d6846",
      structure: "#8a4f3a",
      structureRoof: "#5a3a2a",
      accent: "#caa24a",
    },
  },
  {
    index: 6,
    name: "근대 도시 시대",
    englishName: "Modern Age",
    threshold: 600,
    structure: "tower",
    description: "전기와 콘크리트. 도시는 하늘을 향해 솟아오른다.",
    palette: {
      sky: "#aebfcf",
      ground: "#6a7a6a",
      ground2: "#586658",
      structure: "#b6bcc4",
      structureRoof: "#5a6470",
      accent: "#d8c84a",
    },
  },
  {
    index: 7,
    name: "정보화 시대",
    englishName: "Information Age",
    threshold: 700,
    structure: "tower",
    description: "정보가 빛의 속도로 흐른다. 세계가 하나의 그물로 엮인다.",
    palette: {
      sky: "#9fb4cf",
      ground: "#5e6e74",
      ground2: "#4e5c62",
      structure: "#c8d2dc",
      structureRoof: "#3a6e9c",
      accent: "#4ad8c8",
    },
  },
  {
    index: 8,
    name: "우주 시대",
    englishName: "Space Age",
    threshold: 800,
    structure: "dome",
    description: "인류는 중력을 벗어난다. 별들 사이로 첫발을 내딛는다.",
    palette: {
      sky: "#3a3a5e",
      ground: "#6a6a8a",
      ground2: "#5a5a78",
      structure: "#c8d8e8",
      structureRoof: "#5a8ad8",
      accent: "#8ad8ff",
    },
  },
  {
    index: 9,
    name: "초미래 시대",
    englishName: "Ultra-Future Age",
    threshold: 900,
    structure: "arcology",
    description: "물질과 정신의 경계가 흐려진다. 문명은 빛 그 자체가 된다.",
    palette: {
      sky: "#1a1030",
      ground: "#3a2a6a",
      ground2: "#2e2256",
      structure: "#a06aff",
      structureRoof: "#ff6ad8",
      accent: "#6affe8",
    },
  },
];

const ROMAN = ["", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

function romanize(n: number): string {
  if (n <= 0) return "";
  if (n < ROMAN.length) return ROMAN[n];
  return `${n + 1}세대`;
}

/** Returns the era for a given tech level, generating endless ultra-future eras. */
export function getEra(techLevel: number): Era {
  const idx = Math.max(0, Math.floor(techLevel / ERA_SPAN));
  if (idx < ERAS.length) return ERAS[idx];

  // Beyond the last defined era: endless ultra-future generations.
  const last = ERAS[ERAS.length - 1];
  const beyond = idx - (ERAS.length - 1);
  const suffix = romanize(beyond);
  // Slowly shift the palette hue for each new ultra-future generation.
  return {
    ...last,
    index: idx,
    threshold: idx * ERA_SPAN,
    name: `초미래 시대 ${suffix}`.trim(),
    englishName: `Ultra-Future Age ${suffix}`.trim(),
    description: "상상조차 추월한 시대. 문명은 새로운 형태로 끊임없이 초월한다.",
  };
}

/** Progress (0..1) within the current era toward the next. */
export function eraProgress(techLevel: number): number {
  return (techLevel % ERA_SPAN) / ERA_SPAN;
}
