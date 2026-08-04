import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Track, LANE_COUNT } from './track.js';
import { Environment } from './environment.js';
import { CarSim, PHYS_DT, WEATHERS, WHEEL_TYPES, WEIGHT_DIST, BODY_TYPES } from './physics.js';
import { buildCar, CAR_COLORS } from './carmodel.js';
import { Recorder, Player } from './replay.js';
import { RaceAudio } from './audio.js';
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
const broadcastCams = track.buildBroadcastCams(heightFn);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enabled = false;

/* ---------------- 차량 프리셋 ---------------- */
// 영화에 나올 법한 캐릭터를 가진 빌드들. 각각 앞서 만든 트레이드오프의 서로 다른 지점에
// 서 있어서, 프리셋을 고르는 것만으로 성격이 확 달라진다. (상표는 쓰지 않는다)
const CAR_PRESETS = {
  custom: { label: '커스텀', desc: '직접 조합' },
  muscle: {
    label: '🇺🇸 머슬', desc: '95g · 무겁고 뒤가 눌린 드래그 셋업. 와이드 바디가 아니면 넘어간다',
    silhouette: 'muscle',
    cfg: { massG: 95, wheel: 'fte', dist: 'rear', body: 'wide', color: CAR_COLORS[0], livery: 'stripe' },
  },
  tuner: {
    label: '🇯🇵 JDM 튜너', desc: '60g · 가볍고 매끈. 저항이 적어 미끄러운 날씨에 강하다',
    silhouette: 'tuner',
    cfg: { massG: 60, wheel: 'race', dist: 'center', body: 'streamline', color: CAR_COLORS[1], livery: 'number' },
  },
  exotic: {
    label: '🇮🇹 슈퍼카', desc: '80g · 최속 지향. 앞쏠림이라 착지는 좋지만 전복 위험이 있다',
    silhouette: 'exotic',
    cfg: { massG: 80, wheel: 'race', dist: 'front', body: 'streamline', color: CAR_COLORS[3], livery: 'stripe' },
  },
  rally: {
    label: '🌧️ 랠리', desc: '85g · 그립 좋은 순정 휠. 느리지만 비·눈에서 절대 안 넘어간다',
    silhouette: 'rally',
    cfg: { massG: 85, wheel: 'stock', dist: 'center', body: 'standard', color: CAR_COLORS[2], livery: 'number' },
  },
};

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
  mode: 'solo', ghost: 'off', rivalPreset: 'mirror', sound: 'on',
  preset: 'custom',
};
const CFG_KEYS = ['weather', 'lane', 'massG', 'wheel', 'dist', 'body', 'color', 'livery',
  'style', 'mode', 'ghost', 'rivalPreset', 'sound', 'preset'];
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

/* ---------------- 사운드 ---------------- */
const audio = new RaceAudio();
audio.enabled = config.sound !== 'off';
audio.setStyle(config.style);
// 콘솔/테스트에서 사운드 상태를 확인하거나 조절할 수 있도록 노출
window.raceAudio = audio;

// 카메라 기준 거리·좌우 위치 (스테레오 패닝)
const _rel = new THREE.Vector3();
const _camRight = new THREE.Vector3();
function spatial(pos) {
  _rel.subVectors(pos, camera.position);
  const dist = _rel.length();
  if (!Number.isFinite(dist)) return { dist: 50, panX: 0 };
  camera.getWorldDirection(_camRight);
  _camRight.cross(camera.up).normalize();
  const panX = dist > 1e-4 ? _rel.dot(_camRight) / dist : 0;
  return { dist, panX: Number.isFinite(panX) ? panX : 0 };
}

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
let contactCount = 0;
let lastContactT = -10;

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

// 로드 코스에서는 레인이 칸막이가 아니라 출발 위치 — 모든 차가 같은 기준선(중앙선)을
// 달리고, 선택한 레인은 도로를 가로지르는 초기 좌우 위치(startLat)가 된다.
// 그래서 이동 거리는 레인이 아니라 실제로 그린 라인이 결정한다.
function simConfig(cfg) {
  if (track.style !== 'road') return { ...cfg, startLat: 0, startLane: cfg.lane };
  return { ...cfg, lane: LANE_COUNT, startLane: cfg.lane, startLat: track.lanes[cfg.lane].offset };
}

