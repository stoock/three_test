import * as THREE from 'three';

export const CAR_COLORS = [0xd32f2f, 0x1976d2, 0x2e7d32, 0xf9a825, 0x7b1fa2, 0x37474f];

export const LIVERIES = {
  solid:  { label: '솔리드' },
  stripe: { label: '스트라이프' },
  number: { label: '스트라이프+넘버' },
};

const WHEEL_R = 0.0045;

// 측면 실루엣 (z=차 길이 방향, y=높이) — ExtrudeGeometry 베벨로 곡면 처리
const PROFILES = {
  standard: [
    [-0.033, 0.005], [-0.033, 0.0145], [-0.026, 0.0175], [-0.014, 0.0212],
    [0.000, 0.0212], [0.010, 0.0158], [0.024, 0.0132], [0.032, 0.0098],
    [0.034, 0.0062], [0.034, 0.005],
  ],
  streamline: [
    [-0.033, 0.005], [-0.033, 0.0118], [-0.024, 0.0148], [-0.011, 0.0178],
    [0.002, 0.0178], [0.012, 0.0128], [0.026, 0.0108], [0.033, 0.0072],
    [0.034, 0.005],
  ],
};
PROFILES.wide = PROFILES.standard;

const GLASS = {
  standard:   [[0.0125, 0.0146], [0.0005, 0.0218], [-0.0135, 0.0218], [-0.023, 0.0146]],
  streamline: [[0.0135, 0.0120], [0.0025, 0.0184], [-0.0105, 0.0184], [-0.0215, 0.0120]],
};
GLASS.wide = GLASS.standard;

function shapeFrom(pts, yOffset = 0) {
  const sh = new THREE.Shape();
  sh.moveTo(pts[0][0], pts[0][1] + yOffset);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1] + yOffset);
  sh.closePath();
  return sh;
}

