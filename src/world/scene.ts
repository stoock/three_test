import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { themeIndexAt } from '../engine/eras';
import { mulberry32 } from '../engine/rng';
import { Civilization } from './civilization';
import { createPlanet, PLANET_RADIUS, type Planet } from './planet';
import { themeFor } from './theme';

/** Three.js 씬 전체를 소유하는 월드 — 시뮬레이션 상태를 비주얼로 동기화한다 */
export class World {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private sun: THREE.DirectionalLight;
  private sunPivot = new THREE.Group();
  private planet: Planet | null = null;
  private civ: Civilization | null = null;
  private avatar: THREE.Mesh | null = null;
  private avatarLight: THREE.PointLight | null = null;
  private camLight: THREE.PointLight;
  private elapsed = 0;
  private tween: { fromDir: THREE.Vector3; toDir: THREE.Vector3; fromR: number; toR: number; t: number } | null = null;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.camera.position.set(0, 14, 30);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    // 지붕 높이 바로 위까지 접근 가능 — 건물 디테일 관찰용 (건물 관통 방지선)
    this.controls.minDistance = PLANET_RADIUS * 1.27;
    this.controls.maxDistance = PLANET_RADIUS * 8;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.35;

    this.scene.background = new THREE.Color(0x05060d);
    this.scene.add(new THREE.AmbientLight(0x334466, 0.55));
    this.scene.add(new THREE.HemisphereLight(0x8899cc, 0x221a10, 0.35));

    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
    this.sun.position.set(60, 18, 0);
    this.sunPivot.add(this.sun);
    this.scene.add(this.sunPivot);

    // 근접 관찰용 보조광 — 멀리서는 꺼지고, 표면에 다가가면 은은하게 켜진다
    this.camLight = new THREE.PointLight(0x9fb6e8, 0, 30, 1.6);
    this.camera.add(this.camLight);
    this.scene.add(this.camera);

    this.scene.add(makeStars());

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** 캐릭터 시드로 행성을 (재)생성 */
  setSeed(seed: number): void {
    if (this.planet) this.scene.remove(this.planet.group);
    if (this.civ) this.scene.remove(this.civ.group);

    this.planet = createPlanet(seed);
    this.scene.add(this.planet.group);
    this.civ = new Civilization(this.planet, seed);
    this.scene.add(this.civ.group);

    if (!this.avatar) {
      this.avatar = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 16),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe28a, emissiveIntensity: 2.2 }),
      );
      this.avatarLight = new THREE.PointLight(0xffd98a, 6, 6);
      this.avatar.add(this.avatarLight);
      this.scene.add(this.avatar);
    }
    this.avatar.visible = true;
    this.moveAvatar(0);
  }

  clear(): void {
    if (this.avatar) this.avatar.visible = false;
  }

  syncSim(civIndex: number, eraIndex: number): void {
    this.civ?.sync(civIndex, eraIndex);
    const theme = themeFor(themeIndexAt(eraIndex));
    (this.scene.background as THREE.Color).setHex(theme.spaceTint);
  }

  update(dtReal: number): void {
    this.elapsed += dtReal;
    // 낮/밤 순환 — 실시간 기준 약 80초 주기
    this.sunPivot.rotation.y += dtReal * ((Math.PI * 2) / 80);
    this.civ?.update(dtReal);
    this.moveAvatar(this.elapsed);

    // 수도 이동 트윈
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dtReal / 1.1);
      const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - (-2 * tw.t + 2) ** 2 / 2; // easeInOutQuad
      const axis = new THREE.Vector3().crossVectors(tw.fromDir, tw.toDir);
      const angle = tw.fromDir.angleTo(tw.toDir);
      const dir = tw.fromDir.clone();
      if (axis.lengthSq() > 1e-8) dir.applyAxisAngle(axis.normalize(), angle * e);
      this.camera.position.copy(dir.multiplyScalar(tw.fromR + (tw.toR - tw.fromR) * e));
      this.camera.lookAt(0, 0, 0);
      if (tw.t >= 1) {
        this.tween = null;
        this.controls.enabled = true;
      }
    }

    // 표면에 가까울수록 회전/줌을 느리게 — 저공 관찰이 조작 가능하도록
    const dist = this.camera.position.length();
    const closeness = THREE.MathUtils.clamp((dist - PLANET_RADIUS * 1.15) / (PLANET_RADIUS * 1.5), 0.06, 1);
    this.controls.rotateSpeed = closeness;
    this.controls.zoomSpeed = 0.4 + closeness * 0.8;
    this.controls.autoRotate = !this.tween && dist > PLANET_RADIUS * 2.1;
    this.camLight.intensity = (1 - closeness) ** 2 * 3;

    if (!this.tween) this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** 불멸자 아바타 — 수도 근방을 천천히 배회 */
  private moveAvatar(t: number): void {
    if (!this.avatar || !this.planet) return;
    const dir = this.planet.capital.clone().normalize();
    const tangent = new THREE.Vector3(0, 1, 0).cross(dir);
    if (tangent.lengthSq() < 1e-4) tangent.set(1, 0, 0);
    tangent.normalize();
    const bitangent = dir.clone().cross(tangent);
    const wob = dir
      .clone()
      .addScaledVector(tangent, Math.sin(t * 0.23) * 0.09)
      .addScaledVector(bitangent, Math.cos(t * 0.31) * 0.09)
      .normalize();
    const surfaceR = this.planet.capital.length();
    this.avatar.position.copy(wob.multiplyScalar(surfaceR + 0.5 + Math.sin(t * 1.7) * 0.06));
  }

  /** 카메라를 수도(문명 중심) 상공으로 부드럽게 이동 */
  focusCapital(): void {
    if (!this.planet) return;
    this.controls.enabled = false;
    this.tween = {
      fromDir: this.camera.position.clone().normalize(),
      toDir: this.planet.capital.clone().normalize(),
      fromR: this.camera.position.length(),
      toR: PLANET_RADIUS * 1.42,
      t: 0,
    };
  }

  /** 현재 프레임을 작은 JPEG dataURL로 캡처 — 연대기 '사진' */
  captureSnapshot(): string {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const w = 320;
    const h = Math.max(1, Math.round((src.height / src.width) * w));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.drawImage(src, 0, 0, w, h);
    return cv.toDataURL('image/jpeg', 0.62);
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}

function makeStars(): THREE.Points {
  const rng = mulberry32(0xdeadbeef);
  const n = 2600;
  const positions = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (v.lengthSq() < 0.01) v.set(1, 0, 0);
    v.normalize().multiplyScalar(400 + rng() * 500);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xcdd6ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.85 }),
  );
}
