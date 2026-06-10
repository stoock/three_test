// src/kit/props.js — 전봇대/전선, 차량, 표지판, 굴착기, 흙더미, 공사 펜스
import * as THREE from 'three';
import { signBoard } from '../textures.js';

const gray = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

export function createUtilityPole({ transformer = false } = {}) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 9, 10), gray(0x9a9a96, 0.95));
  pole.position.y = 4.5;
  pole.castShadow = true;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), gray(0x777777));
  arm.position.y = 8.2;
  g.add(arm);
  if (transformer) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10), gray(0x55585c));
    t.position.set(0.35, 7.2, 0);
    g.add(t);
  }
  return g;
}

// 두 전봇대 사이 늘어진 전선 3가닥
export function createWires(a, b) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (let i = -1; i <= 1; i++) {
    const p0 = a.clone().add(new THREE.Vector3(i * 0.5, 8.2, 0));
    const p1 = b.clone().add(new THREE.Vector3(i * 0.5, 8.2, 0));
    const mid = p0.clone().lerp(p1, 0.5); mid.y -= 0.8;   // 처짐
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.02, 4), mat));
  }
  return g;
}

// 저폴리 차량: body+cabin+바퀴. type: 'sedan'|'suv'|'taxi'|'truck'
export function createCar({ color = 0xeeeeee, type = 'sedan' } = {}) {
  const g = new THREE.Group();
  const dims = { sedan: [1.75, 0.55, 4.4], suv: [1.85, 0.8, 4.5], taxi: [1.75, 0.55, 4.4], truck: [1.9, 0.9, 5.2] }[type];
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(...dims), bodyMat);
  body.position.y = 0.3 + dims[1] / 2;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(dims[0] * 0.86, 0.5, dims[2] * (type === 'truck' ? 0.3 : 0.5)),
    new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.2, metalness: 0.3 })
  );
  cabin.position.set(0, 0.3 + dims[1] + 0.25, type === 'truck' ? dims[2] * 0.28 : -dims[2] * 0.05);
  cabin.castShadow = true;
  g.add(cabin);
  if (type === 'taxi') {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), gray(0xffc928, 0.4));
    cap.position.y = 0.3 + dims[1] + 0.58;
    g.add(cap);
  }
  const wheel = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12), wheel);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * dims[0] / 2, 0.32, sz * dims[2] * 0.32);
    g.add(w);
  }
  return g;
}

export function createRoadSign(kind) {   // 'school-zone' | 'no-left-turn'
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 8), gray(0x888888));
  pole.position.y = 1.5;
  g.add(pole);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.85),
    new THREE.MeshStandardMaterial({ map: signBoard(kind), side: THREE.DoubleSide, roughness: 0.5 })
  );
  board.position.y = 2.7;
  g.add(board);
  return g;
}

export function createExcavator() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8a216, roughness: 0.5 });
  const dark = gray(0x333333);
  const tracks = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 3.4), dark);
  tracks.position.y = 0.35; tracks.castShadow = true; g.add(tracks);
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.8), yellow);
  bodyM.position.y = 1.25; bodyM.castShadow = true; g.add(bodyM);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.2 }));
  cab.position.set(-0.55, 2.2, -0.6); cab.castShadow = true; g.add(cab);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 2.6), yellow);
  boom.position.set(0.4, 2.1, 2.0); boom.rotation.x = -0.5; boom.castShadow = true; g.add(boom);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 2.0), yellow);
  arm.position.set(0.4, 1.5, 3.6); arm.rotation.x = 0.7; arm.castShadow = true; g.add(arm);
  const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), dark);
  bucket.position.set(0.4, 0.6, 4.3); g.add(bucket);
  return g;
}

export function createDirtPile({ r = 2.5, h = 1.4 } = {}) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a5f3c, roughness: 1 })
  );
  m.scale.y = h / r;
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function createConstructionFence(len) {
  const g = new THREE.Group();
  const mats = [gray(0xf5f5f0, 0.6), gray(0xe87820, 0.6)];
  const n = Math.ceil(len / 2);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 0.06), mats[i % 2]);
    p.position.set(0, 0.95, i * 2 - len / 2 + 1);
    p.castShadow = true;
    g.add(p);
  }
  return g;
}
