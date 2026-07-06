import type { Rng } from './rng';
import { pick } from './rng';

const HEADS = ['아', '엘', '세', '라', '유', '하', '이', '카', '노', '베', '미', '테', '오', '레', '샤'] as const;
const MIDS = ['엘', '리', '란', '르', '스', '나', '델', '비', '로', '시'] as const;
const TAILS = ['린', '온', '라', '스', '엔', '루', '아', '드', '나', '벨', '오르', '리스'] as const;

/** 환생자의 새 이름 — 시드 난수로 결정론적 생성 */
export function rollName(rng: Rng): string {
  const three = rng() < 0.55;
  return three ? pick(rng, HEADS) + pick(rng, MIDS) + pick(rng, TAILS) : pick(rng, HEADS) + pick(rng, TAILS);
}

/** 왕조 후계자 이름 — "가문명 N세" */
export function dynastyName(lineage: string, generation: number): string {
  return `${lineage} ${generation}세`;
}
