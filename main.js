import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------------------
// 여의도 공원 산책 게임
// 공원은 동서로 긴 직사각형 (x: -210 ~ 210, z: -85 ~ 85) 으로 모델링한다.
//  - 서쪽 끝(x-): 문화의 마당 (포장 광장, C-47 비행기 전시)
//  - 중앙: 잔디마당 (세종대왕 동상)
//  - 동쪽(x+): 생태연못 + 육각정, 한국전통의 숲
//  - 공원 둘레: 자전거 도로(타원 트랙), 벚나무 산책로
// ---------------------------------------------------------------------------

const PARK = { minX: -210, maxX: 210, minZ: -85, maxZ: 85 };
const POND = { x: 95, z: 25, rx: 42, rz: 28 };
const PLAZA = { minX: -205, maxX: -120, minZ: -55, maxZ: 55 };
const BIKE = { rx: 190, rz: 70, width: 7 };

const EYE_HEIGHT = 1.7;
const WALK_SPEED = 6;
const RUN_SPEED = 13;
const JUMP_SPEED = 6.5;
const GRAVITY = 18;

// --- 기본 셋업 -------------------------------------------------------------

const scene = new THREE.Scene();
const SKY_COLOR = 0x9ed2f0;
scene.background = new THREE.Color(SKY_COLOR);
scene.fog = new THREE.Fog(SKY_COLOR, 220, 750);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1200);
camera.position.set(-190, EYE_HEIGHT, 0);
camera.lookAt(0, EYE_HEIGHT, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0xcfe8ff, 0x6a8f5a, 0.9);
scene.add(hemiLight);

const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 300;
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
sun.shadow.bias = -0.0005;
sun.position.set(camera.position.x + 60, 90, camera.position.z + 40);
sun.target.position.set(camera.position.x, 0, camera.position.z);
scene.add(sun, sun.target);

// 금속 재질(동상, 비행기, 63빌딩)을 위한 환경맵
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
}

// --- 재질 ------------------------------------------------------------------

const MAT = {
  grass: new THREE.MeshLambertMaterial({ color: 0x6fae53 }),
  city: new THREE.MeshLambertMaterial({ color: 0x9a9a96 }),
  path: new THREE.MeshLambertMaterial({ color: 0xc8bfae }),
  plaza: new THREE.MeshLambertMaterial({ color: 0xb9b2a6 }),
  bike: new THREE.MeshLambertMaterial({ color: 0xa84a3c }),
  water: new THREE.MeshPhongMaterial({ color: 0x3d7fa8, shininess: 90, transparent: true, opacity: 0.92 }),
  pondRim: new THREE.MeshLambertMaterial({ color: 0x8a8276 }),
  trunk: new THREE.MeshLambertMaterial({ color: 0x6b4a2f }),
  leaf: new THREE.MeshLambertMaterial({ color: 0x3e7d3a }),
  pine: new THREE.MeshLambertMaterial({ color: 0x2f5e35 }),
  cherry: new THREE.MeshLambertMaterial({ color: 0xf2b8cf }),
  stone: new THREE.MeshLambertMaterial({ color: 0x7d7d80 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd4a93c, metalness: 0.7, roughness: 0.35 }),
  woodDark: new THREE.MeshLambertMaterial({ color: 0x5a3c28 }),
  roof: new THREE.MeshLambertMaterial({ color: 0x3a4a3f }),
  redPost: new THREE.MeshLambertMaterial({ color: 0x8c3b2e }),
  planeBody: new THREE.MeshStandardMaterial({ color: 0xb9c0c6, metalness: 0.6, roughness: 0.4 }),
  lampPole: new THREE.MeshLambertMaterial({ color: 0x3c4045 }),
  lampGlow: new THREE.MeshBasicMaterial({ color: 0xfff3c0 }),
  building: new THREE.MeshLambertMaterial({ color: 0x8e9aa6 }),
  building2: new THREE.MeshLambertMaterial({ color: 0x6f7d8c }),
  gold63: new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.25 }),
  hedge: new THREE.MeshLambertMaterial({ color: 0x4a7a3e }),
  cloud: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  duck: new THREE.MeshLambertMaterial({ color: 0xf5f0e6 }),
  beak: new THREE.MeshLambertMaterial({ color: 0xe8a23c }),
};

