import type { Disposition, DispositionId } from "./types";

export const DISPOSITIONS: Disposition[] = [
  {
    id: "explorer",
    name: "탐험가",
    englishName: "Explorer",
    emoji: "🧭",
    description: "미지를 향한 갈망. 새로운 땅과 가능성을 끊임없이 찾아 나선다.",
    growth: { creativity: 0.9, strength: 0.6, knowledge: 0.5 },
    techAffinity: 1.15,
    themes: ["미지의 땅을 탐험", "새로운 항로를 개척", "위험한 변경을 답사", "잊혀진 유적을 발견"],
  },
  {
    id: "scholar",
    name: "학자",
    englishName: "Scholar",
    emoji: "📚",
    description: "앎이 곧 힘이다. 세계의 법칙을 이해하려 평생을 바친다.",
    growth: { knowledge: 1.3, creativity: 0.6, spirit: 0.3 },
    techAffinity: 1.4,
    themes: ["새로운 학문을 정립", "고대 문헌을 해독", "자연 법칙을 연구", "위대한 이론을 발표"],
  },
  {
    id: "warrior",
    name: "전사",
    englishName: "Warrior",
    emoji: "⚔️",
    description: "강함을 추구한다. 시련을 단련의 기회로 받아들인다.",
    growth: { strength: 1.4, charisma: 0.5, spirit: 0.4 },
    techAffinity: 0.85,
    themes: ["거대한 적과 맞섬", "전장을 누빔", "새로운 무예를 창안", "동료를 지켜냄"],
  },
  {
    id: "artisan",
    name: "장인",
    englishName: "Artisan",
    emoji: "🛠️",
    description: "손끝에서 세상을 빚는다. 무엇이든 더 정교하게 만든다.",
    growth: { creativity: 1.2, knowledge: 0.6, wealth: 0.5 },
    techAffinity: 1.25,
    themes: ["걸작을 완성", "새로운 도구를 발명", "건축물을 세움", "전통 기술을 혁신"],
  },
  {
    id: "merchant",
    name: "상인",
    englishName: "Merchant",
    emoji: "💰",
    description: "흐름을 읽는다. 사람과 재화를 잇고 부를 쌓는다.",
    growth: { wealth: 1.4, charisma: 0.8, knowledge: 0.3 },
    techAffinity: 1.05,
    themes: ["새로운 교역로를 열어", "거대한 상단을 설립", "시장을 장악", "전례없는 거래를 성사"],
  },
  {
    id: "mystic",
    name: "신비주의자",
    englishName: "Mystic",
    emoji: "🔮",
    description: "보이지 않는 것을 본다. 정신과 우주의 비밀을 좇는다.",
    growth: { spirit: 1.4, knowledge: 0.5, charisma: 0.4 },
    techAffinity: 0.95,
    themes: ["깨달음을 얻음", "별의 운행을 점침", "정신의 경지에 이름", "예언을 남김"],
  },
  {
    id: "leader",
    name: "지도자",
    englishName: "Leader",
    emoji: "👑",
    description: "사람을 움직인다. 시대마다 무리를 이끌고 질서를 세운다.",
    growth: { charisma: 1.4, wealth: 0.6, strength: 0.4 },
    techAffinity: 1.1,
    themes: ["새로운 공동체를 세움", "민중을 이끎", "위대한 법을 제정", "시대의 지도자로 추대됨"],
  },
];

export function getDisposition(id: DispositionId): Disposition {
  return DISPOSITIONS.find((d) => d.id === id) ?? DISPOSITIONS[0];
}
