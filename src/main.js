import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Track, LANE_COUNT } from './track.js';
import { Environment } from './environment.js';
import { CarSim, PHYS_DT, WEATHERS, WHEEL_TYPES, WEIGHT_DIST, BODY_TYPES } from './physics.js';
import { buildCar, CAR_COLORS } from './carmodel.js';
import { Recorder, Player } from './replay.js';
import { UI } from './ui.js';

/* ---------------- 기본 셋업 ---------------- */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// 금속 페인트 반사용 환경맵 (다이캐스트 광택)
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
}
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 120);
camera.position.set(-2.5, 3.6, -2.5);

const track = new Track();
const env = new Environment(scene, track);
const heightFn = (x, z) => env.heightAt(x, z);
const broadcastCams = track.buildBroadcastCams();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

/* ---------------- 설정 (localStorage 저장/복원) ---------------- */
const RIVAL_PRESETS = {
  mirror: { label: '동일 스펙', color: CAR_COLORS[1], from: 'player' },
  heavy:  { label: '헤비 튜너', color: CAR_COLORS[4], massG: 110, wheel: 'race', dist: 'center', body: 'wide' },
  light:  { label: '라이트 스트림', color: CAR_COLORS[2], massG: 38, wheel: 'fte', dist: 'center', body: 'streamline' },
  stock:  { label: '순정 챌린저', color: CAR_COLORS[3], massG: 45, wheel: 'stock', dist: 'front', body: 'standard' },
};

const config = {
  weather: 'clear', lane: 1, massG: 55, wheel: 'stock',
  dist: 'center', body: 'standard', color: CAR_COLORS[0],
  livery: 'number', style: 'classic', seed: 12345,
  mode: 'solo', ghost: 'off', rivalPreset: 'mirror',
};
const CFG_KEYS = ['weather', 'lane', 'massG', 'wheel', 'dist', 'body', 'color', 'livery',
  'style', 'mode', 'ghost', 'rivalPreset'];
try {
  const saved = JSON.parse(localStorage.getItem('hwd_config') || 'null');
  if (saved) for (const k of CFG_KEYS) if (k in saved) config[k] = saved[k];
} catch { /* 무시 */ }
function saveConfig() {
  const out = {};
  for (const k of CFG_KEYS) out[k] = config[k];
  try { localStorage.setItem('hwd_config', JSON.stringify(out)); } catch { /* 무시 */ }
}

// 라이벌 설정 파생 — 레인은 플레이어 옆 레인으로 자동 배정
function rivalConfig() {
  const p = RIVAL_PRESETS[config.rivalPreset] || RIVAL_PRESETS.mirror;
  const lane = config.lane === LANE_COUNT - 1 ? config.lane - 1 : config.lane + 1;
  const base = p.from === 'player'
    ? { massG: config.massG, wheel: config.wheel, dist: config.dist, body: config.body }
    : { massG: p.massG, wheel: p.wheel, dist: p.dist, body: p.body };
  return {
    ...config, ...base, lane, color: p.color,
    livery: config.livery === 'solid' ? 'solid' : 'stripe',
  };
}

/* ---------------- 랭킹 / 고스트 (localStorage) ---------------- */
function loadRanks() {
  try { return JSON.parse(localStorage.getItem('hwd_ranks') || '[]'); } catch { return []; }
}
function saveRanks(r) {
  try { localStorage.setItem('hwd_ranks', JSON.stringify(r)); } catch { /* 무시 */ }
}
// 고스트는 트랙 스타일별로 저장 (코스가 다르면 비교가 무의미)
function ghostKey() { return `hwd_ghost_${config.style}`; }
function loadGhost() {
  try { return JSON.parse(localStorage.getItem(ghostKey()) || 'null'); } catch { return null; }
}
function saveGhost(g) {
  try { localStorage.setItem(ghostKey(), JSON.stringify(g)); } catch { /* 무시 */ }
}
let lastRankDate = 0;