// --- 충돌체 ----------------------------------------------------------------
// 원형 충돌체 { x, z, r } 목록. 매 프레임 플레이어를 밀어낸다.

const colliders = [];
function addCollider(x, z, r) { colliders.push({ x, z, r }); }

// --- 지형 ------------------------------------------------------------------

function buildGround() {
  // 도시 바닥 (공원 바깥)
  const city = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), MAT.city);
  city.rotation.x = -Math.PI / 2;
  city.position.y = -0.1;
  city.receiveShadow = true;
  scene.add(city);

  // 공원 잔디
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(PARK.maxX - PARK.minX + 30, PARK.maxZ - PARK.minZ + 30),
    MAT.grass
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);
}

function flatMesh(geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

function buildPaths() {
  // 중앙 산책로 (동서)
  flatMesh(new THREE.PlaneGeometry(PARK.maxX - PARK.minX, 12), MAT.path, 0, 0.05, 0);

  // 남북 교차로 3개
  for (const x of [-110, 0, 110]) {
    flatMesh(new THREE.PlaneGeometry(9, PARK.maxZ - PARK.minZ), MAT.path, x, 0.04, 0);
  }

  // 문화의 마당 (포장 광장)
  flatMesh(
    new THREE.PlaneGeometry(PLAZA.maxX - PLAZA.minX, PLAZA.maxZ - PLAZA.minZ),
    MAT.plaza,
    (PLAZA.minX + PLAZA.maxX) / 2, 0.06, (PLAZA.minZ + PLAZA.maxZ) / 2
  );

  // 자전거 도로: 타원 링
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, BIKE.rx, BIKE.rz, 0, Math.PI * 2);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, BIKE.rx - BIKE.width, BIKE.rz - BIKE.width, 0, Math.PI * 2);
  shape.holes.push(hole);
  flatMesh(new THREE.ShapeGeometry(shape, 64), MAT.bike, 0, 0.07, 0);
}

let waterMesh;
function buildPond() {
  // 연못 테두리 + 수면
  const rim = new THREE.CircleGeometry(1, 48);
  flatMesh(rim, MAT.pondRim, POND.x, 0.08, POND.z).scale.set(POND.rx + 2.5, POND.rz + 2.5, 1);
  waterMesh = flatMesh(new THREE.CircleGeometry(1, 48), MAT.water, POND.x, 0.12, POND.z);
  waterMesh.scale.set(POND.rx, POND.rz, 1);

  // 연못 안 바위 몇 개
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + Math.random() * 0.6), MAT.stone);
    rock.position.set(
      POND.x + Math.cos(a) * POND.rx * 0.85,
      0.3,
      POND.z + Math.sin(a) * POND.rz * 0.85
    );
    rock.castShadow = true;
    scene.add(rock);
  }
}

// --- 나무 (인스턴싱) ---------------------------------------------------------

function insidePond(x, z, pad = 0) {
  const dx = (x - POND.x) / (POND.rx + pad);
  const dz = (z - POND.z) / (POND.rz + pad);
  return dx * dx + dz * dz < 1;
}

function insidePlaza(x, z, pad = 0) {
  return x > PLAZA.minX - pad && x < PLAZA.maxX + pad &&
         z > PLAZA.minZ - pad && z < PLAZA.maxZ + pad;
}

function onPath(x, z) {
  if (Math.abs(z) < 8) return true;                       // 중앙 산책로
  for (const px of [-110, 0, 110]) if (Math.abs(x - px) < 7) return true; // 교차로
  const e = (x / BIKE.rx) ** 2 + (z / BIKE.rz) ** 2;       // 자전거 도로
  if (e > 0.82 && e < 1.12) return true;
  return false;
}

