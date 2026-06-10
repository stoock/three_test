// src/main.js — 거제동 골목길 씬 조립
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { fromAsset } from './textures.js';
import { Player } from './player.js';
import { createStreet, createRoadText, createCrosswalk } from './kit/street.js';
import { createBuilding } from './kit/buildings.js';
import { createSchoolWall, createSchoolBuilding } from './kit/school.js';
import {
  createUtilityPole, createWires, createCar, createRoadSign,
  createExcavator, createDirtPile, createConstructionFence,
} from './kit/props.js';
import { ALLEY, BUILDINGS, CARS, POLES, SIGNS, CONSTRUCTION } from './layout.js';

const overlay = document.getElementById('overlay');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.getElementById('webgl-warn').style.display = 'block';
  throw e;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfd8e8, 120, 400);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 1.6, 2);
camera.lookAt(0, 1.6, 20);

// 하늘 + 태양 (맑은 오후)
const sky = new Sky();
sky.scale.setScalar(1000);
scene.add(sky);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(140));
sky.material.uniforms.turbidity.value = 6;
sky.material.uniforms.rayleigh.value = 1.5;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.85;
sky.material.uniforms.sunPosition.value.copy(sunDir);

const sun = new THREE.DirectionalLight(0xfff2dd, 3.2);
sun.position.copy(sunDir).multiplyScalar(180);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -120;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 450;
sun.shadow.bias = -0.0004;
sun.target.position.set(0, 0, 80);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x8a8070, 0.9));

// 플레이어 (오버레이 클릭 → 포인터 락, lock/unlock으로 오버레이 표시 전환)
const player = new Player(camera, renderer.domElement, overlay);

// 충돌 등록 헬퍼
function addWithCollider(obj) {
  scene.add(obj);
  obj.updateMatrixWorld(true);
  player.addCollider(new THREE.Box3().setFromObject(obj));
}

// 주변 지면 (흙색) + 도로·보도·노면 표시
const dirt = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  new THREE.MeshStandardMaterial({ color: 0x8a8275, roughness: 1 })
);
dirt.rotation.x = -Math.PI / 2;
dirt.position.y = -0.02;
dirt.receiveShadow = true;
scene.add(dirt);

scene.add(createStreet({ length: ALLEY.length, roadWidth: ALLEY.roadWidth }));
scene.add(createCrosswalk(6));
scene.add(createRoadText('천천히', 14));
scene.add(createRoadText('학교앞', 24));
scene.add(createRoadText('천천히', 70));

// 우측 건물열 (정면 +x 방향 = 도로 쪽이 되도록 90도 회전)
for (const b of BUILDINGS) {
  const m = createBuilding(b);
  m.rotation.y = Math.PI / 2;
  m.position.set(b.x, 0, b.z);
  addWithCollider(m);
}

// 좌측 학교
addWithCollider(createSchoolWall({ x0: 5, z0: 0, z1: ALLEY.length }));
scene.add(createSchoolBuilding({ x: 18, z: 45, len: 50, floors: 4 }));
scene.add(createSchoolBuilding({ x: 20, z: 110, len: 40, floors: 3 }));

// 차량
for (const c of CARS) {
  const car = createCar(c);
  car.position.set(c.side * (ALLEY.roadWidth / 2 - 1.1), 0, c.z);
  addWithCollider(car);
}

// 전봇대 + 전선 (이웃끼리 연결)
const polePts = [];
for (const p of POLES) {
  const pole = createUtilityPole({ transformer: Math.random() > 0.5 });
  pole.position.set(p.x, 0, p.z);
  scene.add(pole);
  polePts.push(new THREE.Vector3(p.x, 0, p.z));
}
for (let i = 0; i + 1 < polePts.length; i++) scene.add(createWires(polePts[i], polePts[i + 1]));

// 표지판
for (const s of SIGNS) {
  const sign = createRoadSign(s.kind);
  sign.position.set(s.x, 0, s.z);
  sign.rotation.y = -Math.PI / 2 * Math.sign(s.x);
  scene.add(sign);
}

// 공사장 (구간4 우측)
{
  const { z0, z1, x } = CONSTRUCTION;
  const ex = createExcavator();
  ex.position.set(x, 0, (z0 + z1) / 2);
  ex.rotation.y = 0.6;
  addWithCollider(ex);
  const dirt1 = createDirtPile({ r: 2.5 }); dirt1.position.set(x - 3, 0, z0 + 2); addWithCollider(dirt1);
  const dirt2 = createDirtPile({ r: 1.8, h: 1 }); dirt2.position.set(x + 1, 0, z1 - 1); addWithCollider(dirt2);
  const cf = createConstructionFence(z1 - z0 + 4);
  cf.position.set(x + 4, 0, (z0 + z1) / 2);
  addWithCollider(cf);
}

// 모텔 체크 타일 입구 (마지막 건물 앞 바닥)
{
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), fromAsset('tile-checker.jpg', 0x886655));
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(-6.5, 0.015, 150);
  tile.receiveShadow = true;
  scene.add(tile);
}

// 골목 경계(보이지 않는 벽): 도로 양끝
player.addCollider(new THREE.Box3(new THREE.Vector3(-20, 0, -1), new THREE.Vector3(20, 5, 0)));
player.addCollider(new THREE.Box3(new THREE.Vector3(-20, 0, ALLEY.length), new THREE.Vector3(20, 5, ALLEY.length + 1)));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  player.update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
});