/* ---------------- 상태 ---------------- */
let state = 'setup'; // setup | countdown | race | finished | replay
let cars = [];       // [{ sim, model, lane, role, finishTime, splits, cpNext, stallT, land }]
let ghost = null;    // { model, player, data, lane }
let recorder = new Recorder(1);
let player = null;
let raceT = 0;
let physAcc = 0;
let recToggle = 0;
let countdownT = 0;
let gateAnim = 0;
let camMode = 'broadcast';
let raceResult = null;
let finishLingerT = 0;

const playerCar = () => cars[0];

/* ---------------- 컨택트 섀도 ---------------- */
function makeBlobTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}
const blobTex = makeBlobTexture();
function makeBlob() {
  const b = new THREE.Mesh(
    new THREE.PlaneGeometry(0.11, 0.11),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false })
  );
  b.rotation.x = -Math.PI / 2;
  scene.add(b);
  return b;
}

/* ---------------- 차량 생성/배치 ---------------- */
function disposeModel(model) {
  scene.remove(model.group);
  model.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
}

function clearCars() {
  for (const c of cars) {
    disposeModel(c.model);
    if (c.blob) scene.remove(c.blob);
  }
  cars = [];
}

function clearGhost() {
  if (ghost) {
    disposeModel(ghost.model);
    if (ghost.blob) scene.remove(ghost.blob);
    ghost = null;
  }
}

function makeCar(cfg, role) {
  const model = buildCar({
    color: cfg.color, body: cfg.body, wheel: cfg.wheel, livery: cfg.livery,
    massG: cfg.massG, dist: cfg.dist, num: role === 'rival' ? 7 : 5,
  });
  scene.add(model.group);
  const sim = new CarSim(track, { ...cfg });
  return {
    sim, model, role, blob: makeBlob(),
    finishTime: null, splits: [], cpNext: 0, stallT: 0,
    landT: -10, landImpact: 0,
  };
}

function rebuildCars() {
  clearCars();
  cars.push(makeCar(config, 'player'));
  if (config.mode === 'duel') cars.push(makeCar(rivalConfig(), 'rival'));
  recorder = new Recorder(cars.length);
  cars.forEach((c, i) => {
    recorder.meta[i] = { finishS: track.lanes[c.sim.cfg.lane].finishS, role: c.role };
  });
  for (const c of cars) placeCar(c, true);
  refreshGhostModel();
}

// 고스트 모델 준비 (설정 화면에서 미리 보이도록)
function refreshGhostModel() {
  clearGhost();
  const data = loadGhost();
  ui.setGhostHint(data);
  if (config.ghost !== 'on' || !data || !data.frames?.length) return;
  const model = buildCar({
    color: 0xffffff, body: data.cfg.body, wheel: data.cfg.wheel,
    livery: 'solid', massG: data.cfg.massG, dist: data.cfg.dist,
  });
  // 반투명 고스트 머티리얼
  model.group.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.transparent = true;
      o.material.opacity = 0.34;
      o.material.depthWrite = false;
      o.material.color.lerp(new THREE.Color(0x9fd8ff), 0.55);
      o.castShadow = false;
    }
  });
  scene.add(model.group);
  // 고스트 레인: 기록된 레인을 쓰되, 실주행 차량과 겹치면 빈 레인으로 옮긴다
  const used = cars.map((c) => c.sim.cfg.lane);
  let gLane = Math.min(LANE_COUNT - 1, Math.max(0, data.cfg.lane ?? 0));
  if (used.includes(gLane)) {
    const free = [...Array(LANE_COUNT).keys()].filter((l) => !used.includes(l));
    if (free.length) {
      gLane = free.reduce((best, l) =>
        Math.abs(l - gLane) < Math.abs(best - gLane) ? l : best, free[0]);
    }
  }
  ghost = {
    model, data, lane: gLane,
    player: new Player(Recorder.fromFrames(data.frames)),
    blob: null,
  };
  ghost.player.playing = false;
  placeGhost(0, true);
}

