import * as THREE from 'three';

export const CAR_COLORS = [0xd32f2f, 0x1976d2, 0x2e7d32, 0xf9a825, 0x7b1fa2, 0x37474f];

const WHEEL_R = 0.0045;

// 프로시저럴 1:64 다이캐스트 카 (길이 68mm) — 원점은 노면 접지점, 전방 +Z
export function buildCar({ color = 0xd32f2f, body = 'standard', wheel = 'stock' } = {}) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color, metalness: 0.75, roughness: 0.28,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14171c, metalness: 0.3, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fd8ff, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.85,
  });

  const wide = body === 'wide';
  const stream = body === 'streamline';
  const W = wide ? 0.034 : 0.030;
  const bodyH = stream ? 0.009 : 0.011;

  // 섀시
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(W - 0.004, 0.004, 0.064), dark);
  chassis.position.y = 0.005;
  g.add(chassis);

  // 차체
  const hull = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, 0.062), paint);
  hull.position.y = 0.007 + bodyH / 2;
  g.add(hull);

  // 노즈 (앞을 낮게)
  const nose = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH * 0.6, 0.014), paint);
  nose.position.set(0, 0.007 + bodyH * 0.3, 0.036);
  g.add(nose);

  // 캐빈
  const cabW = stream ? W * 0.55 : W * 0.72;
  const cabH = stream ? 0.006 : 0.0085;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(cabW, cabH, 0.024), glass);
  cab.position.set(0, 0.007 + bodyH + cabH / 2 - 0.001, -0.004);
  g.add(cab);

  // 리어 윙 (와이드)
  if (wide) {
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.4, roughness: 0.5 });
    const wing = new THREE.Mesh(new THREE.BoxGeometry(W + 0.006, 0.0025, 0.008), wingMat);
    wing.position.set(0, 0.007 + bodyH + 0.008, -0.029);
    g.add(wing);
    for (const sx of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.008, 0.003), wingMat);
      strut.position.set(sx * (W / 2 - 0.003), 0.007 + bodyH + 0.004, -0.029);
      g.add(strut);
    }
  }

  // 휠 — 등급별 허브 색 (FTE=금색 등 실제 디테일)
  const hubColor = wheel === 'fte' ? 0xd4af37 : wheel === 'race' ? 0xc0c0c0 : 0x333333;
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.85 });
  const hubMat = new THREE.MeshStandardMaterial({ color: hubColor, metalness: 0.8, roughness: 0.3 });
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.004, 14);
  const hubGeo = new THREE.CylinderGeometry(WHEEL_R * 0.55, WHEEL_R * 0.55, 0.0042, 10);
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

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });

  return {
    group: g,
    wheels,
    wheelR: WHEEL_R,
    // 착지 스쿼시 연출: t=착지 후 경과 시간(s), impact 세기
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
