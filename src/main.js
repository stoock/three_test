import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Track } from './track.js';
import { Environment } from './environment.js';
import { CarSim, PHYS_DT, WEATHERS, WHEEL_TYPES, WEIGHT_DIST, BODY_TYPES } from './physics.js';
import { buildCar, CAR_COLORS } from './carmodel.js';
import { Recorder, Player, REC_HZ } from './replay.js';
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

/* ---------------- 상태 (설정은 localStorage에 저장/복원) ---------------- */
const config = {
  weather: 'clear', lane: 1, massG: 55, wheel: 'stock',
  dist: 'center', body: 'standard', color: CAR_COLORS[0],
  livery: 'number', style: 'classic', seed: 12345,
};
const CFG_KEYS = ['weather', 'lane', 'massG', 'wheel', 'dist', 'body', 'color', 'livery', 'style'];
try {
  const saved = JSON.parse(localStorage.getItem('hwd_config') || 'null');
  if (saved) for (const k of CFG_KEYS) if (k in saved) config[k] = saved[k];
} catch { /* 무시 */ }
function saveConfig() {
  const out = {};
  for (const k of CFG_KEYS) out[k] = config[k];
  try { localStorage.setItem('hwd_config', JSON.stringify(out)); } catch { /* 무시 */ }
}

/* ---------------- 랭킹 (localStorage) ---------------- */
function loadRanks() {
  try { return JSON.parse(localStorage.getItem('hwd_ranks') || '[]'); } catch { return []; }
}
function saveRanks(r) {
  try { localStorage.setItem('hwd_ranks', JSON.stringify(r)); } catch { /* 무시 */ }
}
let lastRankDate = 0;

let state = 'setup'; // setup | countdown | race | finished | replay
let car = null;        // { sim, model }
let recorder = new Recorder();
let player = null;
let raceT = 0;
let physAcc = 0;
let recToggle = 0;
let countdownT = 0;
let gateAnim = 0;
let camMode = 'broadcast';
let stallT = 0;
let finishTime = null;
let splits = [];
let cpNext = 0;
let raceResult = null;
let lastLandT = -10;
let lastImpact = 0;
let finishLingerT = 0;

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
const blob = new THREE.Mesh(
  new THREE.PlaneGeometry(0.11, 0.11),
  new THREE.MeshBasicMaterial({ map: makeBlobTexture(), transparent: true, depthWrite: false })
);
blob.rotation.x = -Math.PI / 2;
scene.add(blob);

/* ---------------- 차량 생성/배치 ---------------- */
function rebuildCar() {
  if (car) {
    scene.remove(car.model.group);
    car.model.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
  const model = buildCar({
    color: config.color, body: config.body, wheel: config.wheel,
    livery: config.livery, massG: config.massG, dist: config.dist,
  });
  scene.add(model.group);
  const sim = new CarSim(track, { ...config });
  car = { sim, model };
  placeCarLive(true);
}

function placeCarLive(snap = false) {
  const { sim, model } = car;
  track.placeCar(model.group, sim.cfg.lane, sim.s, sim.alt, sim.v,
    { airborne: sim.airborne, vy: sim.vy, snap });
  updateBlob(sim.cfg.lane, sim.s, sim.alt);
}

function updateBlob(lane, s, alt) {
  const p = car.model.group.position;
  blob.position.set(p.x, p.y - alt + 0.0015, p.z);
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
    if (state === 'setup') rebuildCar();
  },
  onStart() {
    startCountdown();
  },
  onBackToSetup() {
    state = 'setup';
    config.seed = (Math.random() * 2 ** 31) | 0;
    track.setGate(0);
    rebuildCar();
    ui.showSetup();
  },
  onEnterReplay() {
    if (!recorder.frames.length) return;
    state = 'replay';
    player = new Player(recorder);
    player.seek(0);
    player.playing = true;
    player.speed = 1;
    ui.setReplaySpeedButton(1);
    ui.showReplay(recorder.duration, recorder.analyze(finishTime));
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
  onShowRankings() {
    ui.showRankings(loadRanks(), lastRankDate);
  },
  onClearRankings() {
    saveRanks([]);
    ui.showRankings([], 0);
  },
});

function setCam(v) {
  camMode = v;
  controls.enabled = v === 'free';
  ui.setCamButton(v);
  if (v === 'free' && car) {
    controls.target.copy(car.model.group.position);
    const p = car.model.group.position;
    camera.position.set(p.x + 0.5, p.y + 0.35, p.z - 0.5);
  }
}

/* ---------------- 레이스 진행 ---------------- */
function startCountdown() {
  config.seed = (Math.random() * 2 ** 31) | 0;
  rebuildCar();
  recorder.clear();
  raceT = 0; physAcc = 0; recToggle = 0;
  finishTime = null; splits = []; cpNext = 0; stallT = 0;
  raceResult = null; lastLandT = -10;
  countdownT = 3.2;
  gateAnim = 0;
  track.setGate(0);
  state = 'countdown';
  ui.showRace();
  if (camMode === 'free') setCam('broadcast');
}