function makeCar(cfg, role) {
  const model = buildCar({
    color: cfg.color, body: cfg.body, wheel: cfg.wheel, livery: cfg.livery,
    massG: cfg.massG, dist: cfg.dist, num: role === 'rival' ? 7 : 5,
    silhouette: CAR_PRESETS[cfg.preset]?.silhouette,
  });
  scene.add(model.group);
  const sim = new CarSim(track, simConfig(cfg));
  return {
    sim, model, role, blob: makeBlob(),
    finishTime: null, splits: [], cpNext: 0, stallT: 0,
    landT: -10, landImpact: 0, lastWallSfx: -10, contactSfx: 0,
    incidentSeen: null, incidentT: 0, offLanded: false,
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
  // 로드 코스는 모두 같은 기준선을 쓰므로 고스트도 중앙선 + 기록된 lat으로 달린다.
  // 클래식은 레인이 칸막이이므로, 실주행 차와 겹치면 빈 레인으로 옮긴다.
  const used = cars.map((c) => c.sim.cfg.lane);
  let gLane = track.style === 'road'
    ? LANE_COUNT
    : Math.min(LANE_COUNT - 1, Math.max(0, data.cfg.lane ?? 0));
  if (track.style !== 'road' && used.includes(gLane)) {
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
    { airborne: sim.airborne, vy: sim.vy, lat: sim.lat, latV: sim.latV,
      roll: sim.roll, snap });
  updateBlob(c.blob, model.group.position, sim.alt);
}

function placeGhost(t, snap = false) {
  if (!ghost) return;
  const smp = ghost.player.sample(t);
  if (!smp) return;
  track.placeCar(ghost.model.group, ghost.lane, smp.s, smp.alt, smp.v,
    { airborne: smp.airborne, vy: smp.vy, lat: smp.lat, latV: smp.latV,
      roll: smp.roll, snap });
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
    if (key === 'preset') {
      const p = CAR_PRESETS[val];
      config.preset = val;
      if (p?.cfg) Object.assign(config, p.cfg);
      saveConfig();
      ui.applyConfig(config);
      ui.setPresetDesc(p?.desc || '');
      if (state === 'setup') { rebuildCars(); ui.setRivalHint(config.mode === 'duel' ? rivalConfig() : null); }
      return;
    }
    // 세부 항목을 직접 건드리면 더 이상 프리셋 그대로가 아니다
    if (['massG', 'wheel', 'dist', 'body', 'livery', 'color'].includes(key)
      && config.preset !== 'custom') {
      config.preset = 'custom';
      ui.setPresetButton('custom');
      ui.setPresetDesc(CAR_PRESETS.custom.desc);
    }
    config[key] = val;
    saveConfig();
    if (key === 'weather') { env.setWeather(val); audio.setWeather(val); }
    if (key === 'style') {
      track.buildMesh(scene, heightFn, val);
      track.setWet(config.weather === 'rain');
      audio.setStyle(val);
      ui.setLaneMode(val);
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
  onToggleSound() {
    config.sound = config.sound === 'on' ? 'off' : 'on';
    saveConfig();
    audio.init();
    audio.setEnabled(config.sound === 'on');
    ui.setSoundButton(config.sound === 'on');
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
  raceResult = null; contactCount = 0; lastContactT = -10;
  if (ghost) { ghost.player.seek(0); placeGhost(0, true); }
  countdownT = 3.2;
  gateAnim = 0;
  track.setGate(0);
  // 사운드 보이스 준비 (첫 사용자 클릭 시점이므로 여기서 AudioContext를 깨운다)
  audio.init();
  audio.setStyle(config.style);
  audio.setWeather(config.weather);
  audio.setRate(1);
  audio.clearVoices();
  for (const c of cars) {
    audio.addVoice(c.role, { massG: c.sim.cfg.massG, wheel: c.sim.cfg.wheel });
  }
  if (ghost) audio.addVoice('ghost', { massG: ghost.data.cfg.massG, wheel: ghost.data.cfg.wheel, ghost: true });

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
    audio.landing(sim.landedImpact, spatial(c.model.group.position).dist);
  }
  // 벽에 새로 부딪히는 순간 (긁힘 지속음과 별개인 타격음)
  if (sim.wallHit > 0.05 && raceT - c.lastWallSfx > 0.12) {
    c.lastWallSfx = raceT;
    audio.wallHit(sim.wallHit, spatial(c.model.group.position).dist);
  }
  // 사고 발생 — 전복 / 코스 이탈
  if (sim.incident && !c.incidentSeen) {
    c.incidentSeen = sim.incident;
    c.incidentT = raceT;
    const d = spatial(c.model.group.position).dist;
    audio.crash(sim.incident, d);
    if (c.role === 'player') {
      ui.toast(INCIDENT_LABEL[sim.incident] || '💥 사고');
    }
  }
  // 이탈한 차가 지면에 닿으면 그 자리에서 멈춘다
  if (sim.off) {
    const groundAlt = groundAltBelow(c);
    if (sim.alt <= groundAlt) {
      sim.alt = groundAlt;
      if (!c.offLanded) {
        c.offLanded = true;
        audio.landing(2.2, spatial(c.model.group.position).dist);
      }
      sim.v *= Math.exp(-6 * PHYS_DT);
      sim.latV *= Math.exp(-6 * PHYS_DT);
      sim.rollV *= Math.exp(-5 * PHYS_DT);
    }
  }
  // 체크포인트 (플레이어만 토스트)
  if (c.cpNext < lane.cpS.length && sim.s >= lane.cpS[c.cpNext]) {
    c.splits.push(raceT);
    if (c.role === 'player') { ui.toast(`CP${c.cpNext + 1}  ${raceT.toFixed(2)}s`); audio.checkpoint(); }
    c.cpNext++;
  }
  // 피니시
  if (c.finishTime == null && sim.s >= lane.finishS) {
    c.finishTime = raceT - (sim.s - lane.finishS) / Math.max(0.05, sim.v);
    if (c.role === 'player') {
      audio.finish(cars.length < 2 || cars.every((o) => o === c || o.finishTime == null));
    }
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

// 차대차 접촉 — 마운틴 로드처럼 레인 디바이더가 없는 코스에서만 일어난다.
// 코너에서 바깥으로 밀린 차들이 같은 라인으로 몰리면서 서로 부딪히고, 그 충격으로
// 경로가 바뀌어 한쪽이 방호벽으로 밀려나기도 한다. (클래식 트랙은 디바이더가 막아준다)
const INCIDENT_LABEL = {
  rollover: '💥 전복! 벽에 걸려 넘어갔습니다',
  'crash-landing': '💥 착지 실패 — 기운 채로 떨어져 뒤집혔습니다',
  vault: '🚀 코스 이탈! 벽을 넘어 날아갔습니다',
  launched: '💥 접촉으로 튕겨 날아갔습니다',
};
const INCIDENT_SHORT = {
  rollover: '전복', 'crash-landing': '착지 실패', vault: '코스 이탈', launched: '접촉 사고',
};

// 이탈한 차 아래의 지면 높이 → 트랙면 기준 상대 고도로 환산
function groundAltBelow(c) {
  const p = c.model.group.position;
  const g = env.heightAt(p.x, p.z);
  return (g + 0.006) - (p.y - c.sim.alt);
}

const CAR_HALF_LEN = 0.034;
const MU_SIDE = 0.14;          // 차체 옆면끼리 비빌 때의 마찰계수
const touching = new Map();    // 쌍별 접촉 지속 여부

function resolveContacts() {
  if (track.style !== 'road' || cars.length < 2) return;
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const key = `${i}-${j}`;
      const A = cars[i].sim, B = cars[j].sim;
      const minGap = A.halfCarW + B.halfCarW;
      const apart = A.airborne || B.airborne
        || Math.abs(A.s - B.s) > CAR_HALF_LEN * 2
        || Math.abs(A.lat - B.lat) >= minGap;
      if (apart) { touching.set(key, false); continue; }

      const d = A.lat - B.lat;
      const dir = d >= 0 ? 1 : -1;              // +1이면 A가 B의 오른쪽에 있다
      const overlap = minGap - Math.abs(d);
      const mA = A.mass, mB = B.mass, mSum = mA + mB;

      // 겹침 해소 — 무거운 쪽이 덜 밀린다
      A.lat += dir * overlap * (mB / mSum);
      B.lat -= dir * overlap * (mA / mSum);
      A.lat = Math.max(A.latLimit.min, Math.min(A.latLimit.max, A.lat));
      B.lat = Math.max(B.latLimit.min, Math.min(B.latLimit.max, B.lat));

      // 부딪히는 순간: 횡 운동량 교환 (다이캐스트끼리는 크게 튕기지 않고 밀린다)
      const rel = A.latV - B.latV;
      if (rel * dir < 0) {
        const imp = (-1.25 * rel) / (1 / mA + 1 / mB);
        A.latV += imp / mA;
        B.latV -= imp / mB;
        const hit = Math.abs(rel);
        if (hit > 0.05) {
          cars[i].contactSfx = Math.max(cars[i].contactSfx, hit);
          cars[j].contactSfx = Math.max(cars[j].contactSfx, hit);
          // 휠 인터록 — 바퀴가 맞물리면 한쪽이 그대로 튕겨 넘어간다.
          // 가벼운 쪽이 더 큰 속도 변화를 받으므로 위험도 크다.
          if (hit > 0.3) {
            A.tripBy(hit * (mB / mSum) * 1.25, -dir);
            B.tripBy(hit * (mA / mSum) * 1.25, dir);
          }
        }
      }

      // 지속 접촉: 안쪽 차가 바깥 차를 벽 쪽으로 계속 밀어붙이는 상황.
      // 안쪽 차의 초과 횡력이 바깥 차를 통해 벽으로 전달되므로, 바깥 차는 벽 마찰이
      // 늘고 안쪽 차는 상대 차체 옆면과 비비며 감속한다.
      const outer = A.latOutward > 0 ? (dir > 0 ? A : B) : (dir > 0 ? B : A);
      const inner = outer === A ? B : A;
      if (inner.latDemand > 0) {
        // 안쪽 차: 상대 옆구리와의 마찰
        inner.rubScrub += MU_SIDE * inner.latDemand * inner.body.stability;
        // 바깥 차: 안쪽 차가 미는 힘까지 벽으로 받아낸다 (질량비로 per-mass 환산)
        outer.rubScrub += outer.weather.wallMu * inner.latDemand
          * (inner.mass / outer.mass) * outer.body.stability;
        // 안쪽 차는 상대를 통과할 수 없다 — 바깥으로 더 나가려는 속도는 막힌다
        const innerOutward = inner.latOutward;
        if ((innerOutward > 0 && inner.latV > 0) || (innerOutward < 0 && inner.latV < 0)) {
          inner.latV *= 0.2;
        }
      }

      // 접촉 시작 순간만 1회 집계 (지속 접촉이 계속 카운트되지 않도록)
      if (!touching.get(key)) {
        touching.set(key, true);
        if (raceT - lastContactT > 0.15) { contactCount++; lastContactT = raceT; }
      }
    }
  }
}

function raceOver() {
  // 모든 차가 (완주 후 정지 | 완주 후 6초 경과 | 2초 이상 실속 | 이탈 후 착지) 이면 종료
  return cars.every((c) =>
    (c.finishTime != null && c.sim.v < 0.01)
    || (c.finishTime != null && raceT > c.finishTime + 6)
    || c.stallT > 2.0
    || (c.sim.off && c.offLanded && c.sim.v < 0.15)) || raceT > 90;
}

function stepRace(dt) {
  physAcc += dt;
  while (physAcc >= PHYS_DT && state === 'race') {
    physAcc -= PHYS_DT;
    raceT += PHYS_DT;
    recToggle ^= 1;
    for (let i = 0; i < cars.length; i++) stepCar(cars[i], i);
    resolveContacts();
    for (const c of cars) {
      if (c.contactSfx > 0.05 && raceT - c.lastWallSfx > 0.1) {
        c.lastWallSfx = raceT;
        audio.wallHit(c.contactSfx * 1.4, spatial(c.model.group.position).dist);
        if (c.role === 'player') ui.toast('💥 접촉!');
      }
      c.contactSfx = 0;
    }
    if (raceOver()) { endRace(); break; }
  }

  for (const c of cars) {
    c.model.spinWheels(c.sim.v, dt);
    c.model.applySquash(raceT - c.landT, c.landImpact);
    placeCar(c);
    const sp = spatial(c.model.group.position);
    audio.updateVoice(c.role, {
      v: c.sim.v, scrub: c.sim.scrub, wallContact: c.sim.wallContact,
      airborne: c.sim.airborne, dist: sp.dist, panX: sp.panX,
    });
  }
  if (ghost) {
    const smp = placeGhost(raceT);
    if (smp) {
      const sp = spatial(ghost.model.group.position);
      audio.updateVoice('ghost', {
        v: smp.v, scrub: smp.scrub, wallContact: smp.wallContact,
        airborne: smp.airborne, dist: sp.dist, panX: sp.panX,
      });
    }
  }

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
    contacts: contactCount,
    incident: me.sim.incident,
    incidentLabel: me.sim.incident ? INCIDENT_LABEL[me.sim.incident] : null,
    ssf: me.sim.ssf,
    sub: `${emoji} ${w.label} · ${config.lane + 1}${config.style === 'road' ? '번 위치' : '레인'}`
      + ` · ${config.massG}g · ${wt.label} · ${d.label} 배분 · ${b.label}`
      + (dnf && !me.sim.incident ? ' — 저항을 이기지 못하고 트랙 위에서 멈췄습니다' : ''),
    versus: [],
  };

  // 2대 대결 결과
  if (config.mode === 'duel' && cars[1]) {
    const rv = cars[1];
    const rvCfg = rv.sim.cfg;
    const posWord = config.style === 'road' ? '번 위치' : '레인';
    const rvLabel = `${RIVAL_PRESETS[config.rivalPreset].label} `
      + `(${(rvCfg.startLane ?? rvCfg.lane) + 1}${posWord} · ${rvCfg.massG}g · ${WHEEL_TYPES[rvCfg.wheel].label})`;
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
    const prev = countdownT;
    countdownT -= dt;
    const n = Math.ceil(countdownT - 0.2);
    ui.setCountdown(countdownT > 0.2 ? String(Math.max(1, n)) : 'GO!');
    // 초 단위로 넘어갈 때마다 비프
    if (Math.ceil(prev - 0.2) !== n && n >= 1 && countdownT > 0.2) audio.countdownBeep(false);
    if (countdownT <= 0.2) {
      if (prev > 0.2) { audio.countdownBeep(true); audio.gateRelease(); }
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
    for (const c of cars) {
      placeCar(c);
      audio.updateVoice(c.role, { v: 0, scrub: 0, wallContact: 0, airborne: false, dist: 1 });
    }
    if (ghost) audio.updateVoice('ghost', { v: 0, scrub: 0, wallContact: 0, airborne: false, dist: 1 });
  } else if (state === 'replay' && player) {
    player.tick(dt);
    const samples = player.sampleAll(player.t);
    audio.setRate(player.playing ? player.speed : 0.0001);
    samples.forEach((smp, i) => {
      if (!smp || !cars[i]) return;
      const c = cars[i];
      track.placeCar(c.model.group, c.sim.cfg.lane, smp.s, smp.alt, smp.v,
        { airborne: smp.airborne, vy: smp.vy, lat: smp.lat, latV: smp.latV, roll: smp.roll });
      updateBlob(c.blob, c.model.group.position, smp.alt);
      c.model.spinWheels(smp.v, dt * player.speed);
      c.model.applySquash(999, 0);
      const sp = spatial(c.model.group.position);
      // 슬로우모션이면 소리도 함께 느려진다 (배속을 음높이·크기에 반영)
      audio.updateVoice(c.role, {
        v: smp.v * (player.playing ? player.speed : 0),
        scrub: smp.scrub, wallContact: smp.wallContact,
        airborne: smp.airborne, dist: sp.dist, panX: sp.panX,
      });
    });
    if (ghost) {
      const g = placeGhost(player.t);
      if (g) {
        const sp = spatial(ghost.model.group.position);
        audio.updateVoice('ghost', {
          v: g.v * (player.playing ? player.speed : 0), scrub: g.scrub,
          wallContact: g.wallContact, airborne: g.airborne, dist: sp.dist, panX: sp.panX,
        });
      }
    }
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
ui.setLaneMode(config.style);
ui.applyConfig(config);
ui.setPresetDesc(CAR_PRESETS[config.preset]?.desc || '');
rebuildCars();
ui.showSetup();
ui.setSoundButton(config.sound === 'on');
ui.setRivalGroupVisible(config.mode === 'duel');
ui.setRivalHint(config.mode === 'duel' ? rivalConfig() : null);
ui.hideLoading();
setCam('broadcast');
animate();
