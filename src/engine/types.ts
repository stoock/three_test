export type DispositionId =
  | 'explorer'
  | 'scholar'
  | 'warrior'
  | 'artisan'
  | 'merchant'
  | 'mystic'
  | 'leader';

export type StatId = 'knowledge' | 'vigor' | 'creativity' | 'spirit' | 'charisma';

export type Stats = Record<StatId, number>;

export interface Disposition {
  id: DispositionId;
  name: string;
  emoji: string;
  desc: string;
  /** 능력치 성장 가중치 */
  growth: Stats;
  /** 기술 발전 친화도 */
  techAffinity: number;
  /** 성향 테마 사건 문구 */
  themes: readonly string[];
}

export type LogKind = 'birth' | 'era' | 'event' | 'milestone';

export interface LogEntry {
  id: number;
  year: number;
  eraName: string;
  kind: LogKind;
  title: string;
  body: string;
  /** 그 순간의 행성 스냅샷 (JPEG dataURL) */
  snapshot?: string;
}

export interface Character {
  name: string;
  dispositionId: DispositionId;
  seed: number;
}

export interface SimState {
  character: Character;
  /** 경과 연도 = 나이 (불멸이므로 상한 없음) */
  year: number;
  stats: Stats;
  tech: number;
  eraIndex: number;
  /** 문명 지수 — 행성 위 건축/영토 규모를 결정 */
  civ: number;
  /** 로지스틱 사상 '운명' (0..1) — 사건 결과를 흔드는 카오스 */
  fate: number;
  nextEventYear: number;
  milestonesDone: string[];
  log: LogEntry[];
  logSeq: number;
}

/** 틱 처리 중 발생한, 스냅샷을 찍어 기록해야 할 순간 */
export interface Moment {
  kind: LogKind;
  title: string;
  body: string;
  wantSnapshot: boolean;
}
