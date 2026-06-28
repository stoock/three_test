import type { Attributes, AttributeKey, Character, Disposition, Era, LogType } from "./types";

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

export interface FlavorEvent {
  title: string;
  description: string;
  reward: Partial<Attributes>;
  type: LogType;
}

interface EventTemplate {
  title: string;
  text: string; // {name} {era} {age} substituted
  reward: Partial<Attributes>;
}

// ---- era-specific flavour events ----------------------------------------
// Indexed by "epoch" so the world feels different across the ages instead of
// reusing one template forever.
const EPOCH_EVENTS: Record<string, EventTemplate[]> = {
  ancient: [
    { title: "첫 수확", text: "{name}은(는) 처음으로 들판 가득 곡식을 거두었다. 풍요가 무엇인지 깨닫는다.", reward: { wealth: 14, knowledge: 6 } },
    { title: "부족의 회합", text: "흩어진 무리가 {name}의 화톳불 곁으로 모여들었다. 공동체의 씨앗이 뿌려진다.", reward: { charisma: 14, spirit: 6 } },
    { title: "오랜 가뭄", text: "하늘이 비를 거두었다. {name}은(는) 굶주림을 견디며 살아남는 법을 배운다.", reward: { strength: 12, spirit: 8 } },
    { title: "별을 헤아리다", text: "{name}은(는) 밤하늘의 규칙을 발견하고 최초의 달력을 새긴다.", reward: { knowledge: 16 } },
  ],
  classical: [
    { title: "신전 건립", text: "{era}, {name}의 손끝에서 거대한 신전이 솟았다. 후세가 그 그늘 아래 모인다.", reward: { creativity: 14, charisma: 8 } },
    { title: "법전 제정", text: "{name}은(는) 어지러운 관습을 글로 묶어 최초의 법을 세운다.", reward: { knowledge: 12, charisma: 10 } },
    { title: "철학 논쟁", text: "광장에서 벌어진 논쟁에서 {name}의 사유가 빛을 발한다.", reward: { knowledge: 14, spirit: 8 } },
    { title: "교역 원정", text: "낯선 바다 건너로 {name}의 상단이 향한다. 진귀한 재화가 흘러든다.", reward: { wealth: 16, charisma: 6 } },
  ],
  medieval: [
    { title: "성채 축조", text: "{era}, {name}은(는) 험준한 언덕에 성을 올려 영지를 지킨다.", reward: { strength: 12, wealth: 8 } },
    { title: "필사실의 밤", text: "촛불 아래 {name}은(는) 사라질 뻔한 지식을 양피지에 옮겨 적는다.", reward: { knowledge: 16 } },
    { title: "역병의 시대", text: "검은 죽음이 대지를 휩쓴다. {name}은(는) 불멸의 몸으로 산 자를 보살핀다.", reward: { spirit: 14, charisma: 6 } },
    { title: "기사 서임", text: "{name}의 무용이 온 영지에 회자되어 전설이 된다.", reward: { strength: 14, charisma: 8 } },
  ],
  renaissance: [
    { title: "걸작의 완성", text: "{era}, {name}의 작품 앞에서 사람들이 숨을 죽인다. 예술이 다시 태어난다.", reward: { creativity: 18, charisma: 6 } },
    { title: "활자의 혁명", text: "{name}은(는) 지식을 대량으로 찍어내는 법을 퍼뜨린다. 세계가 읽기 시작한다.", reward: { knowledge: 16, wealth: 6 } },
    { title: "대항해", text: "{name}은(는) 지도의 끝 너머로 배를 띄워 새로운 대륙을 잇는다.", reward: { wealth: 14, creativity: 8 } },
    { title: "해부와 발견", text: "금기를 넘어 {name}은(는) 인체와 자연의 비밀을 들여다본다.", reward: { knowledge: 18 } },
  ],
  industrial: [
    { title: "증기의 포효", text: "{era}, {name}의 공장에서 강철 기계가 처음으로 돌아간다.", reward: { creativity: 14, wealth: 12 } },
    { title: "철도 부설", text: "{name}은(는) 대륙을 가로지르는 철길을 깐다. 거리가 사라진다.", reward: { wealth: 16, strength: 6 } },
    { title: "노동의 각성", text: "굴뚝 아래 사람들이 {name}을(를) 중심으로 권리를 외친다.", reward: { charisma: 16, spirit: 6 } },
    { title: "전기의 불꽃", text: "{name}은(는) 어둠을 몰아내는 빛을 길들인다.", reward: { knowledge: 14, creativity: 8 } },
  ],
  modern: [
    { title: "마천루의 시대", text: "{era}, {name}의 도시가 구름을 향해 솟구친다.", reward: { wealth: 16, creativity: 8 } },
    { title: "비행의 꿈", text: "{name}은(는) 하늘을 가르며 중력의 사슬을 끊는다.", reward: { creativity: 16, strength: 6 } },
    { title: "대중의 목소리", text: "전파를 타고 {name}의 말이 수백만에게 닿는다.", reward: { charisma: 18 } },
    { title: "원자의 비밀", text: "{name}은(는) 물질의 가장 깊은 곳에서 막대한 힘을 발견한다.", reward: { knowledge: 18, spirit: 4 } },
  ],
  information: [
    { title: "연결된 세계", text: "{era}, {name}은(는) 온 인류를 하나의 그물로 엮는다.", reward: { knowledge: 16, charisma: 8 } },
    { title: "코드의 마법", text: "{name}이(가) 짠 알고리즘이 보이지 않게 세상을 움직인다.", reward: { creativity: 16, wealth: 8 } },
    { title: "데이터의 바다", text: "{name}은(는) 무한한 정보의 흐름 속에서 진실을 길어 올린다.", reward: { knowledge: 18 } },
    { title: "가상의 자아", text: "{name}은(는) 또 하나의 자신을 디지털 세계에 새긴다.", reward: { spirit: 12, creativity: 8 } },
  ],
  space: [
    { title: "최초의 도약", text: "{era}, {name}은(는) 대기권을 넘어 별들 사이로 첫발을 내딛는다.", reward: { creativity: 16, spirit: 10 } },
    { title: "달의 정착지", text: "{name}은(는) 회색 황무지 위에 인류의 새 보금자리를 세운다.", reward: { wealth: 14, strength: 8 } },
    { title: "항성 이주", text: "{name}은(는) 먼 항성계로 향하는 세대 우주선을 띄운다.", reward: { knowledge: 16, charisma: 8 } },
    { title: "외계의 신호", text: "{name}은(는) 우주 저편에서 온 메시지를 처음으로 해독한다.", reward: { knowledge: 18, spirit: 6 } },
  ],
  ultra: [
    { title: "의식의 업로드", text: "{era}, {name}은(는) 정신을 빛의 격자에 새겨 육신을 초월한다.", reward: { spirit: 18, knowledge: 8 } },
    { title: "차원의 직조", text: "{name}은(는) 공간 그 자체를 천처럼 접어 새 세계를 짓는다.", reward: { creativity: 20 } },
    { title: "항성 공학", text: "{name}은(는) 별 하나를 통째로 에워싸 그 빛을 거둔다.", reward: { wealth: 20, knowledge: 8 } },
    { title: "초지성의 합일", text: "{name}은(는) 수많은 정신과 하나가 되어 사유의 새 지평을 연다.", reward: { spirit: 16, charisma: 10 } },
  ],
};

