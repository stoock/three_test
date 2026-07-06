import { DISPOSITIONS, getDisposition } from './dispositions';
import { eraAt, techThreshold } from './eras';
import { rollEvent, sumStats } from './events';
import { dynastyName, rollName } from './names';
import { hashString, mulberry32, pick, type Rng } from './rng';
import type { Character, DispositionId, LifeMode, Moment, SimState, StatId } from './types';

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
  {
    id: 'inc10',
    check: (s) => s.incarnation >= 10,
    title: '열 번째 삶',
    body: '열 개의 이름, 열 개의 무덤. 그러나 영혼의 실은 끊기지 않았다.',
  },
  {
    id: 'inc50',
    check: (s) => s.incarnation >= 50,
    title: '쉰 번째 삶',
    body: '이제 죽음은 문턱이 아니라 계절이다. 쉰 번째 봄이 왔다.',
  },
];

export function createCharacter(name: string, dispositionId: DispositionId, mode: LifeMode): SimState {
  const character: Character = {
    name,
    lineage: name,
    dispositionId,
    seed: hashString(`${name}:${dispositionId}:aeterna`),
    mode,
  };
  const disp = getDisposition(dispositionId);
  const rng = mulberry32(character.seed);
  const stats = {} as SimState['stats'];
  for (const id of STAT_IDS) {
    stats[id] = 8 + Math.round(disp.growth[id] * (4 + rng() * 6));
  }
  const state: SimState = {
    character,
    year: 0,
    stats,
    tech: 0,
    eraIndex: 0,
    civ: 1,
    fate: 0.31 + rng() * 0.4,
    nextEventYear: 4 + rng() * 6,
    incarnation: 1,
    incarnationYear: 0,
    nextDeathYear: Infinity,
    milestonesDone: [],
    log: [],
    logSeq: 0,
  };
  if (mode !== 'immortal') state.nextDeathYear = rollLifespan(state, rng);
  return state;
}

/** 현재 삶의 수명 — 시대(의술)와 체력이 늘리고, 후반은 상한으로 억제 */
function rollLifespan(state: SimState, rng: Rng): number {
  const base = 30 + Math.min(25, state.eraIndex) * 10;
  const vigorBoost = 1 + Math.log10(1 + state.stats.vigor) / 4;
  const span = Math.min(450, base * vigorBoost * (0.8 + rng() * 0.4));
  return state.year + Math.max(12, span);
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

  // 죽음과 계승 — 환생 또는 왕조 승계 (한 틱에 한 번)
  if (state.character.mode !== 'immortal' && state.year >= state.nextDeathYear) {
    moments.push(performSuccession(state, rng));
  }

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
    if ((m.id === 'inc10' || m.id === 'inc50') && state.character.mode === 'immortal') continue;
    if (!state.milestonesDone.includes(m.id) && m.check(state)) {
      state.milestonesDone.push(m.id);
      moments.push({ kind: 'milestone', title: `🏆 ${m.title}`, body: m.body, wantSnapshot: true });
    }
  }

  return moments;
}

/**
 * 죽음 → 환생/승계 처리.
 * 능력치 일부만 다음 삶으로 넘어가고(계승률), 성향이 표류할 수 있으며,
 * 왕조는 후계 분쟁으로 문명이 출렁일 수 있다 — 정적인 불멸 대신 동적인 순환.
 */
function performSuccession(state: SimState, rng: Rng): Moment {
  const ch = state.character;
  const oldName = ch.name;
  const lifeAge = Math.floor(state.year - state.incarnationYear);
  state.incarnation += 1;
  state.incarnationYear = state.year;

  // 계승률 — 환생은 정신이, 왕조는 매력이 끌어올린다
  const keep =
    ch.mode === 'reincarnate'
      ? Math.min(0.6, 0.3 + Math.log10(1 + state.stats.spirit) * 0.04)
      : Math.min(0.7, 0.42 + Math.log10(1 + state.stats.charisma) * 0.04);
  for (const id of STAT_IDS) {
    state.stats[id] = Math.max(8, state.stats[id] * keep);
  }

  // 성향 표류 — 환생 35%, 왕조 15%
  const driftP = ch.mode === 'reincarnate' ? 0.35 : 0.15;
  let driftNote = '';
  if (rng() < driftP) {
    const others = DISPOSITIONS.filter((d) => d.id !== ch.dispositionId);
    const next = pick(rng, others);
    ch.dispositionId = next.id;
    driftNote =
      ch.mode === 'reincarnate'
        ? ` 새 삶은 ${next.emoji} ${next.name}의 길을 걷는다.`
        : ` 후계자는 ${next.emoji} ${next.name}의 기질을 타고났다.`;
  }

  // 운명도 새 삶과 함께 다시 섞인다
  state.fate = 0.15 + rng() * 0.7;
  state.nextDeathYear = rollLifespan(state, rng);
  const pct = Math.round(keep * 100);

  if (ch.mode === 'reincarnate') {
    ch.name = rollName(rng);
    return {
      kind: 'succession',
      title: `🕯️ ${oldName}, ${lifeAge}년의 삶을 마치다`,
      body: `영혼은 강을 건너 ${ch.name}(으)로 다시 태어났다 — ${state.incarnation}번째 삶. 전생의 기억 ${pct}%가 어렴풋이 남았다.${driftNote}`,
      wantSnapshot: true,
    };
  }

  // 왕조 승계 — 후계 분쟁 확률 20%
  ch.name = dynastyName(ch.lineage, state.incarnation);
  let disputeNote = '';
  if (rng() < 0.2) {
    state.civ = Math.max(1, state.civ * 0.88);
    disputeNote = ' 그러나 후계 분쟁으로 영지가 어지러워졌다 (문명 -12%).';
  } else if (rng() < 0.25) {
    state.civ *= 1.08;
    disputeNote = ' 순조로운 승계에 백성들이 결집했다 (문명 +8%).';
  }
  return {
    kind: 'succession',
    title: `👑 ${ch.name}, ${state.incarnation}대 계승`,
    body: `${oldName}이(가) 향년 ${lifeAge}세로 서거했다. 가문의 유산 ${pct}%를 물려받는다.${disputeNote}${driftNote}`,
    wantSnapshot: true,
  };
}