function placeCar(c, snap = false) {
  const { sim, model } = c;
  track.placeCar(model.group, sim.cfg.lane, sim.s, sim.alt, sim.v,
    { airborne: sim.airborne, vy: sim.vy, snap });
  updateBlob(c.blob, model.group.position, sim.alt);
}

function placeGhost(t, snap = false) {
  if (!ghost) return;
  const smp = ghost.player.sample(t);
  if (!smp) return;
  track.placeCar(ghost.model.group, ghost.lane, smp.s, smp.alt, smp.v,
    { airborne: smp.airborne, vy: smp.vy, snap });
  ghost.model.spinWheels(smp.v, 1 / 60);
  return smp;
}

function updateBlob(blob, pos, alt) {
  if (!blob) return;
  blob.position.set(pos.x, pos.y - alt + 0.0015, pos.z);
  blob.material.opacity = Math.max(0, 0.85 - alt * 5);
}

/* ---------------- UI ---------------- */
const ui = new UI(track, {
  onConfig(key, val) {
    config[key] = val;
    saveConfig();
    if (key === 'weather') env.setWeather(val);
    if (key === 'style') {
      track.buildMesh(scene, heightFn, val);
      track.setWet(config.weather === 'rain');
    }
    if (key === 'mode') ui.setRivalGroupVisible(val === 'duel');
    if (state === 'setup') {
      rebuildCars();
      ui.setRivalHint(config.mode === 'duel' ? rivalConfig() : null);
    }
  },
  onStart() { startCountdown(); },
  onBackToSetup() {
    state = 'setup';
    config.seed = (Math.random() * 2 ** 31) | 0;
    track.setGate(0);
    rebuildCars();
    ui.showSetup();
    ui.setRivalGroupVisible(config.mode === 'duel');
    ui.setRivalHint(config.mode === 'duel' ? rivalConfig() : null);
  },
  onEnterReplay() {
    if (!recorder.tracks[0].length) return;
    state = 'replay';
    player = new Player(recorder);
    player.seek(0);
    player.playing = true;
    player.speed = 1;
    ui.setReplaySpeedButton(1);
    // 선두가 피니시한 뒤의 런아웃 순위 변동은 역전으로 치지 않는다
    const firstFinish = Math.min(...cars.map((c) => c.finishTime ?? Infinity));
    ui.showReplay(recorder.duration,
      recorder.analyze(playerCar().finishTime, 0, firstFinish));
    setCam('broadcast');
  },
  onExitReplay() {
    state = 'finished';
    ui.showResults(raceResult);
    ui.els.replayBar.classList.add('hidden');
  },
  onCamera(v) { setCam(v); },
  onPlayPause() {
    if (!player) return;
    if (!player.playing && player.t >= recorder.duration) player.seek(0);
    player.playing = !player.playing;
  },
  onReplaySpeed(v) { if (player) player.speed = v; },
  onScrub(t) {
    if (!player) return;
    player.playing = false;
    player.seek(t);
  },
  onHighlight(h) {
    if (!player) return;
    player.seek(Math.max(0, h.t - 0.7));
    if (h.slow) { player.speed = 0.25; ui.setReplaySpeedButton(0.25); }
    player.playing = true;
  },
  onShowRankings() { ui.showRankings(loadRanks(), lastRankDate); },
  onClearRankings() {
    saveRanks([]);
    ui.showRankings([], 0);
  },
});

function setCam(v) {
  camMode = v;
  controls.enabled = v === 'free';
  ui.setCamButton(v);
  if (v === 'free' && cars.length) {
    const p = playerCar().model.group.position;
    controls.target.copy(p);
    camera.position.set(p.x + 0.5, p.y + 0.35, p.z - 0.5);
  }
}

