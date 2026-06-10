// src/main.js
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { asphalt } from './textures.js';

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

// 임시 바닥 (Task 4에서 street.js로 대체)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ map: asphalt([40, 40]), roughness: 0.95 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

overlay.addEventListener('click', () => overlay.classList.add('hidden'));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
