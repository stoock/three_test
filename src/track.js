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
    // 0..LANE_COUNT-1 = 클래식 트랙의 물리적 레인(디바이더로 분리됨)
    // LANE_COUNT = 마운틴 로드용 중앙선 기준 단일 주행로 — 로드에서는 레인이 칸막이가 아니라
    // 출발 위치일 뿐이므로, 모든 차가 같은 기준선 위에서 자기 라인을 그린다.
    for (let l = 0; l <= LANE_COUNT; l++) {
      const offset = l === LANE_COUNT ? 0 : (l - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
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

  // 차량이 레인 중앙 기준으로 움직일 수 있는 횡방향 범위 (m).
  // 클래식: 레인 디바이더 사이 = 좁음 / 마운틴 로드: 방호벽 사이 노면 전체 = 넓음.
  // 핸들이 없는 다이캐스트 카는 이 범위 끝(벽·디바이더)에 밀려 붙어 긁으며 코너를 돈다.
  lateralLimit(laneIdx, halfCarW = 0.016) {
    if (this.style === 'road' || laneIdx === LANE_COUNT) {
      const inner = HALF_W - 0.007;         // 방호벽 안쪽 면까지의 거리
      const off = this.lanes[laneIdx].offset;
      return { min: -inner - off + halfCarW, max: inner - off - halfCarW };
    }
    // 클래식: 자기 레인 폭 안에서만 (디바이더 반폭 0.0035)
    const half = Math.max(0.002, LANE_WIDTH / 2 - 0.0035 - halfCarW);
    return { min: -half, max: half };
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

  // 차량 트랜스폼 계산 (라이브/리플레이 공용)
  // opts: { airborne, vy(월드 수직속도), snap(스무딩 없이 즉시 배치) }
  // 접지 시 트랙 접선을 따르고, 비행 중엔 속도 벡터 자세(탄도 궤적) — 쿼터니언 슬럽으로
  // 발사/착지 순간의 급격한 자세 스냅을 흡수한다.
  placeCar(obj, laneIdx, s, alt, v, opts = {}) {
    const ud = obj.userData;
    const smp = this.lanePoint(laneIdx, s, ud.hint || (ud.hint = { idx: 0 }), _pos, _fwd);
    _pos.addScaledVector(UP, alt);
    // 횡 오프셋 (코너에서 벽으로 밀린 위치)
    if (opts.lat) {
      _right.set(_fwd.z, 0, -_fwd.x).normalize();
      _pos.addScaledVector(_right, opts.lat);
    }
    obj.position.copy(_pos);

    if (opts.airborne) {
      // 수평 전방 + 탄도 피치 (트랙 경사를 따르지 않는다)
      _fwd.y = 0; _fwd.normalize();
      _right.set(_fwd.z, 0, -_fwd.x).normalize();
      _up.set(0, 1, 0);
      _m.makeBasis(_right, _up, _fwd);
      _q.setFromRotationMatrix(_m);
      const pitch = Math.max(-0.55, Math.min(0.4,
        Math.atan2(opts.vy ?? 0, Math.max(0.4, v))));
      _q2.setFromAxisAngle(_X, -pitch);
      _q.multiply(_q2);
      if (opts.roll) { _q2.setFromAxisAngle(_Z, -opts.roll); _q.multiply(_q2); }
    } else {
      _right.set(_fwd.z, 0, -_fwd.x).normalize();
      _up.crossVectors(_fwd, _right).normalize();
      if (_up.y < 0) { _up.negate(); _right.negate(); }
      _m.makeBasis(_right, _up, _fwd);
      _q.setFromRotationMatrix(_m);
      // 물리에서 계산된 실제 차체 기울기 (전복 중이면 크게 넘어간다)
      const roll = opts.roll !== undefined
        ? -opts.roll
        : Math.max(-0.12, Math.min(0.12, -smp.kh * v * v * 0.012));
      if (roll) { _q2.setFromAxisAngle(_Z, roll); _q.multiply(_q2); }
      // 옆으로 미끄러지는 만큼 차체가 비스듬히 틀어진다 (벽을 긁을 때의 그 자세)
      const yaw = Math.max(-0.28, Math.min(0.28, Math.atan2(opts.latV || 0, Math.max(0.5, v))));
      if (yaw) { _q2.setFromAxisAngle(_Y, -yaw); _q.multiply(_q2); }
    }

    if (opts.snap || !ud.hasQ) {
      obj.quaternion.copy(_q);
      ud.hasQ = true;
    } else {
      obj.quaternion.slerp(_q, 0.22);
    }
    return smp;
  }

  /* ---------------- 메시 생성 ---------------- */

  buildMesh(scene, terrainHeightFn, style = 'classic') {
    this.style = style;
    if (this.meshGroup) {
      scene.remove(this.meshGroup);
      this.meshGroup.traverse((o) => {
        if (o.isMesh) {
          o.geometry.dispose();
          if (o.material.map) o.material.map.dispose();
          o.material.dispose();
        }
      });
    }
    const group = new THREE.Group();

    // 단면 프로파일 (lateral, height)
    let prof;
    if (style === 'road') {
      // 마운틴 로드: 아스팔트 노면 + 양측 콘크리트 방호벽 (디바이더 없음)
      prof = [
        [-HALF_W, 0.020], [-HALF_W + 0.007, 0.020], [-HALF_W + 0.007, 0],
        [HALF_W - 0.007, 0], [HALF_W - 0.007, 0.020], [HALF_W, 0.020],
        [HALF_W, -0.016], [-HALF_W, -0.016],
      ];
      this.trackMat = new THREE.MeshStandardMaterial({
        vertexColors: true, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide, envMapIntensity: 0.3,
      });
    } else {
      // 클래식: 4레인 오렌지 트랙 + 측벽 + 디바이더
      prof = [];
      prof.push([-HALF_W, WALL_H], [-HALF_W + WALL_T, WALL_H], [-HALF_W + WALL_T, 0]);
      for (const b of [-LANE_WIDTH, 0, LANE_WIDTH]) {
        prof.push([b - 0.0035, 0], [b - 0.0035, DIV_H], [b + 0.0035, DIV_H], [b + 0.0035, 0]);
      }
      prof.push([HALF_W - WALL_T, 0], [HALF_W - WALL_T, WALL_H], [HALF_W, WALL_H]);
      prof.push([HALF_W, -0.016], [-HALF_W, -0.016]);
      this.trackMat = new THREE.MeshStandardMaterial({
        color: 0xff6d00, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: 0.35,
      });
    }

    const step = 3; // 샘플 3개당 1링
    const rings = [];
    for (let i = 0; i <= N_SAMPLES; i += step) rings.push(i);
    this._rings = rings;
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
    if (style === 'road') {
      // 프로파일 포인트별 색: 방호벽=콘크리트, 노면=아스팔트, 하부=어두운 회색
      const ptColor = (j) => (j <= 1 || j === 4 || j === 5) ? [0.66, 0.68, 0.71]
        : (j === 2 || j === 3) ? [0.115, 0.12, 0.135] : [0.09, 0.085, 0.08];
      const colors = new Float32Array(rings.length * P * 3);
      for (let r = 0; r < rings.length; r++) {
        for (let j = 0; j < P; j++) {
          const [cr, cg, cb] = ptColor(j);
          const idx = (r * P + j) * 3;
          colors[idx] = cr; colors[idx + 1] = cg; colors[idx + 2] = cb;
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }
    const mesh = new THREE.Mesh(geo, this.trackMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    if (style === 'road') {
      // 중앙 황색 점선 + 양측 백색 실선
      group.add(this._buildLine(0, 0.0045, 0.0012, 0xd9a733, 5));
      group.add(this._buildLine(-(HALF_W - 0.011), 0.003, 0.0012, 0xc9ced2, 0));
      group.add(this._buildLine(HALF_W - 0.011, 0.003, 0.0012, 0xc9ced2, 0));
    }

    // 지지 기둥
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8a6d4a, roughness: 0.9, envMapIntensity: 0.2 });
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

  // 노면 위 라인 리본 — dashPeriod > 0 이면 점선
  _buildLine(lat, width, yOff, colorHex, dashPeriod) {
    const rings = this._rings;
    const positions = [];
    const indices = [];
    let vi = 0;
    for (let r = 0; r < rings.length - 1; r++) {
      if (dashPeriod > 0 && Math.floor(r / dashPeriod) % 2 === 1) continue;
      for (const rr of [r, r + 1]) {
        const i = rings[rr];
        const c = this.center.pos[i], right = this.center.right[i], fwd = this.center.fwd[i];
        _up.crossVectors(fwd, right).normalize();
        if (_up.y < 0) _up.negate();
        for (const side of [-1, 1]) {
          const l = lat + side * width / 2;
          positions.push(
            c.x + right.x * l + _up.x * yOff,
            c.y + right.y * l + _up.y * yOff,
            c.z + right.z * l + _up.z * yOff);
        }
      }
      indices.push(vi, vi + 1, vi + 3, vi, vi + 3, vi + 2);
      vi += 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: colorHex, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.3,
    }));
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
  buildBroadcastCams(terrainHeightFn) {
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
      // 카메라가 지형에 파묻히지 않도록 (평지 런아웃 구간에서 특히 중요)
      if (terrainHeightFn) {
        pos.y = Math.max(pos.y, terrainHeightFn(pos.x, pos.z) + 0.3);
      }
      cams.push({ pos, sStart: s - stepS * 0.55, sEnd: s + stepS * 0.55 });
    }
    return cams;
  }

  setWet(wet) {
    if (!this.trackMat) return;
    if (this.style === 'road') {
      this.trackMat.roughness = wet ? 0.45 : 0.92;
      this.trackMat.color.setScalar(wet ? 0.7 : 1);
    } else {
      this.trackMat.roughness = wet ? 0.25 : 0.55;
      this.trackMat.color.set(wet ? 0xd85c00 : 0xff6d00);
    }
  }
}

const _pos = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
