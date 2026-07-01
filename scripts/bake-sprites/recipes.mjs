// Pure-data voxel recipe generators for city buildings. No three.js/DOM here —
// just arrays of [x,y,z,colorId] cells so they're easy to reason about and
// reuse from the bake step. One "unit" = one VOX-sized cube (see bake-runtime).
//
// Every structure — including the tall tower/arcology skyscrapers — is baked
// as one complete, whole 3D object at a handful of discrete floor-count
// buckets. (An earlier "repeatable floor slice, stacked as flat 2D layers at
// runtime" design was simpler to bake but always left each slice's own
// top-face diamond visibly peeking out above the next, since 2D image
// stacking can't truly occlude the way real 3D geometry does. Baking the
// whole tower sidesteps that: interior floors' top faces are genuinely
// hidden by the geometry above them.)

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function box(cells, x0, x1, y0, y1, z0, z1, color, hollow = false) {
  for (let x = x0; x < x1; x++)
    for (let y = y0; y < y1; y++)
      for (let z = z0; z < z1; z++) {
        if (hollow) {
          const edge = x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
          if (!edge) continue;
        }
        cells.push([x, y, z, color]);
      }
}

function pitchedRoof(cells, w, d, baseY, color) {
  const peak = Math.ceil(w / 2);
  for (let ry = 0; ry <= peak; ry++) {
    const inset = ry;
    for (let x = inset; x < w - inset; x++) for (let z = -1; z <= d; z++) cells.push([x, baseY + ry, z, color]);
  }
  return baseY + peak + 1;
}

// ---------------------------------------------------------------------------
// SINGLE (non-modular) building recipes: hut, temple, keep, manor, factory, dome
// ---------------------------------------------------------------------------

export function hutRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 5 + (r() * 2 | 0);
  const d = 5 + (r() * 2 | 0);
  const h = (tall ? 4 : 2) + (r() * 2 | 0);
  const wallColor = r() > 0.5 ? "wallA" : "wallB";
  const roofColor = r() > 0.5 ? "roofRed" : "roofDark";
  const cells = [];
  box(cells, 0, w, 0, h, 0, d, wallColor, true);
  const topY = pitchedRoof(cells, w, d, h, roofColor);
  if (r() > 0.45) {
    const cx = 1 + (r() * (w - 3) | 0);
    for (let y = h; y < topY + 2; y++) cells.push([cx, y, 0, "chimney"]);
  }
  return { cells, w, d, h: topY + 2 };
}

export function templeRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 7 + (r() * 3 | 0);
  const d = 5 + (r() * 2 | 0);
  const h = (tall ? 5 : 3) + (r() * 2 | 0);
  const step = r() > 0.5 ? 2 : 3;
  const cells = [];
  box(cells, 0, w, 0, 1, 0, d, "base");
  for (let cx = 0; cx <= w - 1; cx += step) for (const cz of [0, d - 1]) box(cells, cx, cx + 1, 1, h, cz, cz + 1, "col");
  box(cells, -1, w + 1, h, h + 1, -1, d + 1, "roof");
  box(cells, 0, w, h, h + 1, 0, d, "roof");
  return { cells, w, d, h: h + 2 };
}

export function keepRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 6 + (r() * 2 | 0);
  const d = 6 + (r() * 2 | 0);
  const h = (tall ? 5 : 3) + (r() * 2 | 0);
  const cells = [];
  box(cells, 0, w, 0, h, 0, d, "stoneA", true);
  // corner towers
  for (const [cx, cz] of [[0, 0], [w - 2, 0], [0, d - 2], [w - 2, d - 2]]) box(cells, cx, cx + 2, h, h + 2, cz, cz + 2, "stoneB", true);
  // crenellations along the top edge
  for (let x = 0; x < w; x += 2) cells.push([x, h, 0, "stoneB"]);
  for (let x = 0; x < w; x += 2) cells.push([x, h, d - 1, "stoneB"]);
  return { cells, w, d, h: h + 3 };
}

export function manorRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 6 + (r() * 2 | 0);
  const d = 5 + (r() * 2 | 0);
  const h = (tall ? 4 : 3) + (r() * 2 | 0);
  const wallColor = r() > 0.5 ? "plaster" : "brick";
  const roofColor = r() > 0.5 ? "roofTile" : "roofRed";
  const cells = [];
  box(cells, 0, w, 0, h, 0, d, wallColor, true);
  const topY = pitchedRoof(cells, w, d, h, roofColor);
  const cx = 1 + (r() * (w - 3) | 0);
  for (let y = h; y < topY + 3; y++) cells.push([cx, y, 0, "chimney"]);
  return { cells, w, d, h: topY + 3 };
}

export function factoryRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 8 + (r() * 3 | 0);
  const d = 6 + (r() * 2 | 0);
  const h = (tall ? 5 : 3) + (r() * 2 | 0);
  const cells = [];
  box(cells, 0, w, 0, h, 0, d, "brick", true);
  box(cells, 0, w, h, h + 1, 0, d, "brickRoof");
  const chimneyX = w - 2;
  const chimneyH = h + 3 + (r() * 3 | 0);
  for (let y = h; y < chimneyH; y++) box(cells, chimneyX, chimneyX + 2, y, y + 1, 1, 3, "chimney");
  return { cells, w, d, h: chimneyH + 1 };
}