/* ---------------- 레이스 진행 ---------------- */
function startCountdown() {
  config.seed = (Math.random() * 2 ** 31) | 0;
  rebuildCars();
  raceT = 0; physAcc = 0; recToggle = 0;
  raceResult = null;
  if (ghost) { ghost.player.seek(0); placeGhost(0, true); }
  countdownT = 3.2;
  gateAnim = 0;
  track.setGate(0);
  state = 'countdown';
  ui.showRace();
  // 이전 레이스의 수치가 카운트다운 동안 남지 않도록 초기화
  ui.updateHUD(0, 0, 0, track.lanes[config.lane].finishS);
  ui.setGapVisible(config.mode === 'duel' || !!ghost);
  ui.setMarkerVisible(config.mode === 'duel', !!ghost);
  if (config.mode === 'duel' || ghost) {
    ui.setGap(0, config.mode === 'duel' ? '🚙 라이벌' : '👻 고스트');
    ui.setMarker('rival', 0);
    ui.setMarker('ghost', 0);
  }
  if (camMode === 'free') setCam('broadcast');
}

function stepCar(c, i) {
  const sim = c.sim;
  const lane = track.lanes[sim.cfg.lane];
  const wasAirborne = sim.airborne;
  sim.step(PHYS_DT);
  if (recToggle === 0) recorder.push(raceT, sim, i);

  if (wasAirborne && !sim.airborne && sim.landedImpact > 0.5) {
    c.landT = raceT; c.landImpact = sim.landedImpact;
  }
  // 체크포인트 (플레이어만 토스트)
  if (c.cpNext < lane.cpS.length && sim.s >= lane.cpS[c.cpNext]) {
    c.splits.push(raceT);
    if (c.role === 'player') ui.toast(`CP${c.cpNext + 1}  ${raceT.toFixed(2)}s`);
    c.cpNext++;
  }
  // 피니시
  if (c.finishTime == null && sim.s >= lane.finishS) {
    c.finishTime = raceT - (sim.s - lane.finishS) / Math.max(0.05, sim.v);
    if (cars.length > 1) {
      const already = cars.filter((o) => o !== c && o.finishTime != null).length;
      const pos = already + 1;
      ui.toast(`🏁 ${c.role === 'player' ? '내 차' : '라이벌'} ${pos}위 · ${c.finishTime.toFixed(3)}s`);
    } else {
      ui.toast(`🏁 ${c.finishTime.toFixed(3)}s`);
    }
  }
  // 트랙 끝 범퍼
  if (sim.s >= lane.total - 0.06) { sim.s = lane.total - 0.06; sim.v = 0; }
  // 실속 감지
  if (sim.v < 0.005 && !sim.airborne) c.stallT += PHYS_DT; else c.stallT = 0;
}

function raceOver() {
  // 모든 차가 (완주 후 정지 | 완주 후 6초 경과 | 2초 이상 실속) 이면 종료
  return cars.every((c) =>
    (c.finishTime != null && c.sim.v < 0.01)
    || (c.finishTime != null && raceT > c.finishTime + 6)
    || c.stallT > 2.0) || raceT > 90;
}

function stepRace(dt) {
  physAcc += dt;
  while (physAcc >= PHYS_DT && state === 'race') {
    physAcc -= PHYS_DT;
    raceT += PHYS_DT;
    recToggle ^= 1;
    for (let i = 0; i < cars.length; i++) stepCar(cars[i], i);
    if (raceOver()) { endRace(); break; }
  }

  for (const c of cars) {
    c.model.spinWheels(c.sim.v, dt);
    c.model.applySquash(raceT - c.landT, c.landImpact);
    placeCar(c);
  }
  if (ghost) placeGhost(raceT);

  const me = playerCar();
  const lane = track.lanes[me.sim.cfg.lane];
  ui.updateHUD(raceT, me.sim.v, Math.min(me.sim.s, lane.finishS), lane.finishS);
  updateGapHUD();
}

// 레인 길이가 다르므로 진행률로 비교하고, 갭은 내 레인 기준 거리(m)로 환산한다
function gapMeters(myFrac, otherFrac, myFinishS) {
  return (myFrac - otherFrac) * myFinishS;
}