function buildTrees() {
  const spots = { broad: [], pine: [], cherry: [] };

  // 벚나무: 자전거 도로 안쪽을 따라 줄지어 심는다
  const cherryCount = 64;
  for (let i = 0; i < cherryCount; i++) {
    const a = (i / cherryCount) * Math.PI * 2;
    const x = Math.cos(a) * (BIKE.rx - 14);
    const z = Math.sin(a) * (BIKE.rz - 14) * (BIKE.rz / BIKE.rx) * (BIKE.rx / BIKE.rz); // 타원 유지
    const px = Math.cos(a) * (BIKE.rx - 14);
    const pz = Math.sin(a) * (BIKE.rz - 12);
    if (insidePond(px, pz, 4) || insidePlaza(px, pz, 3) || Math.abs(pz) < 8) continue;
    spots.cherry.push([px, pz, 0.9 + Math.random() * 0.3]);
  }

  // 일반 활엽수 / 소나무: 랜덤 산포
  let guard = 0;
  while (spots.broad.length + spots.pine.length < 260 && guard++ < 4000) {
    const x = PARK.minX + 8 + Math.random() * (PARK.maxX - PARK.minX - 16);
    const z = PARK.minZ + 8 + Math.random() * (PARK.maxZ - PARK.minZ - 16);
    if (onPath(x, z) || insidePond(x, z, 6) || insidePlaza(x, z, 4)) continue;
    // 명소 주변은 비워 둔다 (세종대왕 동상, 육각정)
    if (Math.hypot(x - 0, z - -22) < 14 || Math.hypot(x - 52, z - 48) < 13) continue;
    const s = 0.75 + Math.random() * 0.6;
    // 동쪽 끝은 한국전통의 숲: 소나무 위주
    if (x > 130 || Math.random() < 0.25) spots.pine.push([x, z, s]);
    else spots.broad.push([x, z, s]);
  }

  const dummy = new THREE.Object3D();

  function makeInstanced(geo, mat, list, yOf, castShadow = true) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, z, s], i) => {
      dummy.position.set(x, yOf(s), z);
      dummy.scale.setScalar(s);
      dummy.rotation.y = Math.random() * Math.PI * 2;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.castShadow = castShadow;
    mesh.receiveShadow = false;
    scene.add(mesh);
    return mesh;
  }

  const all = [...spots.broad, ...spots.pine, ...spots.cherry];

  // 줄기 (모든 나무 공통)
  makeInstanced(new THREE.CylinderGeometry(0.25, 0.4, 3.4, 7), MAT.trunk, all, s => 1.7 * s);

  // 수관
  makeInstanced(new THREE.SphereGeometry(2.4, 10, 8), MAT.leaf, spots.broad, s => 4.6 * s);
  makeInstanced(new THREE.ConeGeometry(2.1, 5.5, 9), MAT.pine, spots.pine, s => 5.2 * s);
  makeInstanced(new THREE.SphereGeometry(2.7, 10, 8), MAT.cherry, spots.cherry, s => 4.4 * s);

  for (const [x, z] of all) addCollider(x, z, 0.7);
  return spots.cherry; // 꽃잎 파티클 위치용
}

// --- 명소들 -----------------------------------------------------------------

function buildSejongStatue() {
  // 세종대왕 동상 (잔디마당)
  const g = new THREE.Group();

  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 6), MAT.stone);
  pedestal.position.y = 1.1;

  const throne = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.4, 2.6), MAT.gold);
  throne.position.y = 3.3;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.7, 2.6, 10), MAT.gold);
  body.position.set(0, 4.6, 0.3);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), MAT.gold);
  head.position.set(0, 6.3, 0.3);

  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.6, 10), MAT.gold);
  crown.position.set(0, 7.0, 0.3);

  // 양팔 (책을 든 모습)
  const book = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.1), MAT.gold);
  book.position.set(0, 4.6, 1.5);

  g.add(pedestal, throne, body, head, crown, book);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(0, 0, -22);
  g.rotation.y = 0;
  scene.add(g);
  addCollider(0, -22, 4);
}

