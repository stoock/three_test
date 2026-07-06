import './style.css';
import { mulberry32, type Rng } from './engine/rng';
import { createCharacter, tick } from './engine/simulation';
import { appendLog, clearSave, load, save } from './engine/store';
import type { DispositionId, SimState } from './engine/types';
import { Hud } from './ui/hud';
import { World } from './world/scene';

/** 1× 배속에서 실시간 1초 = 시뮬레이션 1년 */
const YEARS_PER_SECOND = 1;
const AUTOSAVE_INTERVAL = 5; // seconds
const MAX_SNAPSHOTS_PER_FRAME = 2;

const world = new World(document.getElementById('viewport')!);

let state: SimState | null = null;
let rng: Rng = mulberry32(1);
let speed = 1;
let sinceSave = 0;
let sinceHud = 1;

const hud = new Hud(document.getElementById('hud')!, {
  onCreate(name: string, dispositionId: DispositionId) {
    startNew(name, dispositionId);
  },
  onSpeed(mult: number) {
    speed = mult;
  },
  onSave() {
    if (state && save(state)) hud.toast('연대기를 저장했습니다');
    else hud.toast('저장에 실패했습니다');
  },
  onReset() {
    clearSave();
    state = null;
    world.clear();
    hud.resetLog();
    hud.setGameVisible(false);
    hud.showCreation();
  },
});

function startNew(name: string, dispositionId: DispositionId): void {
  state = createCharacter(name, dispositionId);
  rng = mulberry32(state.character.seed ^ 0x51ab3c);
  world.setSeed(state.character.seed);
  world.syncSim(state.civ, state.eraIndex);

  appendLog(
    state,
    {
      kind: 'birth',
      title: `🌅 ${name}, 영원의 삶을 시작하다`,
      body: '고대 농경의 새벽. 첫 씨앗이 뿌려진 언덕 위에서 불멸자가 눈을 떴다.',
      wantSnapshot: true,
    },
    world.captureSnapshot(),
  );

  hud.hideCreation();
  hud.setGameVisible(true);
  hud.resetLog();
  hud.updateStatus(state);
  hud.updateLog(state);
  save(state);
}

function resume(saved: SimState): void {
  state = saved;
  rng = mulberry32((state.character.seed ^ 0x51ab3c) + state.logSeq);
  world.setSeed(state.character.seed);
  world.syncSim(state.civ, state.eraIndex);
  hud.setGameVisible(true);
  hud.updateStatus(state);
  hud.updateLog(state);
  hud.toast(`${state.character.name}의 연대기를 이어갑니다`);
}

// ── 메인 루프 ─────────────────────────────────
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (state && speed > 0) {
    const dtYears = dtReal * speed * YEARS_PER_SECOND;
    const moments = tick(state, dtYears, rng);
    if (moments.length > 0) {
      world.syncSim(state.civ, state.eraIndex);
      let snaps = 0;
      for (const m of moments) {
        const wantShot = m.wantSnapshot && snaps < MAX_SNAPSHOTS_PER_FRAME;
        if (wantShot) snaps++;
        appendLog(state, m, wantShot ? world.captureSnapshot() : undefined);
      }
      hud.updateLog(state);
    }

    sinceHud += dtReal;
    if (sinceHud > 0.25) {
      sinceHud = 0;
      hud.updateStatus(state);
      world.syncSim(state.civ, state.eraIndex);
    }

    sinceSave += dtReal;
    if (sinceSave > AUTOSAVE_INTERVAL) {
      sinceSave = 0;
      save(state);
    }
  }

  world.update(dtReal);
}

const saved = load();
if (saved) resume(saved);
else {
  hud.setGameVisible(false);
  hud.showCreation();
}
requestAnimationFrame(frame);