// 상대/고스트와의 갭 + 진행 마커
function updateGapHUD() {
  const me = playerCar();
  // 피니시 이후 런아웃에서의 위치 변화는 승부와 무관 — 통과 시점 갭을 유지한다
  if (me.finishTime != null) return;
  const lane = track.lanes[me.sim.cfg.lane];
  const myFrac = me.sim.s / lane.finishS;

  if (config.mode === 'duel' && cars[1]) {
    const rvFrac = cars[1].sim.s / track.lanes[cars[1].sim.cfg.lane].finishS;
    ui.setGap(gapMeters(myFrac, rvFrac, lane.finishS), '🚙 라이벌');
    ui.setMarker('rival', rvFrac);
  } else if (ghost) {
    const smp = ghost.player.sample(raceT);
    if (smp) {
      const gFrac = smp.s / track.lanes[ghost.lane].finishS;
      ui.setGap(gapMeters(myFrac, gFrac, lane.finishS), '👻 고스트');
      ui.setMarker('ghost', gFrac);
    }
  }
  if (config.mode === 'duel' && ghost) {
    const smp = ghost.player.sample(raceT);
    if (smp) ui.setMarker('ghost', smp.s / track.lanes[ghost.lane].finishS);
  }
}

function carStats(idx) {
  let topV = 0, jumpMax = 0, airStartS = -1;
  for (const f of recorder.tracks[idx]) {
    if (f[2] > topV) topV = f[2];
    if (f[5] && airStartS < 0) airStartS = f[1];
    if (!f[5] && airStartS >= 0) { jumpMax = Math.max(jumpMax, f[1] - airStartS); airStartS = -1; }
  }
  return { topV, jumpMax };
}

function endRace() {
  state = 'finished';
  finishLingerT = 0.9;

  const me = playerCar();
  const lane = track.lanes[me.sim.cfg.lane];
  const { topV, jumpMax } = carStats(0);
  const dnf = me.finishTime == null;
  const w = WEATHERS[config.weather], wt = WHEEL_TYPES[config.wheel],
    d = WEIGHT_DIST[config.dist], b = BODY_TYPES[config.body];
  const emoji = { clear: '☀️', rain: '🌧️', snow: '❄️' }[config.weather];

  raceResult = {
    dnf,
    time: me.finishTime ?? 0,
    topV,
    avgV: dnf ? 0 : (lane.finishS - 0.12) / me.finishTime,
    jumpDist: jumpMax,
    splits: me.splits,
    sub: `${emoji} ${w.label} · ${config.lane + 1}레인 · ${config.massG}g · ${wt.label} · ${d.label} 배분 · ${b.label}`
      + (dnf ? ' — 저항을 이기지 못하고 트랙 위에서 멈췄습니다' : ''),
    versus: [],
  };

  // 2대 대결 결과
  if (config.mode === 'duel' && cars[1]) {
    const rv = cars[1];
    const rvCfg = rv.sim.cfg;
    const rvLabel = `${RIVAL_PRESETS[config.rivalPreset].label} (${rvCfg.lane + 1}레인 · ${rvCfg.massG}g · ${WHEEL_TYPES[rvCfg.wheel].label})`;
    let verdict, diff = null;
    if (me.finishTime != null && rv.finishTime != null) {
      diff = rv.finishTime - me.finishTime;
      verdict = diff > 0 ? 'win' : 'lose';
    } else if (me.finishTime != null) verdict = 'win';
    else if (rv.finishTime != null) verdict = 'lose';
    else verdict = 'draw';
    raceResult.versus.push({
      kind: 'duel', label: rvLabel, verdict, diff,
      myTime: me.finishTime, otherTime: rv.finishTime,
    });
  }

  // 고스트 대결 결과
  if (ghost) {
    const gt = ghost.data.time;
    let verdict = 'draw', diff = null;
    if (me.finishTime != null) {
      diff = gt - me.finishTime;
      verdict = diff > 0 ? 'win' : 'lose';
    } else verdict = 'lose';
    raceResult.versus.push({
      kind: 'ghost', label: `내 최고 기록 (${ghost.data.cfg.massG}g · ${WHEEL_TYPES[ghost.data.cfg.wheel].label})`,
      verdict, diff, myTime: me.finishTime, otherTime: gt,
    });
  }

  // 랭킹 등록 (완주 시)
  if (!dnf) {
    const styleLabel = config.style === 'road' ? '마운틴 로드' : '클래식';
    const modeTag = config.mode === 'duel' ? ' · 2대 대결' : '';
    const entry = {
      t: me.finishTime, date: Date.now(),
      cfg: `${emoji} ${config.lane + 1}레인 · ${config.massG}g · ${wt.label} · ${b.label} · ${styleLabel}${modeTag}`,
    };
    const ranks = loadRanks();
    ranks.push(entry);
    ranks.sort((a, b2) => a.t - b2.t);
    if (ranks.length > 30) ranks.length = 30;
    saveRanks(ranks);
    lastRankDate = entry.date;
    const idx = ranks.findIndex((r) => r.date === entry.date && r.t === entry.t);
    raceResult.rank = idx >= 0 ? idx + 1 : 0;
    raceResult.rankTotal = ranks.length;

    // 고스트 갱신: 이 트랙 스타일의 자기 최고 기록이면 저장
    const prev = loadGhost();
    if (!prev || me.finishTime < prev.time) {
      saveGhost({
        time: me.finishTime,
        date: entry.date,
        style: config.style,
        cfg: {
          lane: config.lane, massG: config.massG, wheel: config.wheel,
          dist: config.dist, body: config.body, weather: config.weather,
        },
        frames: recorder.serializeTrack(0, 4),
      });
      raceResult.ghostUpdated = true;
    }
  }
}

