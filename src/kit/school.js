// src/kit/school.js — 좌측(x>0): 석축 옹벽 + 녹색 펜스 + 소나무 + 학교 건물
import * as THREE from 'three';
import { graniteWall, fenceMesh, facade } from '../textures.js';

function pine(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 2.2 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 1 })
  );
  trunk.position.y = 1.1 * scale;
  trunk.castShadow = true;
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2d5a2d, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry((1.3 - i * 0.3) * scale, 1.3 * scale, 9), leaf);
    cone.position.y = (2 + i * 0.85) * scale;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

// 옹벽+펜스 한 구간. x0 = 옹벽 앞면 x 좌표, z0~z1 구간
export function createSchoolWall({ x0 = 5, z0 = 0, z1 = 160, wallH = 1.6 }) {
  const g = new THREE.Group();
  const len = z1 - z0, zc = (z0 + z1) / 2;

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, wallH, len),
    new THREE.MeshStandardMaterial({ map: graniteWall([len / 8, 1]), roughness: 0.95 })
  );
  wall.position.set(x0 + 0.4, wallH / 2, zc);
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);

  const fence = new THREE.Mesh(
    new THREE.PlaneGeometry(len, 1.8),
    new THREE.MeshStandardMaterial({
      map: fenceMesh([len / 2, 1]), transparent: true, alphaTest: 0.3,
      side: THREE.DoubleSide, roughness: 0.7,
    })
  );
  fence.rotation.y = Math.PI / 2;
  fence.position.set(x0 + 0.4, wallH + 0.9, zc);
  g.add(fence);

  // 소나무 — 8m 간격, 펜스 안쪽
  for (let z = z0 + 4; z < z1; z += 8) {
    const p = pine(0.9 + Math.random() * 0.5);
    p.position.set(x0 + 2.2, wallH, z);
    g.add(p);
  }
  return g;
}

// 학교 건물 (크림색, 창문 많은 긴 박스) — 펜스 너머
export function createSchoolBuilding({ x = 18, z, len = 45, floors = 4 }) {
  const mat = new THREE.MeshStandardMaterial({ map: facade({ floors, cols: 12, wall: '#ece5d3' }), roughness: 0.85 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xe0d9c8, roughness: 0.9 });
  const h = floors * 3.1;
  const m = new THREE.Mesh(new THREE.BoxGeometry(12, h, len), [sideMat, sideMat, sideMat, sideMat, sideMat, sideMat]);
  m.material[1] = mat;            // -x 면이 도로(−x 방향)를 향함
  m.position.set(x, h / 2 + 1.6, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
