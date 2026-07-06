import type { Rng } from './rng';
import { pick } from './rng';
import { getDisposition } from './dispositions';
import type { SimState, StatId } from './types';

/** 시대군별 플레이버 사건 (사건 다양성 기획 계승) */
const EPOCH_EVENTS: readonly { maxEra: number; texts: readonly string[] }[] = [
  {
    maxEra: 1,
    texts: [
      '큰 강이 범람해 마을을 옮겨야 했다',
      '들불 뒤의 땅에서 더 기름진 흙을 발견했다',
      '떠돌이 무리가 정착을 청해 왔다',
    ],
  },
  {
    maxEra: 3,
    texts: [
      '이웃 도시국가와 소금 교역 조약을 맺었다',
      '대신전 건립을 두고 장로들이 갈라섰다',
      '먼 바다에서 온 배가 낯선 곡물을 전했다',
    ],
  },
  {
    maxEra: 5,
    texts: [
      '인쇄기가 도시의 말싸움을 글싸움으로 바꿨다',
      '증기의 힘이 강가의 물레방아를 밀어냈다',
      '역병이 지나간 자리에 새 위생 규범이 섰다',
    ],
  },
  {
    maxEra: 7,
    texts: [
      '전신망이 대륙의 시간을 하나로 묶었다',
      '거대한 전산기가 도시의 장부를 삼켰다',
      '전파 너머로 낯선 신호가 잡혔다',
    ],
  },
  {
    maxEra: Infinity,
    texts: [
      '궤도 엘리베이터의 첫 삭도가 하늘에 걸렸다',
      '항성풍을 타는 돛단배가 진수됐다',
      '의식 업로드를 둘러싼 대토론이 벌어졌다',
      '다이슨 구조물의 첫 패널이 빛을 받았다',
    ],
  },
];

/** 환생자의 전생 기억 / 왕조의 유산 사건 */
const MEMORY_EVENTS: Record<'reincarnate' | 'dynasty', readonly string[]> = {
  reincarnate: [
    '전생의 기억이 홍수처럼 밀려들었다',
    '낯선 골목에서 이유 없는 그리움에 붙들렸다',
    '꿈에서 지난 삶의 벗을 다시 만났다',
    '오래전 자신이 지은 건물의 주춧돌을 알아보았다',
  ],
  dynasty: [
    '서고에서 선대의 밀서를 발견했다',
    '가문의 문장을 새로 벼렸다',
    '선조의 묘를 이장하며 오래된 맹세를 되새겼다',
    '선대가 남긴 미완의 설계도를 이어 그렸다',
  ],
};

const STAT_NAMES: Record<StatId, string> = {
  knowledge: '지식',
  vigor: '체력',
  creativity: '창의',
  spirit: '정신',
  charisma: '매력',
};

export interface EventResult {
  title: string;
  body: string;
  deltas: Partial<Record<StatId, number>>;
}

/**
 * 사건 생성 — 성향 테마 / 시대 플레이버 중 하나를 뽑고,
 * 카오스 '운명'과 정신 보정(신비주의자 구제 기획 계승)으로 결과를 정한다.
 */
export function rollEvent(state: SimState, rng: Rng): EventResult {
  const disp = getDisposition(state.character.dispositionId);

  const mode = state.character.mode;
  const canRemember = mode !== 'immortal' && state.incarnation > 1;
  const roll = rng();
  const text =
    canRemember && roll < 0.18
      ? pick(rng, MEMORY_EVENTS[mode])
      : roll < 0.55
        ? pick(rng, disp.themes)
        : pick(rng, (EPOCH_EVENTS.find((e) => state.eraIndex <= e.maxEra) ?? EPOCH_EVENTS[EPOCH_EVENTS.length - 1]).texts);

  // 운명(카오스)과 정신이 성패를 흔든다
  const spiritEdge = Math.min(0.15, Math.log10(1 + state.stats.spirit) * 0.03);
  const successP = 0.5 + (state.fate - 0.5) * 0.35 + spiritEdge;
  const success = rng() < successP;

  const scale = Math.max(1, Math.sqrt(sumStats(state)) * 0.4);
  const statIds = Object.keys(STAT_NAMES) as StatId[];
  const primary = pick(rng, statIds);
  const amount = (success ? 1.5 : 0.4) * scale * (0.6 + rng() * 0.8);

  const deltas: Partial<Record<StatId, number>> = { [primary]: amount };
  const outcome = success
    ? `성공적으로 매듭지었다. ${STAT_NAMES[primary]}이(가) 크게 자랐다.`
    : `뜻대로 되지 않았지만 교훈을 얻었다. ${STAT_NAMES[primary]}이(가) 조금 자랐다.`;

  return {
    title: text,
    body: outcome,
    deltas,
  };
}

export function sumStats(state: SimState): number {
  const s = state.stats;
  return s.knowledge + s.vigor + s.creativity + s.spirit + s.charisma;
}
