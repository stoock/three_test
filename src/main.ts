import './style.css';
import { mulberry32, type Rng } from './engine/rng';
import { createCharacter, tick } from './engine/simulation';
import { appendLog, clearSave, load, save } from './engine/store';
import type { DispositionId, LifeMode, SimState } from './engine/types';
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
  onCreate(name: string, dispositionId: DispositionId, mode: LifeMode) {
    startNew(name, dispositionId, mode);
  },
  onSpeed(mult: number) {
    speed = mult;
  },
  onSave() {
    if (state && save(state)) hud.toast('연대기를 저장했습니다');
    else hud.toast('저장에 실패했습니다');
  },
  onFocusCapital() {
    world.focusCapital();
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

function startNew(name: string, dispositionId: DispositionId, mode: LifeMode): void {
  state = createCharacter(name, dispositionId, mode);
  rng = mulberry32(state.character.seed ^ 0x51ab3c);
  world.setSeed(state.character.seed);
  world.syncSim(state.civ, state.eraIndex);

  const birthBody =
    mode === 'immortal'
      ? '고대 농경의 새벽. 첫 씨앗이 뿌려진 언덕 위에서 불멸자가 눈을 떴다.'
      : mode === 'reincarnate'
        ? '고대 농경의 새벽. 수없이 다시 태어날 영혼의 첫 번째 삶이 시작됐다.'
        : '고대 농경의 새벽. 대대로 이어질 가문의 시조가 첫 주춧돌을 놓았다.';
  appendLog(
    state,
    {
      kind: 'birth',
      title: `🌅 ${name}, 영원의 연대기를 시작하다`,
      body: birthBody,
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
    // 초고배속에서 프레임당 수십 년이 한 덩어리로 흐르면 수명/시대가 양자화되므로
    // 최대 10년 단위로 쪼개어 시뮬레이션한다
    let remaining = dtReal * speed * YEARS_PER_SECOND;
    const moments = [];
    while (remaining > 1e-9) {
      const step = Math.min(10, remaining);
      remaining -= step;
      moments.push(...tick(state, step, rng));
    }
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

    sinceSave += dtReal;
    if (sinceSave > AUTOSAVE_INTERVAL) {
      sinceSave = 0;
      save(state);
    }
  }

  // 일시정지 중에도 상태 패널은 최신이어야 한다 (배속 중 갱신 주기 사이의 진행분 반영)
  if (state) {
    sinceHud += dtReal;
    if (sinceHud > 0.25) {
      sinceHud = 0;
      hud.updateStatus(state);
      world.syncSim(state.civ, state.eraIndex);
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
