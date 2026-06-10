// src/layout.js — 순수 배치 데이터. 우측(상가/주택) = x<0, 좌측(학교) = x>0
export const ALLEY = { length: 160, roadWidth: 6 };

// 우측 건물열 — z 순서대로. rotY 는 정면이 도로(+x 방향)를 향하게 main에서 일괄 적용
export const BUILDINGS = [
  // 구간2: 상가 골목 (30–80m)
  { z: 34, x: -10, w: 9, d: 10, floors: 3, storefront: true, wall: '#ddd6c8',
    signs: [{ file: 'sign-academy.jpg', w: 7, h: 1.2, y: 3.5 }] },
  { z: 45, x: -10, w: 9, d: 9, floors: 4, kind: 'brick',
    signs: [{ file: 'sign-maemae.jpg', w: 2, h: 4, y: 6, x: 3 }] },
  { z: 56, x: -9.5, w: 9, d: 8, floors: 2, storefront: true, wall: '#cfc8bb',
    signs: [{ color: 0x1e63c8, w: 6, h: 1, y: 2.9 }] },
  { z: 66, x: -10, w: 9, d: 9, floors: 3, wall: '#e8e2d4' },
  // 구간3: 주택 골목 (80–120m)
  { z: 84, x: -9, w: 8, d: 8, floors: 2, kind: 'stucco', wall: '#e5dfd2' },
  { z: 94, x: -9, w: 8, d: 8, floors: 2, kind: 'stucco', wall: '#d8d2c5' },
  { z: 104, x: -9.5, w: 9, d: 9, floors: 3, kind: 'brick' },
  { z: 114, x: -9, w: 8, d: 8, floors: 2, kind: 'stucco', wall: '#ddd8cc' },
  // 구간4: 종점 (120–160m)
  { z: 132, x: -10, w: 10, d: 11, floors: 4, wall: '#f0e9da',
    signs: [{ file: 'facade-daycare.jpg', w: 8, h: 5, y: 8 }, { file: 'banner-rent.jpg', w: 2.4, h: 1.5, y: 4.5, x: -3 }] },
  { z: 150, x: -10, w: 11, d: 12, floors: 4, wall: '#e8ddd0', storefront: true,
    signs: [{ color: 0xa03050, w: 7, h: 1.4, y: 4.2 }] },   // 모텔 — 체크 타일 입구는 main에서 별도
];

// 주차 차량 — side: 1=좌측 갓길, -1=우측 갓길
export const CARS = [
  { z: 36, side: 1, type: 'taxi', color: 0xf5f5f0 },
  { z: 42, side: 1, type: 'sedan', color: 0xffffff },
  { z: 58, side: -1, type: 'truck', color: 0x3a62b0 },
  { z: 86, side: 1, type: 'sedan', color: 0xe8e8e8 },
  { z: 92, side: 1, type: 'sedan', color: 0xc62828 },
  { z: 98, side: -1, type: 'suv', color: 0x556270 },
  { z: 118, side: 1, type: 'suv', color: 0x2f4f3f },
  { z: 124, side: 1, type: 'sedan', color: 0xc62828 },
];

export const POLES = [12, 34, 56, 78, 100, 122, 144].map((z) => ({ z, x: -4.2 }));

export const SIGNS = [
  { z: 8, x: 4.2, kind: 'school-zone' },
  { z: 100, x: 4.2, kind: 'no-left-turn' },
];

export const CONSTRUCTION = { z0: 138, z1: 148, x: -8 };   // 공사장 영역(우측)
