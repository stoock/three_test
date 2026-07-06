import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../engine/rng';
import { themeIndexAt } from '../engine/eras';
import { themeFor } from './theme';
import { PLANET_RADIUS, type Planet } from './planet';

const MAX_INSTANCES = 3000;
const MAX_TREES = 1100;
const UP = new THREE.Vector3(0, 1, 0);

/** 머티리얼 슬롯: 0 = 벽체(창문 맵), 1 = 지붕/트림, 2 = 발광 파트 */
type MatSlot = 0 | 1 | 2;

interface StyleDef {
  geometry: THREE.BufferGeometry;
  materials: THREE.MeshStandardMaterial[];
}

/** 절차 생성 창문 텍스처 — map(벽+어두운 창틀)과 emissiveMap(불 켜진 창) 한 쌍 */
function makeFacade(cols: number, rows: number, litRatio: number, seed: number) {
  const w = 64;
  const h = 64;
  const rng = mulberry32(seed);

  const mapCv = document.createElement('canvas');
  mapCv.width = w;
  mapCv.height = h;
  const mctx = mapCv.getContext('2d')!;
  mctx.fillStyle = '#b9b9b9';
  mctx.fillRect(0, 0, w, h);

  const emiCv = document.createElement('canvas');
  emiCv.width = w;
  emiCv.height = h;
  const ectx = emiCv.getContext('2d')!;
  ectx.fillStyle = '#000';
  ectx.fillRect(0, 0, w, h);

  const cw = w / cols;
  const ch = h / rows;
  const padX = cw * 0.28;
  const padY = ch * 0.3;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      const wx = x * cw + padX;
      const wy = y * ch + padY;
      const ww = cw - padX * 2;
      const wh = ch - padY * 2;
      mctx.fillStyle = '#2c313d';
      mctx.fillRect(wx, wy, ww, wh);
      if (rng() < litRatio) {
        ectx.fillStyle = rng() < 0.75 ? '#ffd9a0' : '#bfe3ff';
        ectx.fillRect(wx, wy, ww, wh);
      }
    }
  }

  const map = new THREE.CanvasTexture(mapCv);
  map.colorSpace = THREE.SRGBColorSpace;
  const emissiveMap = new THREE.CanvasTexture(emiCv);
  return { map, emissiveMap };
}

function part(geo: THREE.BufferGeometry, slot: MatSlot, transform?: (g: THREE.BufferGeometry) => void) {
  if (transform) transform(geo);
  return { geo, slot };
}

function buildStyle(parts: { geo: THREE.BufferGeometry; slot: MatSlot }[], materials: THREE.MeshStandardMaterial[]): StyleDef {
  const merged = mergeGeometries(parts.map((p) => p.geo), true)!;
  merged.groups.forEach((g, i) => (g.materialIndex = parts[i].slot));
  return { geometry: merged, materials };
}

/** 문명 지수 → 행성 위 건물·숲·궤도 링을 동기화하는 렌더 계층 */
export class Civilization {
  readonly group = new THREE.Group();

  private styles: { mesh: THREE.InstancedMesh; def: StyleDef }[] = [];
  private trees: THREE.InstancedMesh;
  private rings: THREE.Mesh[] = [];
  private bodyMats: THREE.MeshStandardMaterial[] = [];
  private glowMats: THREE.MeshStandardMaterial[] = [];
  private lastCount = -1;
  private lastEra = -1;