function buildC47Plane() {
  // C-47 비행기 전시 (문화의 마당)
  const g = new THREE.Group();

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 13, 14), MAT.planeBody);
  fuselage.rotation.z = Math.PI / 2;
  fuselage.position.y = 2.4;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(1.3, 12, 10), MAT.planeBody);
  nose.position.set(6.5, 2.4, 0);

  const tailUp = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.3), MAT.planeBody);
  tailUp.position.set(-6.2, 4.2, 0);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2, 0.25, 5.5), MAT.planeBody);
  tailWing.position.set(-6, 3.4, 0);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.35, 20), MAT.planeBody);
  wing.position.set(1, 2.2, 0);

  for (const side of [-1, 1]) {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.6, 10), MAT.planeBody);
    engine.rotation.z = Math.PI / 2;
    engine.position.set(2.2, 2.1, side * 4.5);
    g.add(engine);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3.4, 0.4), MAT.lampPole);
    prop.position.set(3.6, 2.1, side * 4.5);
    g.add(prop);
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 6), MAT.lampPole);
    strut.position.set(2.2, 0.9, side * 4.5);
    g.add(strut);
  }

  const tailStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.4, 6), MAT.lampPole);
  tailStrut.position.set(-5.5, 0.9, 0);

  g.add(fuselage, nose, tailUp, tailWing, wing, tailStrut);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  g.position.set(-165, 0, 30);
  g.rotation.y = -0.5;
  scene.add(g);
  addCollider(-165, 30, 8);
}

function buildPavilion() {
  // 육각정 (연못가)
  const g = new THREE.Group();

  const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.8, 6), MAT.stone);
  base.position.y = 0.4;
  g.add(base);

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 3.6, 8), MAT.redPost);
    post.position.set(Math.cos(a) * 4, 2.6, Math.sin(a) * 4);
    g.add(post);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.6, 6), MAT.roof);
  roof.position.y = 5.6;
  const roofTop = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), MAT.woodDark);
  roofTop.position.y = 7;
  g.add(roof, roofTop);

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.position.set(52, 0, 48);
  scene.add(g);

  // 기둥 충돌체만 두어 정자 안으로 걸어 들어갈 수 있게 한다
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    addCollider(52 + Math.cos(a) * 4, 48 + Math.sin(a) * 4, 0.4);
  }
}

function buildFurniture() {
  // 가로등: 중앙 산책로 양쪽
  const lampGeo = new THREE.CylinderGeometry(0.09, 0.13, 4.4, 8);
  const bulbGeo = new THREE.SphereGeometry(0.32, 10, 8);
  for (let x = -195; x <= 195; x += 30) {
    for (const side of [-1, 1]) {
      const z = side * 7.5;
      const pole = new THREE.Mesh(lampGeo, MAT.lampPole);
      pole.position.set(x, 2.2, z);
      pole.castShadow = true;
      const bulb = new THREE.Mesh(bulbGeo, MAT.lampGlow);
      bulb.position.set(x, 4.5, z);
      scene.add(pole, bulb);
      addCollider(x, z, 0.35);
    }
  }

  // 벤치: 산책로 옆
  const seatGeo = new THREE.BoxGeometry(2.2, 0.12, 0.6);
  const legGeo = new THREE.BoxGeometry(0.12, 0.5, 0.6);
  const backGeo = new THREE.BoxGeometry(2.2, 0.6, 0.1);
  for (let x = -180; x <= 180; x += 45) {
    for (const side of [-1, 1]) {
      const z = side * 9.5;
      const bench = new THREE.Group();
      const seat = new THREE.Mesh(seatGeo, MAT.woodDark); seat.position.y = 0.5;
      const back = new THREE.Mesh(backGeo, MAT.woodDark); back.position.set(0, 0.85, side * 0.25);
      const l1 = new THREE.Mesh(legGeo, MAT.lampPole); l1.position.set(-0.9, 0.25, 0);
      const l2 = new THREE.Mesh(legGeo, MAT.lampPole); l2.position.set(0.9, 0.25, 0);
      bench.add(seat, back, l1, l2);
      bench.position.set(x + 10, 0, z);
      bench.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(bench);
      addCollider(x + 10, z, 1.1);
    }
  }
}

