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
  [3.62, 0.30, 8.00],
  [3.58, 0.16, 8.80],
  [3.54, 0.085, 9.70],
  [3.50, 0.055, 10.70],
  [3.46, 0.05, 11.90],
  [3.43, 0.05, 13.20],
  [3.40, 0.05, 14.80],
];

const N_SAMPLES = 1500;
// 뱅크 설계 파라미터. FACTOR<1 이면 설계 속도에서도 아주 약간 바깥으로 밀리는
// '거의 균형' 상태가 되어, 매 주행의 미세한 속도차가 좌우 어느 쪽으로 흐를지를 가른다.
const BANK_FACTOR = 0.9;
const BANK_MAX = 1.05;   // 약 60°
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
      const khS = boxSmooth(kh, 4);
      const dydsS = boxSmooth(dyds, 3);
      this.lanes.push({
        offset, pts, cum,
        dyds: dydsS,
        kh: khS,
        kv: boxSmooth(kv, 4),
        bank: this._designBank(cum, dydsS, khS, n),
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

  // 뱅크(캔트) 설계 — 실제 트랙 설계와 같은 방식이다.
  // 먼저 기준 차량이 이 코스를 굴러갈 때의 속도 분포 v(s)를 구하고,
  // 각 지점을 "그 속도로 지나면 타이어 힘이 필요 없는" 각도로 기울인다.
  //   tan(φ) = v(s)²·κ(s) / g
  // 그 결과 기준 속도로 달리는 차는 노면 어디에도 머물 수 있는 *중립* 상태가 되고,
  // 조금이라도 빠르면 위로, 느리면 아래로 흐른다. 벽에 눌려 모든 차이가 지워지던
  // 구조가, 작은 차이가 갈라지는 구조로 바뀐다.
  _designBank(cum, dyds, kh, n) {
    // 기준 차량(85g·FTE 휠 상당)의 종방향 속도 분포를 한 번 적분해서 얻는다
    const CRR = 0.012, CDA_M = 0.0073, BEAR = 0.026;
    const v = new Float32Array(n);
    let sp = 0;
    for (let i = 1; i < n; i++) {
      const ds = Math.max(1e-6, cum[i] - cum[i - 1]);
      const slope = dyds[i];
      const cos = Math.sqrt(Math.max(0.05, 1 - slope * slope));
      const a = -9.81 * slope - (CRR * 9.81 * cos + BEAR + CDA_M * sp * sp);
      sp = Math.sqrt(Math.max(0.01, sp * sp + 2 * a * ds));
      v[i] = sp;
    }
    v[0] = v[1];
    const bank = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const ideal = Math.atan((v[i] * v[i] * Math.abs(kh[i])) / 9.81);
      bank[i] = Math.min(BANK_MAX, ideal * BANK_FACTOR) * Math.sign(kh[i] || 1);
    }
    return boxSmooth(bank, 14);
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
      bank: lane.bank[i] * (1 - f) + lane.bank[i + 1] * f,
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
    // 뱅크가 있으면 노면이 기울어져 있으므로, 횡오프셋만큼 높이도 함께 올라간다
    const bank = this.style === 'road' ? (smp.bank || 0) : 0;
    if (opts.lat) {
      _right.set(_fwd.z, 0, -_fwd.x).normalize();
      _pos.addScaledVector(_right, opts.lat);
      if (bank) _pos.y += -opts.lat * Math.tan(bank);
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
      // 노면 뱅크만큼 차도 함께 기울고, 거기에 물리에서 계산된 차체 기울기가 더해진다
      const roll = (opts.roll !== undefined
        ? -opts.roll
        : Math.max(-0.12, Math.min(0.12, -smp.kh * v * v * 0.012))) - bank;
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

  // 뱅크가 적용된 단면 기준틀 — 로드 코스에서는 노면 전체가 코너 바깥쪽으로 들린다.
  // 횡오프셋 lat 지점의 높이는 −lat·tan(bank) 이 되도록 right/up 을 진행축 둘레로 회전한다.
  _frame(i, out) {
    const c = this.center.pos[i], r0 = this.center.right[i], f = this.center.fwd[i];
    _up.crossVectors(f, r0).normalize();
    if (_up.y < 0) _up.negate();
    out.c = c;
    const phi = this.style === 'road' ? -this.lanes[LANE_COUNT].bank[i] : 0;
    if (phi) {
      const cs = Math.cos(phi), sn = Math.sin(phi);
      out.right = _rt.copy(r0).multiplyScalar(cs).addScaledVector(_up, sn).normalize();
      out.up = _upB.copy(_up).multiplyScalar(cs).addScaledVector(r0, -sn).normalize();
    } else {
      out.right = _rt.copy(r0);
      out.up = _upB.copy(_up);
    }
    return out;
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
      // 마운틴 로드 단면: 아스팔트 노면 + 양측 낮은 연석(갓길 경계).
      // 차를 가두는 벽 역할은 연석 위에 세우는 W빔 가드레일이 맡는다 (별도 메시).
      // 물리상의 벽면 위치는 |lat| = HALF_W − 0.007 로 이전과 동일하다.
      const EDGE = HALF_W - 0.007;   // 연석 안쪽 면 = 물리적 벽면
      prof = [
        [-HALF_W, -0.016], [-HALF_W, 0.0065], [-EDGE, 0.0065], [-EDGE, 0],
        [EDGE, 0], [EDGE, 0.0065], [HALF_W, 0.0065], [HALF_W, -0.016],
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
      const fr = this._frame(i, _fr);
      const c = fr.c, right = fr.right, up = fr.up;
      for (let j = 0; j < P; j++) {
        const [lat, h] = prof[j];
        const idx = (r * P + j) * 3;
        positions[idx] = c.x + right.x * lat + up.x * h;
        positions[idx + 1] = c.y + right.y * lat + up.y * h;
        positions[idx + 2] = c.z + right.z * lat + up.z * h;
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
      // 프로파일 포인트별 색: 연석=콘크리트, 노면=아스팔트, 하부=어두운 회색
      const ptColor = (j) => (j === 1 || j === 2 || j === 5 || j === 6) ? [0.62, 0.63, 0.65]
        : (j === 3 || j === 4) ? [0.105, 0.11, 0.125] : [0.075, 0.072, 0.068];
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
      // 중앙 황색 점선 + 양측 백색 실선(갓길 경계)
      group.add(this._buildLine(0, 0.0045, 0.0012, 0xd9a733, 5));
      group.add(this._buildLine(-(HALF_W - 0.018), 0.003, 0.0012, 0xc9ced2, 0));
      group.add(this._buildLine(HALF_W - 0.018, 0.003, 0.0012, 0xc9ced2, 0));
      // 갓길 럼블 스트립 (짧은 가로줄 반복)
      group.add(this._buildLine(-(HALF_W - 0.0125), 0.006, 0.0011, 0x9aa0a4, 1));
      group.add(this._buildLine(HALF_W - 0.0125, 0.006, 0.0011, 0x9aa0a4, 1));
      // 양측 W빔 가드레일 + 지주
      group.add(this._buildGuardrail(-(HALF_W - 0.007), -1, terrainHeightFn));
      group.add(this._buildGuardrail(HALF_W - 0.007, 1, terrainHeightFn));
      // 급커브 바깥쪽 시선유도 화살표 표지
      group.add(this._buildChevrons());
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
        const fr = this._frame(i, _fr);
        for (const side of [-1, 1]) {
          const l = lat + side * width / 2;
          positions.push(
            fr.c.x + fr.right.x * l + fr.up.x * yOff,
            fr.c.y + fr.right.y * l + fr.up.y * yOff,
            fr.c.z + fr.right.z * l + fr.up.z * yOff);
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

  // W빔 가드레일 — 실제 산악도로의 그것. 물리적 벽면(lat)에 세워지므로
  // 차가 밀려 부딪히는 대상이 콘크리트 홈통이 아니라 레일이 된다.
  _buildGuardrail(lat, side, terrainHeightFn) {
    const g = new THREE.Group();
    const rings = this._rings;
    const railMat = new THREE.MeshStandardMaterial({
      color: 0xb8bec4, metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide,
      envMapIntensity: 0.6,
    });
    // 상·하 두 줄의 빔으로 W 단면을 흉내낸다
    for (const [y0, y1, off] of [[0.0105, 0.0155, 0], [0.0155, 0.0205, -0.0012 * side]]) {
      const positions = [];
      const indices = [];
      let vi = 0;
      for (let r = 0; r < rings.length - 1; r++) {
        for (const rr of [r, r + 1]) {
          const i = rings[rr];
          const fr = this._frame(i, _fr);
          for (const h of [y0, y1]) {
            positions.push(
              fr.c.x + fr.right.x * (lat + off) + fr.up.x * h,
              fr.c.y + fr.right.y * (lat + off) + fr.up.y * h,
              fr.c.z + fr.right.z * (lat + off) + fr.up.z * h);
          }
        }
        indices.push(vi, vi + 1, vi + 3, vi, vi + 3, vi + 2);
        vi += 4;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, railMat);
      mesh.castShadow = true;
      g.add(mesh);
    }

    // 지주 — 일정 간격으로 연석 위에 박힌다
    const postMat = new THREE.MeshStandardMaterial({ color: 0x8d949b, metalness: 0.6, roughness: 0.55 });
    const postGeo = new THREE.BoxGeometry(0.0035, 0.021, 0.0035);
    for (let r = 4; r < rings.length; r += 9) {
      const i = rings[r];
      const fr = this._frame(i, _fr);
      const c = fr.c, right = fr.right, fwd = this.center.fwd[i];
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(
        c.x + right.x * lat + fr.up.x * 0.0075,
        c.y + right.y * lat + fr.up.y * 0.0075,
        c.z + right.z * lat + fr.up.z * 0.0075);
      _m.makeBasis(right, fr.up, new THREE.Vector3(fwd.x, 0, fwd.z).normalize());
      post.quaternion.setFromRotationMatrix(_m);
      post.castShadow = true;
      g.add(post);
    }
    return g;
  }

  // 급커브 바깥쪽 시선유도 표지 (화살표 보드)
  _buildChevrons() {
    const g = new THREE.Group();
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f5c518';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(20, 10); ctx.lineTo(48, 32); ctx.lineTo(20, 54);
    ctx.lineTo(20, 42); ctx.lineTo(32, 32); ctx.lineTo(20, 22);
    ctx.closePath(); ctx.fill();
    const tex = new THREE.CanvasTexture(cv);
    const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.6, metalness: 0.4 });
    const signGeo = new THREE.PlaneGeometry(0.026, 0.026);
    const postGeo = new THREE.BoxGeometry(0.003, 0.030, 0.003);

    const lane = this.lanes[LANE_COUNT];
    for (let i = 20; i < lane.kh.length - 20; i += 4) {
      if (Math.abs(lane.kh[i]) < 0.85) continue;          // 급커브만
      if (i % 40 !== 0) continue;                          // 일정 간격으로만
      const outward = lane.kh[i] > 0 ? -1 : 1;             // 커브 바깥쪽
      const c = this.center.pos[i], right = this.center.right[i], fwd = this.center.fwd[i];
      const base = c.clone().addScaledVector(right, outward * (HALF_W + 0.016));
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.copy(base);
      post.position.y += 0.015;
      g.add(post);
      const sign = new THREE.Mesh(signGeo, signMat);
      sign.position.copy(base);
      sign.position.y += 0.034;
      sign.lookAt(sign.position.clone().addScaledVector(new THREE.Vector3(fwd.x, 0, fwd.z).normalize(), -1));
      if (outward > 0) sign.rotateY(Math.PI);
      g.add(sign);
    }
    return g;
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
const _rt = new THREE.Vector3();
const _upB = new THREE.Vector3();
const _fr = { c: null, right: null, up: null };
const _X = new THREE.Vector3(1, 0, 0);
const _Y = new THREE.Vector3(0, 1, 0);
const _Z = new THREE.Vector3(0, 0, 1);
