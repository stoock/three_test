// src/player.js — PointerLock 1인칭 이동 + AABB 충돌
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const EYE = 1.6, RADIUS = 0.4, WALK = 4, RUN = 7;

export class Player {
  constructor(camera, dom, overlay) {
    this.controls = new PointerLockControls(camera, dom);
    this.camera = camera;
    this.keys = {};
    this.vel = new THREE.Vector3();
    this.colliders = [];          // THREE.Box3 목록 (main에서 채움)

    overlay.addEventListener('click', () => this.controls.lock());
    this.controls.addEventListener('lock', () => overlay.classList.add('hidden'));
    this.controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));
    document.addEventListener('keydown', (e) => (this.keys[e.code] = true));
    document.addEventListener('keyup', (e) => (this.keys[e.code] = false));
  }

  addCollider(box3) { this.colliders.push(box3); }

  #hits(p) {
    for (const b of this.colliders) {
      if (p.x > b.min.x - RADIUS && p.x < b.max.x + RADIUS &&
          p.z > b.min.z - RADIUS && p.z < b.max.z + RADIUS &&
          EYE > b.min.y && b.max.y > 0.3) return true;   // 낮은 턱은 통과
    }
    return false;
  }

  update(dt) {
    if (!this.controls.isLocked) return;
    const speed = this.keys['ShiftLeft'] ? RUN : WALK;
    const f = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const r = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    const move = dir.multiplyScalar(f).add(right.multiplyScalar(r));
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);

    const p = this.camera.position;
    // 축 분리 이동 — 벽에 비비며 슬라이드 가능
    const tryX = p.clone(); tryX.x += move.x;
    if (!this.#hits(tryX)) p.x = tryX.x;
    const tryZ = p.clone(); tryZ.z += move.z;
    if (!this.#hits(tryZ)) p.z = tryZ.z;
    p.y = EYE;
  }
}