export function domeRecipe(seed) {
  const r = mulberry(seed);
  const w = 7 + (r() * 2 | 0);
  const d = 7 + (r() * 2 | 0);
  const h = 3 + (r() * 2 | 0);
  const cells = [];
  box(cells, 0, w, 0, h, 0, d, "metal", true);
  // hemispherical dome cap approximated in voxels
  const cx = w / 2, cz = d / 2, rad = Math.min(w, d) / 2;
  const domeH = Math.ceil(rad) + 1;
  for (let ry = 0; ry < domeH; ry++) {
    const frac = 1 - ry / domeH;
    const rr = rad * Math.sqrt(Math.max(0, 1 - (1 - frac) * (1 - frac)));
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        const dist = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (dist <= rr && dist > rr - 1.6) cells.push([x, h + ry, z, "domeGlass"]);
      }
  }
  return { cells, w, d, h: h + domeH + 1 };
}

// ---------------------------------------------------------------------------
// MODULAR recipes: tower / arcology — one floor-slice ("body") + a "cap".
// Stacked at runtime: floors × body + 1 cap, exactly mirroring the old
// per-floor draw loop but with baked 3D lighting per slice.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Whole-tower recipes: tower / arcology are baked as ONE complete multi-storey
// object (not a repeatable slice). Stacking many flat floor-slice sprites at
// runtime turned out to always show each slice's own top-face diamond peeking
// out above the next one — an unavoidable artefact of flattening a stacked-cube
// silhouette into 2D layers. Baking the whole tower in 3D sidesteps that
// entirely: intermediate floors' top faces are genuinely occluded by the
// geometry above them, exactly like the single-piece buildings already are.
// A few discrete floor-count buckets cover the sim's floorsFor() range.
// A separate, dedicated RNG stream (not shared with the w/d-picking stream)
// so the body and its matching glow-mask bake can independently reproduce
// the exact same "which floors are lit" pattern without depending on call order.
function litStream(seed) {
  return mulberry(seed ^ 0x6c69746d);
}

export function towerWholeRecipe(seed, floors) {
  const r = mulberry(seed);
  const w = 4 + (r() * 2 | 0);
  const d = 4 + (r() * 2 | 0);
  const lit = litStream(seed);
  const cells = [];
  for (let y = 0; y < floors; y++) {
    const isLit = y > 0 && lit() < 0.4;
    box(cells, 0, w, y, y + 1, 0, d, isLit ? "glowWhite" : "glass", true);
  }
  box(cells, 0, w, floors, floors + 1, 0, d, "metalRoof");
  return { cells, w, d, h: floors + 1 };
}

export function towerWholeGlow(seed, floors, w, d) {
  const lit = litStream(seed);
  const cells = [];
  for (let y = 0; y < floors; y++) {
    const isLit = y > 0 && lit() < 0.4;
    if (isLit) box(cells, 0, w, y, y + 1, 0, d, "glowWhite", true);
  }
  return { cells, w, d, h: floors + 1 };
}

export function arcologyWholeRecipe(seed, floors) {
  const r = mulberry(seed);
  const w = 4 + (r() * 2 | 0);
  const d = 4 + (r() * 2 | 0);
  const lit = litStream(seed);
  const cells = [];
  for (let y = 0; y < floors; y++) {
    const setback = y > floors * 0.72 ? Math.min(1, Math.floor((y - floors * 0.72) / 3)) : 0;
    const ww = Math.max(2, w - setback * 2);
    const dd = Math.max(2, d - setback * 2);
    const isLit = y > 0 && lit() < 0.42;
    box(cells, setback, setback + ww, y, y + 1, setback, setback + dd, isLit ? "glowWhite" : "neonWall", true);
  }
  box(cells, 0, w, floors, floors + 1, 0, d, "metalRoof");
  return { cells, w, d, h: floors + 1 };
}

export function arcologyWholeGlow(seed, floors, w, d) {
  const lit = litStream(seed);
  const cells = [];
  for (let y = 0; y < floors; y++) {
    const setback = y > floors * 0.72 ? Math.min(1, Math.floor((y - floors * 0.72) / 3)) : 0;
    const ww = Math.max(2, w - setback * 2);
    const dd = Math.max(2, d - setback * 2);
    const isLit = y > 0 && lit() < 0.42;
    if (isLit) box(cells, setback, setback + ww, y, y + 1, setback, setback + dd, "glowWhite", true);
  }
  return { cells, w, d, h: floors + 1 };
}


export const PALETTE = {
  wallA: "#b98a52",
  wallB: "#8f6a3e",
  roofRed: "#b8422a",
  roofDark: "#6b3a24",
  roofTile: "#a8432f",
  chimney: "#7a5a3e",
  base: "#cfc7b0",
  col: "#e8e2d0",
  roof: "#a89f8c",
  stoneA: "#8f877b",
  stoneB: "#7f7a70",
  plaster: "#ddcba2",
  brick: "#9c4a38",
  brickRoof: "#7a3a2c",
  metal: "#aab2be",
  domeGlass: "#8fb6c8",
  glass: "#6fa8c8",
  metalRoof: "#9aa2ae",
  neonWall: "#4a3a80",
  glowWhite: "#ffffff",
};