function buildSurroundings() {
  // 공원 둘레 낮은 생울타리
  const hedgeH = 1.1;
  const hx = new THREE.BoxGeometry(PARK.maxX - PARK.minX + 8, hedgeH, 1.6);
  const hz = new THREE.BoxGeometry(1.6, hedgeH, PARK.maxZ - PARK.minZ + 8);
  for (const [geo, x, z] of [
    [hx, 0, PARK.minZ - 2], [hx, 0, PARK.maxZ + 2],
    [hz, PARK.minX - 2, 0], [hz, PARK.maxX + 2, 0],
  ]) {
    const hedge = new THREE.Mesh(geo, MAT.hedge);
    hedge.position.set(x, hedgeH / 2, z);
    hedge.receiveShadow = true;
    scene.add(hedge);
  }

  // 여의도 스카이라인: 공원 밖 빌딩들
  const rng = mulberry32(20260610);
  for (let i = 0; i < 46; i++) {
    const w = 14 + rng() * 22;
    const h = 25 + rng() * 75;
    const d = 14 + rng() * 22;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      rng() < 0.5 ? MAT.building : MAT.building2
    );
    const side = i % 2 === 0 ? 1 : -1;
    b.position.set(
      -300 + rng() * 600,
      h / 2,
      side * (130 + rng() * 90)
    );
    scene.add(b);
  }
  // 양끝에도 몇 채
  for (let i = 0; i < 10; i++) {
    const h = 30 + rng() * 60;
    const b = new THREE.Mesh(new THREE.BoxGeometry(20 + rng() * 15, h, 20 + rng() * 15), MAT.building);
    b.position.set((i < 5 ? 1 : -1) * (280 + rng() * 80), h / 2, -100 + rng() * 200);
    scene.add(b);
  }

  // 63빌딩 (금색 마천루)
  const b63 = new THREE.Mesh(new THREE.BoxGeometry(26, 150, 14), MAT.gold63);
  b63.position.set(330, 75, -150);
  scene.add(b63);

  // LG 트윈타워 느낌의 쌍둥이 빌딩
  for (const dz of [-16, 16]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(18, 95, 18), MAT.building2);
    t.position.set(-310, 47.5, 140 + dz);
    scene.add(t);
  }

  // 구름
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(rng() * 3);
    for (let j = 0; j < n; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(8 + rng() * 7, 8, 6), MAT.cloud);
      puff.position.set(j * 10 - n * 5, rng() * 3, rng() * 6 - 3);
      puff.scale.y = 0.55;
      cloud.add(puff);
    }
    cloud.position.set(-400 + rng() * 800, 120 + rng() * 50, -350 + rng() * 700);
    scene.add(cloud);
  }
}

// 시드 고정 난수 (스카이라인이 매번 같도록)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 오리 (연못) -------------------------------------------------------------

const ducks = [];
function buildDucks() {
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), MAT.duck);
    body.scale.set(1.3, 0.8, 1);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), MAT.duck);
    head.position.set(0.5, 0.42, 0);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 6), MAT.beak);
    beak.rotation.z = -Math.PI / 2;
    beak.position.set(0.78, 0.4, 0);
    g.add(body, head, beak);
    scene.add(g);
    ducks.push({ g, angle: (i / 5) * Math.PI * 2, r: 0.3 + Math.random() * 0.5, speed: 0.1 + Math.random() * 0.15 });
  }
}