  constructor(
    private planet: Planet,
    private seed: number,
  ) {
    const trimMat = () =>
      new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.85, metalness: 0.06 });
    const glowMat = () => {
      const m = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffa94d, emissiveIntensity: 2 });
      this.glowMats.push(m);
      return m;
    };
    const facadeMat = (cols: number, rows: number, lit: number, fSeed: number) => {
      const { map, emissiveMap } = makeFacade(cols, rows, lit, fSeed);
      const m = new THREE.MeshStandardMaterial({
        map,
        emissiveMap,
        emissive: 0xffa94d,
        emissiveIntensity: 0.6,
        roughness: 0.8,
        metalness: 0.08,
      });
      this.bodyMats.push(m);
      return m;
    };
    // 오두막 벽체 — 창문 없는 은은한 발광 (모닥불 새어나오는 느낌)
    const hutBodyMat = () => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.95, emissive: 0xffa94d, emissiveIntensity: 0.12 });
      this.bodyMats.push(m);
      return m;
    };

    // ── 오두막: 원통 벽 + 초가 지붕 ──
    const hut = buildStyle(
      [
        part(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 6), 0, (g) => g.translate(0, 0.06, 0)),
        part(new THREE.ConeGeometry(0.17, 0.16, 6), 1, (g) => g.translate(0, 0.2, 0)),
      ],
      [hutBodyMat(), trimMat(), glowMat()],
    );

    // ── 가옥: 몸체 + 박공지붕 + 굴뚝 ──
    const house = buildStyle(
      [
        part(new THREE.BoxGeometry(0.24, 0.18, 0.2), 0, (g) => g.translate(0, 0.09, 0)),
        part(new THREE.ConeGeometry(0.19, 0.13, 4), 1, (g) => {
          g.rotateY(Math.PI / 4);
          g.translate(0, 0.245, 0);
        }),
        part(new THREE.BoxGeometry(0.035, 0.11, 0.035), 1, (g) => g.translate(0.07, 0.24, 0.045)),
      ],
      [facadeMat(3, 2, 0.55, this.seed + 11), trimMat(), glowMat()],
    );

    // ── 타워: 2단 셋백 + 옥상 슬래브 + 안테나 ──
    const tower = buildStyle(
      [
        part(new THREE.BoxGeometry(0.2, 0.46, 0.2), 0, (g) => g.translate(0, 0.23, 0)),
        part(new THREE.BoxGeometry(0.15, 0.3, 0.15), 0, (g) => g.translate(0, 0.61, 0)),
        part(new THREE.BoxGeometry(0.22, 0.02, 0.22), 1, (g) => g.translate(0, 0.47, 0)),
        part(new THREE.BoxGeometry(0.17, 0.02, 0.17), 1, (g) => g.translate(0, 0.77, 0)),
        part(new THREE.CylinderGeometry(0.006, 0.006, 0.16, 4), 2, (g) => g.translate(0, 0.85, 0)),
      ],
      [facadeMat(4, 7, 0.6, this.seed + 22), trimMat(), glowMat()],
    );

    // ── 첨탑: 테이퍼 기둥 + 세로 핀 + 발광 첨두 ──
    const finGeo = () => new THREE.BoxGeometry(0.012, 0.52, 0.055);
    const spire = buildStyle(
      [
        part(new THREE.CylinderGeometry(0.032, 0.09, 1.0, 6), 0, (g) => g.translate(0, 0.5, 0)),
        part(finGeo(), 1, (g) => g.translate(0, 0.3, 0.08)),
        part(finGeo(), 1, (g) => {
          g.translate(0, 0.3, 0.08);
          g.rotateY((Math.PI * 2) / 3);
        }),
        part(finGeo(), 1, (g) => {
          g.translate(0, 0.3, 0.08);
          g.rotateY((Math.PI * 4) / 3);
        }),
        part(new THREE.SphereGeometry(0.018, 8, 8), 2, (g) => g.translate(0, 1.03, 0)),
      ],
      [facadeMat(2, 10, 0.7, this.seed + 33), trimMat(), glowMat()],
    );

    for (const def of [hut, house, tower, spire]) {
      const mesh = new THREE.InstancedMesh(def.geometry, def.materials, MAX_INSTANCES);
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
      this.styles.push({ mesh, def });
    }

    // ── 나무: 줄기+수관 정점 색 베이크, 문명이 확장되면 밀려난다 ──
    this.trees = this.makeTrees();
    this.group.add(this.trees);

    // ── 궤도 링 (우주 시대 이후) ──
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(PLANET_RADIUS * (1.7 + i * 0.35), 0.06 + i * 0.02, 8, 128),
        new THREE.MeshStandardMaterial({
          color: 0xaac4e8,
          emissive: 0x7cc7ff,
          emissiveIntensity: 1.2,
          roughness: 0.4,
          metalness: 0.6,
        }),
      );
      ring.rotation.x = Math.PI / 2 + (i === 0 ? 0.35 : -0.5);
      ring.visible = false;
      this.rings.push(ring);
      this.group.add(ring);
    }
  }

  private makeTrees(): THREE.InstancedMesh {
    const bake = (geo: THREE.BufferGeometry, hex: number) => {
      const c = new THREE.Color(hex);
      const count = geo.getAttribute('position').count;
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geo;
    };
    const trunk = bake(new THREE.CylinderGeometry(0.018, 0.028, 0.11, 5), 0x6b4a2f);
    trunk.translate(0, 0.055, 0);
    const canopy = bake(new THREE.ConeGeometry(0.09, 0.26, 6), 0x3f6b38);
    canopy.translate(0, 0.24, 0);
    const geo = mergeGeometries([trunk, canopy], false)!;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_TREES);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }

  /** civ 지수와 시대에 맞춰 건물/숲 인스턴스를 결정론적으로 재구성 */
  sync(civ: number, eraIndex: number): void {
    const count = Math.min(this.planet.landPoints.length, MAX_INSTANCES, Math.floor(3 + civ));
    if (count === this.lastCount && eraIndex === this.lastEra) return;
    this.lastCount = count;
    this.lastEra = eraIndex;

    const theme = themeFor(themeIndexAt(eraIndex));
    const rng = mulberry32(this.seed ^ 0x9e3779b9);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const counts = [0, 0, 0, 0];
    const q = new THREE.Quaternion();

    for (let i = 0; i < count; i++) {
      const pt = this.planet.landPoints[i];
      const r = rng();
      let styleIdx = 0;
      let acc = 0;
      for (let sIdx = 0; sIdx < 4; sIdx++) {
        acc += theme.styleWeights[sIdx];
        if (r <= acc) {
          styleIdx = sIdx;
          break;
        }
      }
      const { mesh } = this.styles[styleIdx];
      const slot = counts[styleIdx]++;
      if (slot >= MAX_INSTANCES) continue;

      q.setFromUnitVectors(UP, pt.position.clone().normalize());
      dummy.position.copy(pt.position);
      dummy.quaternion.copy(q);
      dummy.rotateY(rng() * Math.PI * 2);
      const s = 0.75 + rng() * 0.7;
      dummy.scale.set(s, s * (0.85 + rng() * 0.5), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);

      color.setHex(theme.buildingColors[Math.floor(rng() * theme.buildingColors.length)]);
      color.offsetHSL(0, 0, (rng() - 0.5) * 0.08);
      mesh.setColorAt(slot, color);
    }

    for (let sIdx = 0; sIdx < 4; sIdx++) {
      const { mesh } = this.styles[sIdx];
      mesh.count = counts[sIdx];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // 시대 발광색 갱신 (창문/첨두/링)
    for (const m of this.bodyMats) {
      m.emissive.setHex(theme.emissive);
      m.emissiveIntensity = Math.max(0.12, theme.emissiveIntensity * 0.7);
    }
    for (const m of this.glowMats) {
      m.emissive.setHex(theme.emissive);
      m.emissiveIntensity = theme.emissiveIntensity * 2;
    }

    // 숲 — 도시 경계 바깥의 육지 포인트에 배치, 문명이 자라면 벌목된다
    const treeRng = mulberry32(this.seed ^ 0x517cc1b7);
    let treeCount = 0;
    for (let i = count; i < this.planet.landPoints.length && treeCount < MAX_TREES; i++) {
      if (treeRng() > 0.55) continue;
      const pt = this.planet.landPoints[i];
      q.setFromUnitVectors(UP, pt.position.clone().normalize());
      dummy.position.copy(pt.position);
      dummy.quaternion.copy(q);
      dummy.rotateY(treeRng() * Math.PI * 2);
      const s = 0.8 + treeRng() * 0.9;
      dummy.scale.set(s, s * (0.8 + treeRng() * 0.6), s);
      dummy.updateMatrix();
      this.trees.setMatrixAt(treeCount++, dummy.matrix);
    }
    this.trees.count = treeCount;
    this.trees.instanceMatrix.needsUpdate = true;

    this.rings.forEach((ring, i) => {
      ring.visible = i < theme.rings;
      const mat = ring.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(theme.emissive);
    });
  }

  update(dt: number): void {
    this.rings.forEach((ring, i) => {
      if (ring.visible) ring.rotation.z += dt * (0.02 + i * 0.013);
    });
  }
}