function stepRace(dt) {
  physAcc += dt;
  const sim = car.sim;
  const lane = track.lanes[sim.cfg.lane];
  while (physAcc >= PHYS_DT && state === 'race') {
    physAcc -= PHYS_DT;
    const wasAirborne = sim.airborne;
    sim.step(PHYS_DT);
    raceT += PHYS_DT;
    recToggle ^= 1;
    if (recToggle === 0) recorder.push(raceT, sim);

    if (wasAirborne && !sim.airborne && sim.landedImpact > 0.5) {
      lastLandT = raceT; lastImpact = sim.landedImpact;
    }

    // 체크포인트
    if (cpNext < lane.cpS.length && sim.s >= lane.cpS[cpNext]) {
      splits.push(raceT);
      ui.toast(`CP${cpNext + 1}  ${raceT.toFixed(2)}s`);
      cpNext++;
    }
    // 피니시
    if (finishTime == null && sim.s >= lane.finishS) {
      finishTime = raceT - (sim.s - lane.finishS) / Math.max(0.05, sim.v);
      ui.toast(`🏁 ${finishTime.toFixed(3)}s`);
    }
    // 트랙 끝 범퍼
    if (sim.s >= lane.total - 0.06) { sim.s = lane.total - 0.06; sim.v = 0; }
    // 실속(DNF) / 종료 판정
    if (sim.v < 0.005 && !sim.airborne) stallT += PHYS_DT; else stallT = 0;
    if ((finishTime != null && sim.v < 0.01) || (finishTime != null && raceT > finishTime + 6)
      || stallT > 2.0 || raceT > 90) {
      endRace();
      break;
    }
  }
  car.model.spinWheels(sim.v, dt);
  car.model.applySquash(raceT - lastLandT, lastImpact);
  placeCarLive();
  ui.updateHUD(raceT, sim.v, Math.min(sim.s, lane.finishS), lane.finishS);
}

function endRace() {
  const sim = car.sim;
  const lane = track.lanes[sim.cfg.lane];
  state = 'finished';
  finishLingerT = 0.9;

  // 결과 집계
  let topV = 0, jumpMax = 0, airStartS = -1;
  for (const f of recorder.frames) {
    if (f[2] > topV) topV = f[2];
    if (f[5] && airStartS < 0) airStartS = f[1];
    if (!f[5] && airStartS >= 0) { jumpMax = Math.max(jumpMax, f[1] - airStartS); airStartS = -1; }
  }
  const dnf = finishTime == null;
  const w = WEATHERS[config.weather], wt = WHEEL_TYPES[config.wheel],
    d = WEIGHT_DIST[config.dist], b = BODY_TYPES[config.body];
  const emoji = { clear: '☀️', rain: '🌧️', snow: '❄️' }[config.weather];
  raceResult = {
    dnf,
    time: finishTime ?? 0,
    topV,
    avgV: dnf ? 0 : (lane.finishS - 0.12) / finishTime,
    jumpDist: jumpMax,
    splits,
    sub: `${emoji} ${w.label} · ${config.lane + 1}레인 · ${config.massG}g · ${wt.label} · ${d.label} 배분 · ${b.label}`
      + (dnf ? ' — 저항을 이기지 못하고 트랙 위에서 멈췄습니다' : ''),
  };

  // 랭킹 등록 (완주 시)
  if (!dnf) {
    const styleLabel = config.style === 'road' ? '마운틴 로드' : '클래식';
    const entry = {
      t: finishTime, date: Date.now(),
      cfg: `${emoji} ${config.lane + 1}레인 · ${config.massG}g · ${wt.label} · ${b.label} · ${styleLabel}`,
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
  }
}

/* ---------------- 카메라 ---------------- */
const _camTarget = new THREE.Vector3();
const _fwd = new THREE.Vector3();
let idleAngle = 0;

function updateCamera(dt) {
  const carPos = car ? car.model.group.position : new THREE.Vector3(0, 2.6, 0);

  if (state === 'setup') {
    // 게이트의 차량 클로즈업 궤도 — 세팅 변경점(리버리/휠/웨이트/차체)이 바로 보인다
    idleAngle += dt * 0.4;
    const r = 0.21;
    const desired = new THREE.Vector3(
      carPos.x + Math.cos(idleAngle) * r,
      carPos.y + 0.075 + Math.sin(idleAngle * 0.7) * 0.03,
      carPos.z + Math.sin(idleAngle) * r);
    camera.position.lerp(desired, 0.08);
    _camTarget.lerp(new THREE.Vector3(carPos.x, carPos.y + 0.012, carPos.z), 0.15);
    camera.lookAt(_camTarget);
    return;
  }

  if (camMode === 'free') {
    controls.target.lerp(carPos, 0.15);
    controls.update();
    return;
  }

  car.model.group.getWorldDirection(_fwd); // +z 로컬 → 월드 전방

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
    const s = car.sim ? currentS() : 0;
    let cam = broadcastCams[0];
    for (const c of broadcastCams) {
      if (s >= c.sStart && s < c.sEnd) { cam = c; break; }
    }
    camera.position.copy(cam.pos);
    camera.lookAt(carPos);
  }
}

function currentS() {
  if (state === 'replay' && player) return player.sample(player.t)?.s ?? 0;
  return car.sim.s;
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
    placeCarLive();
  } else if (state === 'race') {
    stepRace(dt);
  } else if (state === 'finished') {
    if (finishLingerT > 0) {
      finishLingerT -= dt;
      if (finishLingerT <= 0) ui.showResults(raceResult);
    }
    placeCarLive();
  } else if (state === 'replay' && player) {
    const smp = player.tick(dt);
    if (smp) {
      track.placeCar(car.model.group, config.lane, smp.s, smp.alt, smp.v,
        { airborne: smp.airborne, vy: smp.vy });
      updateBlob(config.lane, smp.s, smp.alt);
      car.model.spinWheels(smp.v, dt * player.speed);
      car.model.applySquash(999, 0);
      ui.updateHUD(player.t, smp.v, smp.s, track.lanes[config.lane].finishS);
      ui.updateReplay(player.t, recorder.duration, player.playing);
    }
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
rebuildCar();
ui.showSetup();
ui.hideLoading();
setCam('broadcast');
animate();