function updateDucks(t) {
  for (const d of ducks) {
    const a = d.angle + t * d.speed;
    const x = POND.x + Math.cos(a) * POND.rx * d.r;
    const z = POND.z + Math.sin(a) * POND.rz * d.r;
    d.g.position.set(x, 0.25 + Math.sin(t * 2 + d.angle) * 0.04, z);
    d.g.rotation.y = -a + Math.PI / 2 + Math.PI; // 진행 방향
  }
}

// --- 벚꽃 잎 파티클 -----------------------------------------------------------

let petals, petalData;
function buildPetals(cherrySpots) {
  if (cherrySpots.length === 0) return;
  const COUNT = 500;
  const pos = new Float32Array(COUNT * 3);
  petalData = [];
  for (let i = 0; i < COUNT; i++) {
    const [cx, cz] = cherrySpots[Math.floor(Math.random() * cherrySpots.length)];
    const x = cx + (Math.random() - 0.5) * 14;
    const z = cz + (Math.random() - 0.5) * 14;
    const y = Math.random() * 8;
    pos.set([x, y, z], i * 3);
    petalData.push({ fall: 0.4 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2, baseX: x });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  petals = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xf7c6da, size: 0.18, sizeAttenuation: true }));
  scene.add(petals);
}

function updatePetals(dt, t) {
  if (!petals) return;
  const pos = petals.geometry.attributes.position;
  for (let i = 0; i < petalData.length; i++) {
    const p = petalData[i];
    let y = pos.getY(i) - p.fall * dt;
    if (y < 0) y = 7 + Math.random() * 2;
    pos.setY(i, y);
    pos.setX(i, p.baseX + Math.sin(t * 0.8 + p.phase) * 1.2);
  }
  pos.needsUpdate = true;
}

// --- 조립 -------------------------------------------------------------------

buildGround();
buildPaths();
buildPond();
const cherrySpots = buildTrees();
buildSejongStatue();
buildC47Plane();
buildPavilion();
buildFurniture();
buildSurroundings();
buildDucks();
buildPetals(cherrySpots);

// --- 조작 -------------------------------------------------------------------

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const zoneEl = document.getElementById('zone');
const staminaFill = document.getElementById('staminaFill');
const hintEl = document.getElementById('hint');

overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => { overlay.style.display = 'none'; hud.style.display = 'block'; });
controls.addEventListener('unlock', () => { overlay.style.display = 'flex'; hud.style.display = 'none'; });

const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

const player = {
  velY: 0,
  onGround: true,
  stamina: 100,
  exhausted: false,
  bobPhase: 0,
};

function currentZone(x, z) {
  if (insidePond(x, z, 14)) return '생태연못 · 육각정';
  if (insidePlaza(x, z, 6)) return '문화의 마당';
  if (x > 125) return '한국전통의 숲';
  if (Math.abs(x) < 70 && Math.abs(z) < 60) return '잔디마당';
  const e = (x / BIKE.rx) ** 2 + (z / BIKE.rz) ** 2;
  if (e > 0.8) return '자전거 도로 · 벚꽃길';
  return '여의도 공원 산책로';
}

let lastZone = '';
function updateHUD(x, z) {
  const zone = currentZone(x, z);
  if (zone !== lastZone) { zoneEl.textContent = zone; lastZone = zone; }
  staminaFill.style.width = `${player.stamina}%`;
  staminaFill.classList.toggle('tired', player.exhausted);
}

