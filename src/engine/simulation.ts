import { getDisposition } from './dispositions';
import { eraAt, techThreshold } from './eras';
import { rollEvent, sumStats } from './events';
import { hashString, mulberry32, type Rng } from './rng';
import type { Character, DispositionId, Moment, SimState, StatId } from './types';

const STAT_IDS: readonly StatId[] = ['knowledge', 'vigor', 'creativity', 'spirit', 'charisma'];

/** 사건 간격 상한 (기획 계승: 사건 고갈 방지) */
const MAX_EVENT_GAP = 20;

const MILESTONES: readonly { id: string; check: (s: SimState) => boolean; title: string; body: string }[] = [
  {
    id: 'y1000',
    check: (s) => s.year >= 1000,
    title: '천 년의 산책자',
    body: '천 번의 계절 순환을 지켜보았다. 필멸자들은 이제 그를 전설이라 부른다.',
  },
  {
    id: 'y10000',
    check: (s) => s.year >= 10000,
    title: '만 년의 증인',
    body: '만 년. 산맥의 능선이 조금 낮아졌고, 그는 여전히 걷고 있다.',
  },
  {
    id: 'space',
    check: (s) => s.eraIndex >= 8,
    title: '중력 우물 탈출',
    body: '문명이 처음으로 행성의 중력을 벗어났다. 궤도에 첫 구조물이 걸렸다.',
  },
  {
    id: 'transcend',
    check: (s) => s.eraIndex >= 9,
    title: '초월의 문턱',
    body: '기술이 마법과 구분되지 않는 지경에 이르렀다. 초미래가 시작된다.',
  },
  {
    id: 'stat1k',
    check: (s) => sumStats(s) >= 1000,
    title: '능력 총합 1,000 돌파',
    body: '한 존재에 쌓인 역량이 작은 왕국의 지혜를 넘어섰다.',
  },
  {
    id: 'stat100k',
    check: (s) => sumStats(s) >= 100000,
    title: '능력 총합 100,000 돌파',
    body: '그의 기억 하나하나가 문명의 기록 보관소보다 깊다.',
  },
];

export function createCharacter(name: string, dispositionId: DispositionId): SimState {
  const character: Character = {
    name,
    dispositionId,
    seed: hashString(`${name}:${dispositionId}:aeterna`),
  };
  const disp = getDisposition(dispositionId);
  const rng = mulberry32(character.seed);
  const stats = {} as SimState['stats'];
  for (const id of STAT_IDS) {
    stats[id] = 8 + Math.round(disp.growth[id] * (4 + rng() * 6));
  }
  return {
    character,
    year: 0,
    stats,
    tech: 0,
    eraIndex: 0,
    civ: 1,
    fate: 0.31 + rng() * 0.4,
    nextEventYear: 4 + rng() * 6,
    milestonesDone: [],
    log: [],
    logSeq: 0,
  };
}

/**
 * dtYears 만큼 시뮬레이션을 진행하고, 기록해야 할 순간(Moment)들을 반환한다.
 * 상태는 제자리에서 갱신된다.
 */
export function tick(state: SimState, dtYears: number, rng: Rng): Moment[] {
  if (dtYears <= 0) return [];
  const moments: Moment[] = [];
  const disp = getDisposition(state.character.dispositionId);

  const prevYear = state.year;
  state.year += dtYears;

  // 능력치 성장 — 시대가 깊어질수록 성장 배율 (시대 가속 기획 계승)
  const growthBoost = 1 + (state.eraIndex + state.tech / techThreshold(state.eraIndex)) * 0.25;
  for (const id of STAT_IDS) {
    state.stats[id] += disp.growth[id] * 0.5 * growthBoost * dtYears;
  }

  // 카오스 운명 — 로지스틱 사상, 연 단위로 최대 32회 반복
  const fateSteps = Math.min(32, Math.max(1, Math.floor(dtYears)));
  for (let i = 0; i < fateSteps; i++) {
    state.fate = 3.86 * state.fate * (1 - state.fate);
    state.fate = Math.min(0.999, Math.max(0.001, state.fate));
  }

  // 기술 발전 — 성향 친화도 + 능력치 총합(완만한 로그 성장)
  const techRate = 0.15 * disp.techAffinity * (1 + Math.log10(1 + sumStats(state) / 50) * 1.4);
  state.tech += techRate * dtYears;

  // 시대 전환 (한 틱에 여러 시대를 건널 수 있음)
  while (state.tech >= techThreshold(state.eraIndex)) {
    state.tech -= techThreshold(state.eraIndex);
    state.eraIndex += 1;
    const era = eraAt(state.eraIndex);
    moments.push({
      kind: 'era',
      title: `${era.emoji} ${era.name} 시대 진입`,
      body: `${Math.floor(state.year).toLocaleString()}년, 문명이 ${era.name}의 문을 열었다.`,
      wantSnapshot: true,
    });
  }

  // 문명 지수 — 영토/건축 규모 (영토 확장 기획 계승)
  state.civ += dtYears * (0.15 + state.eraIndex * 0.35) * (0.7 + state.fate * 0.6);

  // 사건 발생 (O(1) 스케줄링 계승) — 한 틱에 최대 3건까지만 처리
  let guard = 0;
  while (state.year >= state.nextEventYear && guard < 3) {
    guard++;
    const ev = rollEvent(state, rng);
    for (const [k, v] of Object.entries(ev.deltas)) {
      state.stats[k as StatId] += v;
    }
    moments.push({
      kind: 'event',
      title: ev.title,
      body: ev.body,
      wantSnapshot: guard === 1 && state.nextEventYear > prevYear,
    });
    state.nextEventYear += 4 + rng() * (MAX_EVENT_GAP - 4);
  }
  if (state.year >= state.nextEventYear) {
    // 초고배속으로 밀린 사건은 건너뛰고 다음 예약만 잡는다
    state.nextEventYear = state.year + 4 + rng() * (MAX_EVENT_GAP - 4);
  }

  // 이정표
  for (const m of MILESTONES) {
    if (!state.milestonesDone.includes(m.id) && m.check(state)) {
      state.milestonesDone.push(m.id);
      moments.push({ kind: 'milestone', title: `🏆 ${m.title}`, body: m.body, wantSnapshot: true });
    }
  }

  return moments;
}
