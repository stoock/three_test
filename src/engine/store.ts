import { eraAt } from './eras';
import type { LogEntry, Moment, SimState } from './types';

const SAVE_KEY = 'aeterna-save-v1';
const LOG_CAP = 240; // 로그 보관 상한 (기획 계승)
const SNAPSHOT_CAP = 48; // dataURL 스냅샷 보관 상한 (localStorage 용량 보호)

export function appendLog(state: SimState, moment: Moment, snapshot?: string): LogEntry {
  const entry: LogEntry = {
    id: state.logSeq++,
    year: Math.floor(state.year),
    eraName: eraAt(state.eraIndex).name,
    kind: moment.kind,
    title: moment.title,
    body: moment.body,
    snapshot,
  };
  state.log.push(entry);
  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);

  let snapCount = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    if (state.log[i].snapshot) {
      snapCount++;
      if (snapCount > SNAPSHOT_CAP) delete state.log[i].snapshot;
    }
  }
  return entry;
}

export function save(state: SimState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state }));
    return true;
  } catch {
    // 용량 초과 시 스냅샷을 덜어내고 한 번 더 시도
    try {
      const slim: SimState = { ...state, log: state.log.map((e) => ({ ...e, snapshot: undefined })) };
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, state: slim }));
      return true;
    } catch {
      return false;
    }
  }
}

export function load(): SimState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !parsed.state?.character?.name) return null;
    return parsed.state as SimState;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(SAVE_KEY);
}
