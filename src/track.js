import * as THREE from 'three';

export const LANE_COUNT = 4;
export const LANE_WIDTH = 0.048;   // m — 1:64 다이캐스트 트랙 레인 폭
const WALL_T = 0.012;              // 측벽 두께
const WALL_H = 0.02;               // 측벽 높이
const DIV_H = 0.009;               // 레인 디바이더 높이
const HALF_W = (LANE_COUNT * LANE_WIDTH) / 2 + WALL_T;

// 산악 다운힐 코스 컨트롤 포인트 [x, y(높이), z] — 낙차 약 2.55m / 경로 약 27m
// 초반 급경사 슈트 → 우측 스위퍼 → 좌측 헤어핀 → 재상승 구간 없는 연속 다운힐 →
// 크레스트 점프(z≈7.6) → 급강하 착지 → 평지 피니시 런아웃
const CTRL = [
  [0.00, 2.60, 0.00],
  [0.00, 2.38, 1.20],
  [0.30, 2.20, 2.60],
  [1.20, 2.05, 3.80],
  [2.50, 1.92, 4.30],
  [3.70, 1.78, 3.90],
  [4.50, 1.62, 2.90],
  [4.60, 1.46, 1.80],
  [3.90, 1.31, 0.90],
  [2.80, 1.17, 0.60],
  [1.80, 1.04, 1.00],
  [1.30, 0.91, 2.10],
  [1.20, 0.79, 3.40],
  [1.60, 0.67, 4.60],
  [2.60, 0.55, 5.40],
  [3.40, 0.44, 6.40],
  [3.55, 0.42, 7.20],
  [3.62, 0.42, 7.55],
  [3.62, 0.30, 7.95],
  [3.55, 0.10, 8.70],
  [3.50, 0.06, 9.60],
  [3.42, 0.05, 11.00],
  [3.40, 0.05, 12.60],
  [3.40, 0.05, 14.40],
];

const N_SAMPLES = 1500;
const UP = new THREE.Vector3(0, 1, 0);

function boxSmooth(arr, radius) {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, n = 0;
    for (let j = -radius; j <= radius; j++) {
      const k = i + j;
      if (k >= 0 && k < arr.length) { sum += arr[k]; n++; }
    }
    out[i] = sum / n;
  }
  return out;
}

export class Track {
  constructor() {
    this.curve = new THREE.CatmullRomCurve3(
      CTRL.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      false, 'centripetal', 0.5
    );
    this.curve.arcLengthDivisions = 3000;
    this._buildCenter();
    this._buildLanes();
  }