function resolveCollisions(obj) {
  // 원형 충돌체 밀어내기
  for (const c of colliders) {
    const dx = obj.position.x - c.x;
    const dz = obj.position.z - c.z;
    const distSq = dx * dx + dz * dz;
    const minDist = c.r + 0.5;
    if (distSq < minDist * minDist && distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      obj.position.x = c.x + (dx / dist) * minDist;
      obj.position.z = c.z + (dz / dist) * minDist;
    }
  }

  // 연못에는 들어갈 수 없다
  const pad = 1.5;
  const ex = (obj.position.x - POND.x) / (POND.rx + pad);
  const ez = (obj.position.z - POND.z) / (POND.rz + pad);
  const e = ex * ex + ez * ez;
  if (e < 1) {
    const len = Math.sqrt(e) || 1e-4;
    obj.position.x = POND.x + (ex / len) * (POND.rx + pad);
    obj.position.z = POND.z + (ez / len) * (POND.rz + pad);
  }

  // 공원 경계
  obj.position.x = THREE.MathUtils.clamp(obj.position.x, PARK.minX + 2, PARK.maxX - 2);
  obj.position.z = THREE.MathUtils.clamp(obj.position.z, PARK.minZ + 2, PARK.maxZ - 2);
}

const fwd = new THREE.Vector3();
const right = new THREE.Vector3();
const moveDir = new THREE.Vector3();

function updatePlayer(dt) {
  const obj = controls.getObject();

  // 이동 입력
  moveDir.set(0, 0, 0);
  camera.getWorldDirection(fwd);
  fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, camera.up).normalize();
  if (keys['KeyW']) moveDir.add(fwd);
  if (keys['KeyS']) moveDir.sub(fwd);
  if (keys['KeyD']) moveDir.add(right);
  if (keys['KeyA']) moveDir.sub(right);
  const moving = moveDir.lengthSq() > 0;
  if (moving) moveDir.normalize();

  // 달리기 + 스태미나
  const wantsRun = (keys['ShiftLeft'] || keys['ShiftRight']) && moving;
  if (player.exhausted && player.stamina > 25) player.exhausted = false;
  const running = wantsRun && !player.exhausted && player.stamina > 0;
  if (running) {
    player.stamina = Math.max(0, player.stamina - 22 * dt);
    if (player.stamina <= 0) player.exhausted = true;
  } else {
    player.stamina = Math.min(100, player.stamina + 14 * dt);
  }
  const speed = running ? RUN_SPEED : WALK_SPEED;

  // 수평 이동
  obj.position.addScaledVector(moveDir, speed * dt);

  // 점프 / 중력
  if (keys['Space'] && player.onGround) {
    player.velY = JUMP_SPEED;
    player.onGround = false;
  }
  player.velY -= GRAVITY * dt;
  obj.position.y += player.velY * dt;
  if (obj.position.y <= EYE_HEIGHT) {
    obj.position.y = EYE_HEIGHT;
    player.velY = 0;
    player.onGround = true;
  }

  resolveCollisions(obj);

  // 머리 흔들림 (걸을 때만)
  if (moving && player.onGround) {
    player.bobPhase += dt * (running ? 13 : 8);
    obj.position.y = EYE_HEIGHT + Math.sin(player.bobPhase) * (running ? 0.07 : 0.04);
  }

  // 달릴 때 시야각 살짝 확대
  const targetFov = running ? 78 : 70;
  camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 8);
  camera.updateProjectionMatrix();

  // 태양(그림자 카메라)이 플레이어를 따라다닌다
  sun.position.set(obj.position.x + 60, 90, obj.position.z + 40);
  sun.target.position.set(obj.position.x, 0, obj.position.z);

  updateHUD(obj.position.x, obj.position.z);

  if (running && hintEl.style.display !== 'none') hintEl.style.display = 'none';
}

// --- 루프 -------------------------------------------------------------------

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// 시작 위치 기준으로 HUD 초기화
updateHUD(camera.position.x, camera.position.z);

// 개발/검증용 핸들
window.__game = { scene, camera, controls, renderer };

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (controls.isLocked) updatePlayer(dt);

  // 잔잔한 수면
  if (waterMesh) {
    waterMesh.position.y = 0.12 + Math.sin(t * 1.2) * 0.015;
    waterMesh.material.color.setHSL(0.55, 0.45, 0.42 + Math.sin(t * 0.7) * 0.02);
  }
  updateDucks(t);
  updatePetals(dt, t);

  renderer.render(scene, camera);
}
animate();
