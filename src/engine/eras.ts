/** 시대 정의 — 고대 농경에서 끝없는 초미래까지 (무한 생성) */

export interface EraDef {
  name: string;
  emoji: string;
  /** 행성 비주얼 테마 인덱스 (world/theme.ts 팔레트와 매핑) */
  themeIndex: number;
}

const NAMED_ERAS: readonly EraDef[] = [
  { name: '고대 농경', emoji: '🌾', themeIndex: 0 },
  { name: '청동기', emoji: '🗿', themeIndex: 1 },
  { name: '고전 문명', emoji: '🏛️', themeIndex: 2 },
  { name: '중세', emoji: '🏰', themeIndex: 3 },
  { name: '르네상스', emoji: '🎨', themeIndex: 4 },
  { name: '산업 혁명', emoji: '🏭', themeIndex: 5 },
  { name: '근대 도시', emoji: '🌆', themeIndex: 6 },
  { name: '정보화', emoji: '💾', themeIndex: 7 },
  { name: '우주', emoji: '🚀', themeIndex: 8 },
  { name: '초미래', emoji: '✨', themeIndex: 9 },
];

/** 기본 시대 진입 기술 포인트 */
export const TECH_PER_ERA = 100;

/** 시대가 깊어질수록 다음 시대 진입에 더 많은 기술이 필요하다 */
export function techThreshold(eraIndex: number): number {
  return TECH_PER_ERA * (1 + eraIndex * 0.6);
}

export function eraAt(index: number): EraDef {
  if (index < NAMED_ERAS.length) return NAMED_ERAS[index];
  const gen = index - NAMED_ERAS.length + 2; // 초미래 II 부터
  return { name: `초미래 ${toRoman(gen)}`, emoji: '✨', themeIndex: 9 };
}

export function themeIndexAt(eraIndex: number): number {
  return eraAt(eraIndex).themeIndex;
}

function toRoman(n: number): string {
  if (n > 3999) return `${n}`;
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of table) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}