export function epochOf(era: Era): keyof typeof EPOCH_EVENTS {
  switch (era.index) {
    case 0:
      return "ancient";
    case 1:
    case 2:
      return "classical";
    case 3:
      return "medieval";
    case 4:
      return "renaissance";
    case 5:
      return "industrial";
    case 6:
      return "modern";
    case 7:
      return "information";
    case 8:
      return "space";
    default:
      return "ultra";
  }
}

function fill(text: string, c: Character, era: Era): string {
  return text
    .replaceAll("{name}", c.name)
    .replaceAll("{era}", era.name)
    .replaceAll("{age}", `${Math.floor(c.age)}세`);
}

/** An era-appropriate flavour event, scaled gently by fortune. */
export function eraFlavorEvent(
  c: Character,
  era: Era,
  fortune: number,
  rand: () => number,
): FlavorEvent {
  const pool = EPOCH_EVENTS[epochOf(era)];
  const t = pool[Math.floor(rand() * pool.length)];
  const mult = 0.7 + fortune * 0.6;
  const reward: Partial<Attributes> = {};
  for (const k of Object.keys(t.reward) as AttributeKey[]) {
    reward[k] = Math.round((t.reward[k] ?? 0) * mult);
  }
  return {
    title: t.title,
    description: `${era.name}, ${Math.floor(c.age)}세. ${fill(t.text, c, era)}`,
    reward,
    type: "story",
  };
}