  _buildCenter() {
    const N = N_SAMPLES;
    this.center = { pos: [], fwd: [], right: [] };
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const pos = this.curve.getPointAt(t);
      const fwd = this.curve.getTangentAt(t).normalize();
      // 수평 횡방향 벡터 (측벽이 차를 가두므로 레인 오프셋은 수평면에서)
      const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();
      if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
      this.center.pos.push(pos);
      this.center.fwd.push(fwd);
      this.center.right.push(right);
    }
  }

  _buildLanes() {
    this.lanes = [];
    for (let l = 0; l < LANE_COUNT; l++) {
      const offset = (l - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
      const pts = this.center.pos.map((p, i) =>
        p.clone().addScaledVector(this.center.right[i], offset)
      );
      const n = pts.length;
      const cum = new Float32Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + pts[i].distanceTo(pts[i - 1]);

      // 경사 dy/ds, 수평 헤딩, 곡률
      const dyds = new Float32Array(n);
      const heading = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        const ds = Math.max(1e-6, cum[Math.min(n - 1, i + 1)] - cum[Math.max(0, i - 1)]);
        dyds[i] = (b.y - a.y) / ds;
        heading[i] = Math.atan2(b.x - a.x, b.z - a.z);
      }
      const kh = new Float32Array(n);   // 수평 곡률 (signed)
      const kv = new Float32Array(n);   // 수직 곡률 (crest < 0)
      const slopeAng = new Float32Array(n);
      for (let i = 0; i < n; i++) slopeAng[i] = Math.asin(Math.max(-1, Math.min(1, dyds[i])));
      for (let i = 0; i < n; i++) {
        const i0 = Math.max(0, i - 2), i1 = Math.min(n - 1, i + 2);
        const ds = Math.max(1e-6, cum[i1] - cum[i0]);
        let dh = heading[i1] - heading[i0];
        while (dh > Math.PI) dh -= 2 * Math.PI;
        while (dh < -Math.PI) dh += 2 * Math.PI;
        kh[i] = dh / ds;
        kv[i] = (slopeAng[i1] - slopeAng[i0]) / ds;
      }
      this.lanes.push({
        offset, pts, cum,
        dyds: boxSmooth(dyds, 3),
        kh: boxSmooth(kh, 4),
        kv: boxSmooth(kv, 4),
        total: cum[n - 1],
      });
    }

    // 피니시 라인 / 체크포인트: 중앙 샘플 인덱스 기준 (전 레인 동일 게이트 통과)
    const cum0 = this.lanes[0].cum; // 인덱스 공유
    this.finishIdx = this._idxAtCenterFrac(0.925);
    this.cpIdx = [0.25, 0.5, 0.75].map((f) => this._idxAtCenterFrac(f * 0.925));
    for (const lane of this.lanes) {
      lane.finishS = lane.cum[this.finishIdx];
      lane.cpS = this.cpIdx.map((i) => lane.cum[i]);
    }
  }

  _idxAtCenterFrac(frac) {
    // 중앙(레인 평균) 누적 길이 기준 인덱스
    const lane = this.lanes[Math.floor(LANE_COUNT / 2)];
    const target = lane.total * frac;
    let lo = 0, hi = lane.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (lane.cum[mid] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  // s(호 길이) → 샘플 보간. hint 인덱스로 순차 탐색 가속.
  laneSample(laneIdx, s, hintObj) {
    const lane = this.lanes[laneIdx];
    const cum = lane.cum, n = cum.length;
    let i = hintObj ? hintObj.idx : 0;
    if (i < 0 || i >= n - 1 || cum[i] > s) i = 0;
    while (i < n - 2 && cum[i + 1] < s) i++;
    if (hintObj) hintObj.idx = i;
    const seg = Math.max(1e-9, cum[i + 1] - cum[i]);
    const f = Math.max(0, Math.min(1, (s - cum[i]) / seg));
    return {
      i, f,
      dyds: lane.dyds[i] * (1 - f) + lane.dyds[i + 1] * f,
      kh: lane.kh[i] * (1 - f) + lane.kh[i + 1] * f,
      kv: lane.kv[i] * (1 - f) + lane.kv[i + 1] * f,
    };
  }

  lanePoint(laneIdx, s, hintObj, outPos, outFwd) {
    const lane = this.lanes[laneIdx];
    const smp = this.laneSample(laneIdx, s, hintObj);
    const a = lane.pts[smp.i], b = lane.pts[smp.i + 1];
    outPos.lerpVectors(a, b, smp.f);
    const i2 = Math.min(lane.pts.length - 1, smp.i + 2);
    outFwd.subVectors(lane.pts[i2], lane.pts[Math.max(0, smp.i - 1)]).normalize();
    return smp;
  }

  // 차량 트랜스폼 계산 (라이브/리플레이 공용) — alt: 트랙면 위 높이(점프), roll/pitch 연출 포함
  placeCar(obj, laneIdx, s, alt, v, airPitch) {
    const smp = this.lanePoint(laneIdx, s, obj.userData.hint || (obj.userData.hint = { idx: 0 }),
      _pos, _fwd);
    _right.set(_fwd.z, 0, -_fwd.x).normalize();
    _up.crossVectors(_fwd, _right).normalize();
    if (_up.y < 0) { _up.negate(); _right.negate(); }
    _pos.addScaledVector(UP, alt);
    obj.position.copy(_pos);
    // 롤: 코너 원심력 연출(작게), 피치: 비행 중 기수 변화
    const roll = Math.max(-0.12, Math.min(0.12, -smp.kh * v * v * 0.012));
    _m.makeBasis(_right, _up, _fwd);
    obj.quaternion.setFromRotationMatrix(_m);
    if (roll) obj.rotateZ(roll);
    if (airPitch) obj.rotateX(-airPitch);
    return smp;
  }

  /* ---------------- 메시 생성 ---------------- */

  buildMesh(scene, terrainHeightFn) {
    const group = new THREE.Group();

    // 단면 프로파일 (lateral, height) — 4레인 데크 + 측벽 + 디바이더 + 바닥
    const prof = [];
    prof.push([-HALF_W, WALL_H], [-HALF_W + WALL_T, WALL_H], [-HALF_W + WALL_T, 0]);
    const bounds = [-LANE_WIDTH, 0, LANE_WIDTH];
    for (const b of bounds) {
      prof.push([b - 0.0035, 0], [b - 0.0035, DIV_H], [b + 0.0035, DIV_H], [b + 0.0035, 0]);
    }
    prof.push([HALF_W - WALL_T, 0], [HALF_W - WALL_T, WALL_H], [HALF_W, WALL_H]);
    prof.push([HALF_W, -0.016], [-HALF_W, -0.016]); // 바닥면

    const step = 3; // 샘플 3개당 1링
    const rings = [];
    for (let i = 0; i <= N_SAMPLES; i += step) rings.push(i);
    const P = prof.length;
    const positions = new Float32Array(rings.length * P * 3);
    const indices = [];
    for (let r = 0; r < rings.length; r++) {
      const i = rings[r];
      const c = this.center.pos[i], right = this.center.right[i], fwd = this.center.fwd[i];
      _up.crossVectors(fwd, right).normalize();
      if (_up.y < 0) _up.negate();
      for (let j = 0; j < P; j++) {
        const [lat, h] = prof[j];
        const idx = (r * P + j) * 3;
        positions[idx] = c.x + right.x * lat + _up.x * h;
        positions[idx + 1] = c.y + right.y * lat + _up.y * h;
        positions[idx + 2] = c.z + right.z * lat + _up.z * h;
      }
      if (r > 0) {
        for (let j = 0; j < P; j++) {
          const j2 = (j + 1) % P;
          const a = (r - 1) * P + j, b = (r - 1) * P + j2, cc = r * P + j2, d = r * P + j;
          indices.push(a, b, cc, a, cc, d);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.trackMat = new THREE.MeshStandardMaterial({
      color: 0xff6d00, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, this.trackMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // 지지 기둥
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a6d4a, roughness: 0.9 });
    const postGeo = new THREE.CylinderGeometry(0.014, 0.017, 1, 8);
    for (let i = 30; i < N_SAMPLES; i += 55) {
      const c = this.center.pos[i];
      const ground = terrainHeightFn ? terrainHeightFn(c.x, c.z) : 0;
      const top = c.y - 0.016;
      if (top - ground < 0.05) continue;
      const h = top - ground;
      const post = new THREE.Mesh(postGeo, postMat);
      post.scale.y = h;
      post.position.set(c.x, ground + h / 2, c.z);
      post.castShadow = true;
      group.add(post);
    }

    group.add(this._buildGate());
    group.add(this._buildFinish());
    scene.add(group);
    this.meshGroup = group;
    return group;
  }

  _buildGate() {
    const g = new THREE.Group();
    const i = 8; // 출발 게이트 위치 샘플
    const c = this.center.pos[i], right = this.center.right[i];
    const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
    const postGeo = new THREE.BoxGeometry(0.015, 0.09, 0.015);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, mat);
      p.position.copy(c).addScaledVector(right, side * (HALF_W + 0.012));
      p.position.y += 0.045;
      g.add(p);
    }
    // 게이트 바 (릴리즈 시 회전)
    const barMat = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.4 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(HALF_W * 2 + 0.02, 0.008, 0.008), barMat);
    const pivot = new THREE.Group();
    pivot.position.copy(c).addScaledVector(right, -(HALF_W + 0.012));
    pivot.position.y += 0.028;
    bar.position.x = HALF_W + 0.01; // 피벗 기준 오른쪽으로
    // pivot을 트랙 방향에 정렬
    const fwd = this.center.fwd[i];
    _m.makeBasis(right, UP, new THREE.Vector3(fwd.x, 0, fwd.z).normalize());
    pivot.quaternion.setFromRotationMatrix(_m);
    pivot.add(bar);
    g.add(pivot);
    this.gatePivot = pivot;
    return g;
  }

  setGate(open01) {
    if (this.gatePivot) this.gatePivot.rotation.z = open01 * Math.PI * 0.45;
  }

  _buildFinish() {
    const g = new THREE.Group();
    const i = this.finishIdx;
    const c = this.center.pos[i], right = this.center.right[i];
    const mat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.5 });
    const postGeo = new THREE.BoxGeometry(0.012, 0.13, 0.012);
    for (const side of [-1, 1]) {
      const p = new THREE.Mesh(postGeo, mat);
      p.position.copy(c).addScaledVector(right, side * (HALF_W + 0.01));
      p.position.y += 0.065;
      g.add(p);
    }
    // 체커 배너
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 32;
    const ctx = cv.getContext('2d');
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
    const tex = new THREE.CanvasTexture(cv);
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF_W * 2 + 0.02, 0.035),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
    );
    banner.position.copy(c);
    banner.position.y += 0.115;
    const fwd = this.center.fwd[i];
    banner.lookAt(banner.position.clone().add(new THREE.Vector3(fwd.x, 0, fwd.z)));
    g.add(banner);
    return g;
  }

  // 중계 카메라 포인트: 커브 바깥쪽에 배치, s 구간 담당
  buildBroadcastCams() {
    const cams = [];
    const lane = this.lanes[1];
    const stepS = 2.6;
    for (let s = 1.0; s < lane.total; s += stepS) {
      let i = 0;
      while (i < lane.cum.length - 1 && lane.cum[i] < s) i++;
      const c = this.center.pos[i], right = this.center.right[i];
      const side = lane.kh[i] > 0.05 ? -1 : 1; // 커브 바깥쪽
      const pos = c.clone().addScaledVector(right, side * 0.75);
      pos.y += 0.38;
      cams.push({ pos, sStart: s - stepS * 0.55, sEnd: s + stepS * 0.55 });
    }
    return cams;
  }

  setWet(wet) {
    if (!this.trackMat) return;
    this.trackMat.roughness = wet ? 0.25 : 0.55;
    this.trackMat.color.set(wet ? 0xd85c00 : 0xff6d00);
  }
}

const _pos = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _m = new THREE.Matrix4();