/* ---------------- 카메라 ---------------- */
const _camTarget = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _focus = new THREE.Vector3();
let idleAngle = 0;

// 중계 캠 기준점: 2대 대결이면 두 차의 중간(접전이면 둘 다 화면에)
function focusPoint() {
  if (!cars.length) return _focus.set(0, 2.6, 0);
  _focus.copy(playerCar().model.group.position);
  if (config.mode === 'duel' && cars[1] && (state === 'race' || state === 'replay')) {
    const other = cars[1].model.group.position;
    if (_focus.distanceTo(other) < 1.2) _focus.lerp(other, 0.5);
  }
  return _focus;
}

function updateCamera(dt) {
  const carPos = cars.length ? playerCar().model.group.position : new THREE.Vector3(0, 2.6, 0);

  if (state === 'setup') {
    // 게이트의 차량 클로즈업 궤도 — 세팅 변경점(리버리/휠/웨이트/차체)이 바로 보인다
    idleAngle += dt * 0.4;
    const r = config.mode === 'duel' ? 0.30 : 0.21;
    const c = config.mode === 'duel' && cars[1]
      ? _focus.copy(carPos).lerp(cars[1].model.group.position, 0.5)
      : carPos;
    const desired = new THREE.Vector3(
      c.x + Math.cos(idleAngle) * r,
      c.y + 0.075 + Math.sin(idleAngle * 0.7) * 0.03,
      c.z + Math.sin(idleAngle) * r);
    camera.position.lerp(desired, 0.08);
    _camTarget.lerp(new THREE.Vector3(c.x, c.y + 0.012, c.z), 0.15);
    camera.lookAt(_camTarget);
    return;
  }

  if (camMode === 'free') {
    controls.target.lerp(carPos, 0.15);
    controls.update();
    return;
  }

  playerCar().model.group.getWorldDirection(_fwd); // +z 로컬 → 월드 전방

  if (camMode === 'chase') {
    const desired = carPos.clone().addScaledVector(_fwd, -0.34);
    desired.y += 0.16;
    camera.position.lerp(desired, 1 - Math.exp(-dt * 7));
    _camTarget.copy(carPos).addScaledVector(_fwd, 0.2);
    _camTarget.y += 0.03;
    camera.lookAt(_camTarget);
  } else if (camMode === 'onboard') {
    camera.position.copy(carPos).addScaledVector(_fwd, -0.015);
    camera.position.y += 0.045;
    _camTarget.copy(carPos).addScaledVector(_fwd, 0.6);
    _camTarget.y += 0.02;
    camera.lookAt(_camTarget);
  } else { // broadcast — 트랙사이드 자동 컷 (다이캐스트 중계 스타일)
    const s = currentS();
    let cam = broadcastCams[0];
    for (const c of broadcastCams) {
      if (s >= c.sStart && s < c.sEnd) { cam = c; break; }
    }
    camera.position.copy(cam.pos);
    camera.lookAt(focusPoint());
  }
}

