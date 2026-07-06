/** 시대별 행성 비주얼 테마 — eras.ts의 themeIndex와 매핑 */

export interface EraTheme {
  /** 건물 지붕/몸체 팔레트 */
  buildingColors: readonly number[];
  /** 야간 창문/네온 발광색 */
  emissive: number;
  emissiveIntensity: number;
  /** 시대 분위기 안개(우주 배경 틴트) */
  spaceTint: number;
  /** 건물 스타일 가중치 [오두막, 가옥, 탑, 첨탑] */
  styleWeights: readonly [number, number, number, number];
  /** 궤도 링 개수 (우주 시대 이후) */
  rings: number;
}

export const ERA_THEMES: readonly EraTheme[] = [
  // 0 고대 농경
  { buildingColors: [0x8a6a4a, 0x9c7b52, 0x7a5c3e], emissive: 0xffa94d, emissiveIntensity: 0.25, spaceTint: 0x05060d, styleWeights: [1, 0, 0, 0], rings: 0 },
  // 1 청동기
  { buildingColors: [0x9c7b52, 0xb08d57, 0x8a6a4a], emissive: 0xffb35c, emissiveIntensity: 0.3, spaceTint: 0x05060d, styleWeights: [0.7, 0.3, 0, 0], rings: 0 },
  // 2 고전 문명
  { buildingColors: [0xd8cbb3, 0xcabf9e, 0xb8a888], emissive: 0xffc078, emissiveIntensity: 0.32, spaceTint: 0x060710, styleWeights: [0.2, 0.8, 0, 0], rings: 0 },
  // 3 중세
  { buildingColors: [0xa89a85, 0x8f8474, 0x6f6552], emissive: 0xffc078, emissiveIntensity: 0.35, spaceTint: 0x060710, styleWeights: [0.1, 0.65, 0.25, 0] , rings: 0 },
  // 4 르네상스
  { buildingColors: [0xd8c8ae, 0xc4a884, 0xb99a6e], emissive: 0xffd08a, emissiveIntensity: 0.4, spaceTint: 0x070812, styleWeights: [0, 0.75, 0.25, 0], rings: 0 },
  // 5 산업 혁명
  { buildingColors: [0x8d8a86, 0x6e6b67, 0x9a8f80], emissive: 0xffb35c, emissiveIntensity: 0.5, spaceTint: 0x090810, styleWeights: [0, 0.55, 0.45, 0], rings: 0 },
  // 6 근대 도시
  { buildingColors: [0xa9b0b8, 0x8b939c, 0xc0c6cc], emissive: 0xfff3c4, emissiveIntensity: 0.7, spaceTint: 0x080a14, styleWeights: [0, 0.35, 0.6, 0.05], rings: 0 },
  // 7 정보화
  { buildingColors: [0x9fb4c8, 0x7f96ac, 0xb9c9d8], emissive: 0x9adcff, emissiveIntensity: 0.9, spaceTint: 0x081020, styleWeights: [0, 0.2, 0.6, 0.2], rings: 0 },
  // 8 우주
  { buildingColors: [0xaebfd4, 0x93a8c4, 0xcdd9e8], emissive: 0x7cc7ff, emissiveIntensity: 1.1, spaceTint: 0x0a1226, styleWeights: [0, 0.1, 0.45, 0.45], rings: 1 },
  // 9 초미래
  { buildingColors: [0xbcc4e8, 0xa9b0e0, 0xd6dbf5], emissive: 0xb08cff, emissiveIntensity: 1.4, spaceTint: 0x0e0a26, styleWeights: [0, 0, 0.3, 0.7], rings: 2 },
];

export function themeFor(themeIndex: number): EraTheme {
  return ERA_THEMES[Math.min(themeIndex, ERA_THEMES.length - 1)];
}
