// Core domain types for the immortal-character life simulation.

export type AttributeKey =
  | "knowledge" // 지식
  | "strength" // 체력
  | "creativity" // 창의력
  | "charisma" // 영향력
  | "spirit" // 정신
  | "wealth"; // 부

export type Attributes = Record<AttributeKey, number>;

export type DispositionId =
  | "explorer"
  | "scholar"
  | "warrior"
  | "artisan"
  | "merchant"
  | "mystic"
  | "leader";

export interface Disposition {
  id: DispositionId;
  name: string; // Korean label
  englishName: string;
  emoji: string;
  description: string;
  /** Per-year growth bias added to base growth for each attribute. */
  growth: Partial<Attributes>;
  /** Multiplier applied to technological progress driven by this character. */
  techAffinity: number;
  /** Flavor verbs/themes used when generating this disposition's choice events. */
  themes: string[];
}

export interface EraPalette {
  sky: string;
  ground: string;
  ground2: string;
  structure: string;
  structureRoof: string;
  accent: string;
}

export interface Era {
  index: number;
  name: string; // Korean
  englishName: string;
  /** Inclusive tech-level at which this era begins. */
  threshold: number;
  palette: EraPalette;
  /** Visual descriptor for the iso scene structures. */
  structure: "hut" | "temple" | "keep" | "manor" | "factory" | "tower" | "dome" | "arcology";
  description: string;
}

export type LogType =
  | "birth"
  | "era"
  | "choice" // a strategic game won
  | "setback" // a strategic game lost (시련)
  | "story" // era / disposition flavour event (사건)
  | "rival" // relationship event with another being (인연)
  | "legend" // a lasting achievement / milestone (이정표)
  | "wonder" // a great historical landmark built (불가사의)
  | "expand";

export interface LogEntry {
  id: string;
  /** Game year (age in years since birth). */
  gameYear: number;
  eraName: string;
  type: LogType;
  title: string;
  description: string;
  /** SVG data URL snapshot captured at the moment of the event. */
  snapshot: string;
}

export interface Rival {
  name: string;
  disposition: DispositionId;
  /** Relationship from -100 (숙적) to +100 (벗). */
  affinity: number;
  /** Tit-for-tat memory: did they cooperate last encounter? */
  lastCooperated: boolean;
}

export interface Character {
  name: string;
  disposition: DispositionId;
  /** Age in years. Grows without bound — the character is immortal. */
  age: number;
  attributes: Attributes;
  /** Drives era progression. */
  techLevel: number;
  /** Counts important logged choices made so far. */
  choicesMade: number;
  /** Unique world seed — guarantees no two lives unfold the same way. */
  seed: number;
  /** Chaotic "fortune" state in (0,1), evolved by a logistic map each year. */
  chaos: number;
  /** Side length of the explorable ground grid; grows as the realm expands. */
  territory: number;
  /** Age at which the next important event fires (O(1) scheduling). */
  nextChoiceAge: number;
  /** Recurring acquaintances the immortal plays repeated games against. */
  rivals: Rival[];
  /** Ids of legendary milestones already achieved (so they fire once). */
  milestones: string[];
  /** Ids of great wonders/landmarks built (rendered permanently in the city). */
  wonders: string[];
  /** Cumulative tech-rate multiplier granted by built wonders (default 1). */
  techMult: number;
}

export type Speed = 0 | 1 | 5 | 25 | 100 | 1000;

export interface GameState {
  character: Character | null;
  log: LogEntry[];
  speed: Speed;
  /** Accumulated real wall-clock seconds the sim has been observed. */
  observedSeconds: number;
  createdAt: number | null;
  lastSavedAt: number | null;
}
