// src/kit/street.js — 도로, 보도, 경계석, 노면 표시
import * as THREE from 'three';
import { asphalt, stucco, roadText } from '../textures.js';

export function createStreet({ length = 160, roadWidth = 6, sidewalk = 1.6 }) {
  const g = new THREE.Group();
  const zc = length / 2;

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, length),
    new THREE.MeshStandardMaterial({ map: asphalt([3, 40]), roughness: 0.95 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, zc);
  road.receiveShadow = true;
  g.add(road);

  // 양측 보도 + 경계석
  for (const side of [1, -1]) {
    const sw = new THREE.Mesh(
      new THREE.BoxGeometry(sidewalk, 0.12, length),
      new THREE.MeshStandardMaterial({ map: stucco('#b9b4aa', [2, 60]), roughness: 0.9 })
    );
    sw.position.set(side * (roadWidth / 2 + sidewalk / 2), 0.06, zc);
    sw.receiveShadow = true;
    g.add(sw);
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.14, length),
      new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.85 })
    );
    curb.position.set(side * (roadWidth / 2 + 0.075), 0.07, zc);
    g.add(curb);
  }

  // 노란 가장자리 차선 (양측)
  for (const side of [1, -1]) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, length),
      new THREE.MeshStandardMaterial({ color: 0xd8b428, roughness: 0.8 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(side * (roadWidth / 2 - 0.35), 0.012, zc);
    g.add(line);
  }
  return g;
}

// 세로쓰기 도로 문구 ("천천히", "학교앞")
export function createRoadText(text, z, { x = 0 } = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 4.2),
    new THREE.MeshStandardMaterial({ map: roadText(text), transparent: true, roughness: 0.8 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.013, z);
  return m;
}

// 횡단보도
export function createCrosswalk(z, { width = 6 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.8 });
  for (let i = 0; i < Math.floor(width / 0.9); i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), mat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(-width / 2 + 0.45 + i * 0.9, 0.013, z);
    g.add(s);
  }
  return g;
}
