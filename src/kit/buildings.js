// src/kit/buildings.js — 파라미터 건물 + 간판
import * as THREE from 'three';
import { facade, stucco, brick, fromAsset } from '../textures.js';

const FLOOR_H = 2.9;

// opts: { w, d, floors, wall, cols, storefront, kind: 'stucco'|'brick'|'facade', signs: [{file|color,text?, w, h, y, x}] }
export function createBuilding(opts) {
  const { w, d, floors = 3, wall = '#e3ded2', cols = 4, storefront = false, kind = 'facade', signs = [] } = opts;
  const g = new THREE.Group();
  const h = floors * FLOOR_H;

  let front;
  if (kind === 'brick') front = new THREE.MeshStandardMaterial({ map: brick([w / 4, floors]), roughness: 0.9 });
  else if (kind === 'stucco') front = new THREE.MeshStandardMaterial({ map: stucco(wall, [w / 6, 1]), roughness: 0.9 });
  else front = new THREE.MeshStandardMaterial({ map: facade({ floors, cols, wall, storefront }), roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ map: stucco(wall, [d / 6, 1]), roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, front, side]);
  // BoxGeometry 면 순서: +x,-x,+y,-y,+z,-z — 정면(+z)이 도로를 향하도록 배치 시 회전으로 맞춤
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  // 옥상 파라펫 + 물탱크
  const parapet = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.15, 0.5, d + 0.15),
    new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.9 })
  );
  parapet.position.y = h + 0.25;
  g.add(parapet);
  if (floors >= 3) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xd9b94e, roughness: 0.6 })
    );
    tank.position.set(w * 0.25, h + 1.1, -d * 0.2);
    tank.castShadow = true;
    g.add(tank);
  }

  // 간판: file(추출 텍스처) 또는 color+text(캔버스)
  for (const s of signs) {
    const mat = s.file
      ? fromAsset(s.file, 0x2255aa)
      : new THREE.MeshStandardMaterial({ color: s.color ?? 0x2255aa, roughness: 0.7 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 0.12), mat);
    sign.position.set(s.x ?? 0, s.y, d / 2 + 0.08);
    sign.castShadow = true;
    g.add(sign);
  }
  return g;   // 호출측에서 position/rotation 설정 후, Box3는 main에서 setFromObject로 생성
}