// 실루엣 shape → 폭 방향 압출 (차 전방 +Z 로 정렬)
function extrudeBody(pts, width, bevel, yOffset = 0) {
  const geo = new THREE.ExtrudeGeometry(shapeFrom(pts, yOffset), {
    depth: Math.max(0.001, width - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel * 0.8,
    bevelSize: bevel,
    bevelSegments: 3,
    steps: 1,
  });
  geo.rotateY(-Math.PI / 2);
  geo.computeBoundingBox();
  const cx = (geo.boundingBox.min.x + geo.boundingBox.max.x) / 2;
  geo.translate(-cx, 0, 0);
  return geo;
}

function numberTexture(num) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#f5f5f0';
  ctx.beginPath(); ctx.arc(64, 64, 60, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#111'; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.arc(64, 64, 55, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#111';
  ctx.font = '900 66px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 68);
  return new THREE.CanvasTexture(cv);
}

// 프로시저럴 1:64 다이캐스트 카 — 원점은 노면 접지점, 전방 +Z
export function buildCar({
  color = 0xd32f2f, body = 'standard', wheel = 'stock',
  livery = 'number', massG = 55, dist = 'center', num = 5,
} = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.72, roughness: 0.22, envMapIntensity: 1.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.3, roughness: 0.6 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x86c8f0, metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.9, envMapIntensity: 1.3,
  });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, metalness: 0.55, roughness: 0.3, envMapIntensity: 0.9 });

  const wide = body === 'wide';
  const W = wide ? 0.034 : 0.030;
  const prof = PROFILES[body] || PROFILES.standard;

  // 섀시
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(W - 0.004, 0.0035, 0.064), dark);
  chassis.position.y = 0.0048;
  g.add(chassis);

  // 차체 (곡면 실루엣)
  const hull = new THREE.Mesh(extrudeBody(prof, W, 0.0022), paint);
  g.add(hull);

  // 글라스 캐노피 (차체 베벨 위로 살짝 돌출)
  const glass = new THREE.Mesh(extrudeBody(GLASS[body] || GLASS.standard, W - 0.008, 0.0012, 0.0018), glassMat);
  g.add(glass);

  // 레이싱 스트라이프 — 동일 실루엣을 차체 베벨 위로 띄워 좁게 압출 → 곡면을 그대로 따라감
  if (livery !== 'solid') {
    const stripeProf = prof.map(([z, y]) => [z * 0.94, y]);
    for (const sx of [-1, 1]) {
      const st = new THREE.Mesh(extrudeBody(stripeProf, 0.0052, 0, 0.0031), stripeMat);
      st.position.x = sx * 0.0048;
      g.add(st);
    }
  }

  // 도어 넘버 라운델
  if (livery === 'number') {
    const tex = numberTexture(num);
    const roundelGeo = new THREE.PlaneGeometry(0.0135, 0.0135);
    for (const sx of [-1, 1]) {
      const r = new THREE.Mesh(roundelGeo, new THREE.MeshStandardMaterial({
        map: tex, transparent: true, metalness: 0.4, roughness: 0.4,
      }));
      r.position.set(sx * (W / 2 + 0.0002), 0.0122, 0.0015);
      r.rotation.y = sx * Math.PI / 2;
      g.add(r);
    }
  }

  // 리어 윙 (와이드)
  if (wide) {
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.4, roughness: 0.5 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(W + 0.006, 0.0022, 0.0075), wingMat);
    wing.position.set(0, 0.0225, -0.030);
    g.add(wing);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.008, 0.003), wingMat);
      strut.position.set(sx * (W / 2 - 0.003), 0.0175, -0.030);
      g.add(strut);
    }
  }

  // 웨이트(발라스트) — 추가 무게·배분 위치가 눈에 보이게 (텅스텐 플레이트)
  const extra = Math.max(0, massG - 30);
  if (extra > 2) {
    const sc = 0.55 + (extra / 90) * 0.75;
    const ballastMat = new THREE.MeshStandardMaterial({ color: 0x6e7480, metalness: 0.95, roughness: 0.35 });
    const zPos = dist === 'front' ? 0.017 : dist === 'rear' ? -0.019 : -0.002;
    const ballast = new THREE.Mesh(
      new THREE.BoxGeometry(0.019 * sc, 0.0028, 0.013 * sc), ballastMat);
    ballast.position.set(0, 0.0022, zPos);
    g.add(ballast);
    // 고정 나사 디테일
    const boltGeo = new THREE.CylinderGeometry(0.0009, 0.0009, 0.004, 6);
    for (const sz of [-1, 1]) {
      const b = new THREE.Mesh(boltGeo, dark);
      b.position.set(0, 0.003, zPos + sz * 0.005 * sc);
      g.add(b);
    }
  }

  // 휠 — 등급별 허브 색 (FTE=금색, 폴리싱=크롬)
  const hubColor = wheel === 'fte' ? 0xd4af37 : wheel === 'race' ? 0xd8dde2 : 0x3a3a3a;
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.85 });
  const hubMat = new THREE.MeshStandardMaterial({ color: hubColor, metalness: 0.9, roughness: 0.2, envMapIntensity: 1.2 });
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.004, 16);
  const hubGeo = new THREE.CylinderGeometry(WHEEL_R * 0.58, WHEEL_R * 0.58, 0.0044, 12);
  const wheels = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wg = new THREE.Group();
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    const hub = new THREE.Mesh(hubGeo, hubMat);
    hub.rotation.z = Math.PI / 2;
    wg.add(tire, hub);
    wg.position.set(sx * (W / 2 - 0.0005), WHEEL_R, sz * 0.021);
    g.add(wg);
    wheels.push(wg);
  }

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  return {
    group: g,
    wheels,
    wheelR: WHEEL_R,
    applySquash(tSince, impact) {
      if (tSince < 0 || tSince > 0.25) { g.scale.set(1, 1, 1); return; }
      const k = Math.min(1, impact * 0.35);
      const p = Math.sin((tSince / 0.25) * Math.PI);
      g.scale.set(1 + 0.25 * k * p, 1 - 0.4 * k * p, 1);
    },
    spinWheels(v, dt) {
      const dRot = (v * dt) / WHEEL_R;
      for (const w of wheels) w.rotation.x += dRot;
    },
  };
}
