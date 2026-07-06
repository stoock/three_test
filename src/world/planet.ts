import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { mulberry32 } from '../engine/rng';

export const PLANET_RADIUS = 10;
const DISPLACE = 1.6;
const LAND_LEVEL = 0.02; // 이 노이즈값 이상이면 육지

export interface LandPoint {
  position: THREE.Vector3;
  normal: THREE.Vector3;
  /** 수도로부터의 각거리(라디안) — 영토 확장 순서 결정 */
  arc: number;
}

export interface Planet {
  group: THREE.Group;
  landPoints: LandPoint[];
  capital: THREE.Vector3;
}

/** 시드로부터 절차 생성된 미니 행성 (육지 + 바다 + 대기) */
export function createPlanet(seed: number): Planet {
  const rng = mulberry32(seed);
  const noise = new SimplexNoise({ random: rng });

  const fbm = (v: THREE.Vector3): number => {
    let amp = 1;
    let freq = 0.09;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < 5; o++) {
      sum += amp * noise.noise3d(v.x * freq, v.y * freq, v.z * freq);
      norm += amp;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm;
  };

  const geo = new THREE.IcosahedronGeometry(PLANET_RADIUS, 48);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();

  const deep = new THREE.Color(0x0e3a5c);
  const sand = new THREE.Color(0xcbb381);
  const grass = new THREE.Color(0x5e8c4a);
  const forest = new THREE.Color(0x3f6b38);
  const rock = new THREE.Color(0x7d7468);
  const snow = new THREE.Color(0xe8ecf0);

  const heights: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.clone().normalize().multiplyScalar(PLANET_RADIUS));
    heights.push(n);
    const h = Math.max(0, n - LAND_LEVEL);
    v.normalize().multiplyScalar(PLANET_RADIUS + h * DISPLACE);
    pos.setXYZ(i, v.x, v.y, v.z);

    if (n < LAND_LEVEL) c.copy(deep);
    else if (n < LAND_LEVEL + 0.05) c.copy(sand);
    else if (n < LAND_LEVEL + 0.22) c.copy(grass);
    else if (n < LAND_LEVEL + 0.38) c.copy(forest);
    else if (n < LAND_LEVEL + 0.55) c.copy(rock);
    else c.copy(snow);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const land = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0.02 }),
  );
  land.castShadow = false;
  land.receiveShadow = true;

  const ocean = new THREE.Mesh(
    new THREE.IcosahedronGeometry(PLANET_RADIUS + 0.02, 24),
    new THREE.MeshStandardMaterial({
      color: 0x1c6ea0,
      roughness: 0.25,
      metalness: 0.1,
      transparent: true,
      opacity: 0.88,
    }),
  );

  // 대기 글로우 (프레넬, 뒷면 렌더)
  const atmosphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(PLANET_RADIUS * 1.18, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0x5aa8ff) } },
      vertexShader: /* glsl */ `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec3 vNormal;
        void main() {
          float rim = pow(0.72 + dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(uColor, rim * 0.35);
        }
      `,
    }),
  );

  const group = new THREE.Group();
  group.add(ocean, land, atmosphere);

  // 건물 배치 후보: 육지이면서 너무 높지 않은(설산 제외) 정점들
  const candidates: { position: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const seen = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    const n = heights[i];
    if (n < LAND_LEVEL + 0.04 || n > LAND_LEVEL + 0.4) continue;
    const p = new THREE.Vector3().fromBufferAttribute(pos, i);
    const key = `${Math.round(p.x * 4)},${Math.round(p.y * 4)},${Math.round(p.z * 4)}`;
    if (seen.has(key)) continue; // 이음새 중복 정점 제거 + 밀도 억제
    seen.add(key);
    candidates.push({ position: p, normal: new THREE.Vector3().fromBufferAttribute(nrm, i) });
  }

  // 수도: 후보 중 무작위 하나 — 이후 각거리 순으로 영토가 퍼져나간다
  const capital = candidates.length
    ? candidates[Math.floor(rng() * candidates.length)].position.clone()
    : new THREE.Vector3(0, PLANET_RADIUS, 0);
  const capDir = capital.clone().normalize();
  const landPoints: LandPoint[] = candidates.map((cd) => ({
    ...cd,
    arc: cd.position.clone().normalize().angleTo(capDir),
  }));
  landPoints.sort((a, b) => a.arc - b.arc);

  return { group, landPoints, capital };
}