function currentS() {
  if (state === 'replay' && player) return player.sample(player.t)?.s ?? 0;
  return cars.length ? playerCar().sim.s : 0;
}

/* ---------------- 메인 루프 ---------------- */
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  elapsed += dt;

  env.update(dt, elapsed);

  if (state === 'countdown') {
    countdownT -= dt;
    const n = Math.ceil(countdownT - 0.2);
    ui.setCountdown(countdownT > 0.2 ? String(Math.max(1, n)) : 'GO!');
    if (countdownT <= 0.2) {
      gateAnim = Math.min(1, gateAnim + dt * 5);
      track.setGate(gateAnim);
    }
    if (countdownT <= 0) {
      ui.setCountdown(null);
      track.setGate(1);
      state = 'race';
    }
    for (const c of cars) placeCar(c);
  } else if (state === 'race') {
    stepRace(dt);
  } else if (state === 'finished') {
    if (finishLingerT > 0) {
      finishLingerT -= dt;
      if (finishLingerT <= 0) ui.showResults(raceResult);
    }
    for (const c of cars) placeCar(c);
  } else if (state === 'replay' && player) {
    player.tick(dt);
    const samples = player.sampleAll(player.t);
    samples.forEach((smp, i) => {
      if (!smp || !cars[i]) return;
      const c = cars[i];
      track.placeCar(c.model.group, c.sim.cfg.lane, smp.s, smp.alt, smp.v,
        { airborne: smp.airborne, vy: smp.vy });
      updateBlob(c.blob, c.model.group.position, smp.alt);
      c.model.spinWheels(smp.v, dt * player.speed);
      c.model.applySquash(999, 0);
    });
    if (ghost) placeGhost(player.t);
    const me = samples[0];
    if (me) {
      const myFinishS = track.lanes[playerCar().sim.cfg.lane].finishS;
      const myFrac = me.s / myFinishS;
      ui.updateHUD(player.t, me.v, me.s, myFinishS);
      if (samples[1]) {
        const rvFrac = samples[1].s / track.lanes[cars[1].sim.cfg.lane].finishS;
        ui.setGap(gapMeters(myFrac, rvFrac, myFinishS), '🚙 라이벌');
        ui.setMarker('rival', rvFrac);
      } else if (ghost) {
        const g = ghost.player.sample(player.t);
        if (g) {
          const gFrac = g.s / track.lanes[ghost.lane].finishS;
          ui.setGap(gapMeters(myFrac, gFrac, myFinishS), '👻 고스트');
          ui.setMarker('ghost', gFrac);
        }
      }
    }
    ui.updateReplay(player.t, recorder.duration, player.playing);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------- 시작 ---------------- */
track.buildMesh(scene, heightFn, config.style);
env.setWeather(config.weather);
ui.applyConfig(config);
rebuildCars();
ui.showSetup();
ui.setRivalGroupVisible(config.mode === 'duel');
ui.setRivalHint(config.mode === 'duel' ? rivalConfig() : null);
ui.hideLoading();
setCam('broadcast');
animate();
