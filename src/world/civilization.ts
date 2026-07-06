import * as THREE from 'three';
import { mulberry32 } from '../engine/rng';
import { themeIndexAt } from '../engine/eras';
import { themeFor } from './theme';
import { PLANET_RADIUS, type Planet } from './planet';

const MAX_INSTANCES = 3000;
const UP = new THREE.Vector3(0, 1, 0);

/** 문명 지수 → 행성 위 건물 수/영토를 동기화하는 렌더 계층 */
export class Civilization {
  readonly group = new THREE.Group();

  private styles: THREE.InstancedMesh[];
  private rings: THREE.Mesh[] = [];
  private lastCount = -1;
  private lastEra = -1;

  constructor(
    private planet: Planet,
    private seed: number,
  ) {
    const mat = () =>
      new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.1, emissive: 0xffa94d, emissiveIntensity: 0.3 });

    const hut = new THREE.ConeGeometry(0.16, 0.3, 5);
    hut.translate(0, 0.15, 0);
    const house = new THREE.BoxGeometry(0.22, 0.2, 0.22);
    house.translate(0, 0.1, 0);
    const tower = new THREE.BoxGeometry(0.16, 0.62, 0.16);
    tower.translate(0, 0.31, 0);
    const spire = new THREE.ConeGeometry(0.1, 0.95, 6);
    spire.translate(0, 0.475, 0);

    this.styles = [hut, house, tower, spire].map((g) => {
      const m = new THREE.InstancedMesh(g, mat(), MAX_INSTANCES);
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
      return m;
    });

    // 궤도 링 (우주 시대 이후 등장)
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

  /** civ 지수와 시대에 맞춰 건물 인스턴스를 결정론적으로 재구성 */
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

    for (const mesh of this.styles) mesh.count = 0;

    for (let i = 0; i < count; i++) {
      const pt = this.planet.landPoints[i];
      // 스타일 선택: 시대 가중치 + 결정론적 난수
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
      const mesh = this.styles[styleIdx];
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
      const mesh = this.styles[sIdx];
      mesh.count = counts[sIdx];
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissive.setHex(theme.emissive);
      mat.emissiveIntensity = theme.emissiveIntensity;
    }

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
