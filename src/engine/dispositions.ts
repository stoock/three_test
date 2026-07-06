import type { Disposition, DispositionId, Stats } from './types';

function stats(knowledge: number, vigor: number, creativity: number, spirit: number, charisma: number): Stats {
  return { knowledge, vigor, creativity, spirit, charisma };
}

export const DISPOSITIONS: readonly Disposition[] = [
  {
    id: 'explorer',
    name: '탐험가',
    emoji: '🧭',
    desc: '지평선 너머를 향해 끝없이 나아갑니다.',
    growth: stats(0.9, 1.2, 0.8, 0.6, 0.7),
    techAffinity: 1.0,
    themes: [
      '지도에 없는 해안선을 발견했다',
      '별의 배열로 새로운 항로를 열었다',
      '아무도 오르지 못한 봉우리에 깃발을 꽂았다',
    ],
  },
  {
    id: 'scholar',
    name: '학자',
    emoji: '📜',
    desc: '지식을 쌓아 문명의 도약을 이끕니다.',
    growth: stats(1.4, 0.5, 1.0, 0.8, 0.6),
    techAffinity: 1.25,
    themes: [
      '고대 문자의 해독에 성공했다',
      '자연의 법칙 하나를 수식으로 붙잡았다',
      '도서관의 서고를 두 배로 늘렸다',
    ],
  },
  {
    id: 'warrior',
    name: '전사',
    emoji: '⚔️',
    desc: '힘으로 공동체를 지키고 영토를 넓힙니다.',
    growth: stats(0.6, 1.5, 0.6, 0.7, 0.9),
    techAffinity: 0.9,
    themes: [
      '침략자의 선봉을 홀로 막아섰다',
      '변경의 요새를 세워 국경을 밀어냈다',
      '결투로 부족 간의 분쟁을 끝냈다',
    ],
  },
  {
    id: 'artisan',
    name: '장인',
    emoji: '🔨',
    desc: '손끝에서 시대의 도구와 건축이 태어납니다.',
    growth: stats(0.8, 0.8, 1.4, 0.6, 0.6),
    techAffinity: 1.15,
    themes: [
      '새로운 합금의 배합을 찾아냈다',
      '천 년을 버틸 다리를 완공했다',
      '움직이는 기계 인형을 선보였다',
    ],
  },
  {
    id: 'merchant',
    name: '상인',
    emoji: '⚖️',
    desc: '교역망으로 도시와 도시를 잇습니다.',
    growth: stats(0.8, 0.7, 0.8, 0.5, 1.4),
    techAffinity: 1.05,
    themes: [
      '대상(隊商)의 교역로를 새로 열었다',
      '흉년의 도시에 곡물 선단을 보냈다',
      '최초의 어음을 발행했다',
    ],
  },
  {
    id: 'mystic',
    name: '신비주의자',
    emoji: '🔮',
    desc: '보이지 않는 흐름을 읽고 운명을 어루만집니다.',
    growth: stats(0.7, 0.5, 0.9, 1.6, 0.7),
    techAffinity: 0.95,
    themes: [
      '일식을 예언해 공황을 잠재웠다',
      '꿈속에서 다음 시대의 형상을 보았다',
      '치유의 의식으로 역병을 물리쳤다',
    ],
  },
  {
    id: 'leader',
    name: '지도자',
    emoji: '👑',
    desc: '사람들을 모아 문명의 방향을 정합니다.',
    growth: stats(0.9, 0.8, 0.7, 0.7, 1.5),
    techAffinity: 1.1,
    themes: [
      '흩어진 부족을 하나의 깃발 아래 모았다',
      '최초의 성문법을 반포했다',
      '대의회를 소집해 백년 계획을 세웠다',
    ],
  },
];

export function getDisposition(id: DispositionId): Disposition {
  const d = DISPOSITIONS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown disposition: ${id}`);
  return d;
}