/** A personal event drawn from the disposition's own themes (now actually used). */
export function dispositionEvent(
  c: Character,
  disp: Disposition,
  era: Era,
  fortune: number,
  rand: () => number,
): FlavorEvent {
  const theme = disp.themes[Math.floor(rand() * disp.themes.length)];
  const mult = 0.7 + fortune * 0.6;
  const reward: Partial<Attributes> = {};
  for (const [k, v] of Object.entries(disp.growth) as [AttributeKey, number][]) {
    reward[k] = Math.round(v * 9 * mult);
  }
  const flair =
    fortune > 0.6 ? "그 성취는 오래도록 회자될 것이다" : fortune > 0.4 ? "묵묵히 한 걸음을 더 내디뎠다" : "고된 대가를 치렀지만 끝내 해냈다";
  return {
    title: `${theme}하다`,
    description: `${era.name}, ${Math.floor(c.age)}세. ${disp.name}다운 길을 따라 ${c.name}은(는) ${theme}했다. ${flair}.`,
    reward,
    type: "story",
  };
}

// ---- rival name pool -----------------------------------------------------
const RIVAL_NAMES = [
  "카엘",
  "모르윈",
  "세라핀",
  "타르간",
  "이졸데",
  "벨라크",
  "니아",
  "오르넬",
  "샤이라",
  "드라골",
  "엘피나",
  "코반",
  "미리암",
  "자하르",
  "레아",
  "운닥",
];

export function randomRivalName(rand: () => number): string {
  return RIVAL_NAMES[Math.floor(rand() * RIVAL_NAMES.length)];
}

// ---- legendary milestones ------------------------------------------------
export interface Milestone {
  id: string;
  test: (c: Character) => boolean;
  title: string;
  text: (c: Character) => string;
}

export const MILESTONES: Milestone[] = [
  {
    id: "age-1k",
    test: (c) => c.age >= 1000,
    title: "천 년의 증인",
    text: (c) => `${c.name}은(는) 천 년을 살아낸 산 역사가 되었다. 어떤 필멸자도 닿지 못할 시간이다.`,
  },
  {
    id: "age-10k",
    test: (c) => c.age >= 10000,
    title: "만 년의 불멸자",
    text: (c) => `만 년. ${c.name}에게 시간은 더 이상 두려움이 아니라 벗이다.`,
  },
  {
    id: "era-space",
    test: (c) => c.techLevel >= 800,
    title: "별에 닿은 자",
    text: (c) => `${c.name}이(가) 이끈 문명이 마침내 우주로 나아갔다.`,
  },
  {
    id: "era-ultra",
    test: (c) => c.techLevel >= 900,
    title: "초월의 문턱",
    text: (c) => `${c.name}의 세계가 상상의 한계를 넘어 초미래로 진입했다.`,
  },
  {
    id: "territory-max",
    test: (c) => c.territory >= 13,
    title: "광활한 제국",
    text: (c) => `${c.name}의 영역이 대지의 끝까지 펼쳐졌다(13×13).`,
  },
  {
    id: "attr-1k",
    test: (c) => Math.max(...Object.values(c.attributes)) >= 1000,
    title: "초인의 경지",
    text: (c) => `${c.name}의 한 재능이 천 단위를 돌파했다. 인간의 척도를 벗어났다.`,
  },
  {
    id: "attr-10k",
    test: (c) => Math.max(...Object.values(c.attributes)) >= 10000,
    title: "신화의 영역",
    text: (c) => `${c.name}의 재능이 만 단위에 이르렀다. 신화 속 존재가 되었다.`,
  },
  {
    id: "choices-100",
    test: (c) => c.choicesMade >= 100,
    title: "백 번의 갈림길",
    text: (c) => `${c.name}은(는) 백 번의 운명적 선택을 거쳐 단단해졌다.`,
  },
];
