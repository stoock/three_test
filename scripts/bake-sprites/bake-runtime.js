import * as THREE from "three";
import {
  hutRecipe,
  templeRecipe,
  keepRecipe,
  manorRecipe,
  domeRecipe,
  factoryRecipe,
  towerWholeRecipe,
  towerWholeGlow,
  arcologyWholeRecipe,
  arcologyWholeGlow,
  PROP_RECIPES,
  FLAT_PALETTE as PALETTE,
  mulberry,
} from "./recipes.mjs";

// ---------------------------------------------------------------------------
// This file runs inside a headless Chromium page (via Playwright, see
// build.mjs). It renders every catalogue entry with real three.js lighting +
// soft shadows, crops tightly to each shape, and exports a transparent PNG
// data URL. build.mjs then writes those to public/sprites/*.png plus a
// manifest.json the game's Canvas2D renderer reads at runtime — no WebGL is
// ever required by players, only by this one-time bake step.
// ---------------------------------------------------------------------------

const VOX = 0.42; // world size of one voxel cube — must match src/lib/renderer.ts's mental model
const MAX_PX = 340; // cap sprite resolution so the repo/asset payload stays sane

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

function buildVoxelGroup(cells, palette) {
  const geo = new THREE.BoxGeometry(VOX, VOX, VOX);
  const byColor = new Map();
  for (const [x, y, z, c] of cells) {
    if (!byColor.has(c)) byColor.set(c, []);
    byColor.get(c).push([x, y, z]);
  }
  const group = new THREE.Group();
  for (const [colorId, pts] of byColor) {
    const glow = colorId === "glowWhite";
    const litWin = colorId === "glassLit";
    const emissive = glow || litWin;
    const mat = new THREE.MeshStandardMaterial({
      color: palette[colorId] ?? "#999999",
      roughness: emissive ? 0.4 : 0.85,
      metalness: 0.03,
      emissive: glow ? new THREE.Color("#fff6d8") : litWin ? new THREE.Color("#ffd98a") : new THREE.Color("#000000"),
      emissiveIntensity: glow ? 1.1 : litWin ? 0.55 : 0,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
    mesh.castShadow = !emissive;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    pts.forEach(([x, y, z], i) => {
      m.makeTranslation(x * VOX, y * VOX, z * VOX);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  return group;
}

// Analytic bounding box matching exactly what buildVoxelGroup would occupy
// for a *solid* w×h×d block — used to force glow/cap sprites onto the same
// camera framing as their paired body sprite, even when their own voxel
// content is sparse (e.g. only a few lit windows), so the two bake perfectly
// aligned and can be drawn at the same target size without drifting apart.
function analyticBox(w, d, h) {
  return new THREE.Box3(
    new THREE.Vector3(-VOX / 2, -VOX / 2, -VOX / 2),
    new THREE.Vector3((w - 1) * VOX + VOX / 2, (h - 1) * VOX + VOX / 2, (d - 1) * VOX + VOX / 2),
  );
}

function bakeScene(group, opts = {}) {
  const scene = new THREE.Scene();
  scene.background = null;

  const hemi = new THREE.HemisphereLight("#dceaff", "#4a5a32", 0.68);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight("#fff6df", 1.55);
  sun.position.set(5.5, 8.5, 4);
  sun.castShadow = !opts.noShadow;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  scene.add(new THREE.AmbientLight("#ffffff", 0.2));

  scene.add(group);

  const box = opts.forceBox ?? new THREE.Box3().setFromObject(group);

  // shadow-catcher only (invisible except for the shadow it receives)
  if (!opts.noShadow) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.32 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(size.x * 4 + 2, size.z * 4 + 2), shadowMat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = box.min.y - 0.001;
    plane.receiveShadow = true;
    scene.add(plane);
  }

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  const camDist = 30;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
  // ~31° elevation — closer to the 2:1 iso ground grid, more "street level" drama
  camera.position.set(center.x + camDist, center.y + camDist * 0.86, center.z + camDist);
  camera.lookAt(center.x, center.y + size.y * 0.42, center.z);

  // fit the ortho frustum tightly to the shape's projected bounds by
  // sampling the 8 bbox corners in camera space.
  camera.updateMatrixWorld();
  const inv = camera.matrixWorldInverse.clone();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const corners = [
    [box.min.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.min.z],
    [box.min.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.min.z],
    [box.min.x, box.min.y, box.max.z], [box.max.x, box.min.y, box.max.z],
    [box.min.x, box.max.y, box.max.z], [box.max.x, box.max.y, box.max.z],
  ];
  for (const [x, y, z] of corners) {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(inv);
    minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const pad = 0.06 * Math.max(maxX - minX, maxY - minY, 0.5);
  minX -= pad; maxX += pad; minY -= pad; maxY += pad;
  camera.left = minX; camera.right = maxX; camera.top = maxY; camera.bottom = minY;
  camera.updateProjectionMatrix();

  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const scale = MAX_PX / Math.max(spanX, spanY, 0.001);
  let pxW = Math.max(8, Math.round(spanX * scale));
  let pxH = Math.max(8, Math.round(spanY * scale));
  pxW = Math.min(pxW, MAX_PX);
  pxH = Math.min(pxH, MAX_PX);

  renderer.setSize(pxW, pxH, false);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  // The camera frustum above is padded symmetrically on all four sides, so
  // the baked image always has some transparent margin below the shape's
  // true ground-contact silhouette too. If callers assume the image's
  // bottom-most pixel row IS the ground line, the sprite appears to float.
  // Scan the actual rendered alpha channel to find how many empty rows sit
  // below the real content, so callers can compensate.
  const readCanvas = document.createElement("canvas");
  readCanvas.width = pxW;
  readCanvas.height = pxH;
  const rctx = readCanvas.getContext("2d");
  rctx.drawImage(renderer.domElement, 0, 0, pxW, pxH);
  const pixels = rctx.getImageData(0, 0, pxW, pxH).data;
  let lowestOpaqueRow = -1;
  for (let y = pxH - 1; y >= 0 && lowestOpaqueRow < 0; y--) {
    for (let x = 0; x < pxW; x++) {
      if (pixels[(y * pxW + x) * 4 + 3] > 10) {
        lowestOpaqueRow = y;
        break;
      }
    }
  }
  const groundInset = lowestOpaqueRow >= 0 ? pxH - 1 - lowestOpaqueRow : 0;

  return { dataUrl, pxW, pxH, groundInset, w: size.x / VOX, d: size.z / VOX, h: size.y / VOX };
}

// ---------------------------------------------------------------------------
// Wonder primitives — low-poly (not per-voxel) 3D shapes for the big one-off
// landmarks, built from cones/cylinders/spheres/boxes so they read as
// recognisable large-scale silhouettes without hand-placing hundreds of cubes.
// ---------------------------------------------------------------------------
function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.roughness ?? 0.75, metalness: opts.metalness ?? 0.05 });
}
function addBox(group, x, y, z, w, h, d, color, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, opts));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}
function addCyl(group, x, y, z, rTop, rBot, h, color, opts) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 12), mat(color, opts));
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}
function addCone(group, x, y, z, r, h, color, opts) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), mat(color, opts));
  m.position.set(x, y + h / 2, z);
  m.rotation.y = Math.PI / 4;
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}
function addSphereCap(group, x, y, z, r, color, opts) {
  const geo = new THREE.SphereGeometry(r, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const m = new THREE.Mesh(geo, mat(color, opts));
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  group.add(m);
  return m;
}

const WONDER_BUILDERS = {
  "sun-tomb": () => {
    const g = new THREE.Group();
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const f = 1 - i / steps;
      addBox(g, 0, i * 0.85, 0, 4.6 * f, 0.9, 4.6 * f, "#d8c48c");
    }
    return g;
  },
  "standing-stones": () => {
    const g = new THREE.Group();
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      addBox(g, Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4, 0.5, 2.6, 0.5, "#9a948a");
    }
    return g;
  },
  "sky-stair": () => {
    const g = new THREE.Group();
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      const f = 1 - i / steps;
      addBox(g, 0, i * 1.0, 0, 5.2 * f, 1.1, 4 * f, "#c2a878");
    }
    return g;
  },
  colonnade: () => {
    const g = new THREE.Group();
    addBox(g, 0, 0, 0, 6.5, 0.6, 4.5, "#e6e0d2");
    for (let i = -3; i <= 3; i++) addCyl(g, (i / 3) * 2.8, 0.6, -1.8, 0.22, 0.22, 2.4, "#efe9da");
    for (let i = -3; i <= 3; i++) addCyl(g, (i / 3) * 2.8, 0.6, 1.8, 0.22, 0.22, 2.4, "#efe9da");
    addBox(g, 0, 3.0, 0, 7, 0.5, 5, "#cfc7b0");
    addCone(g, 0, 3.5, 0, 3.4, 1.5, "#cfc7b0");
    return g;
  },
  "endless-wall": () => {
    const g = new THREE.Group();
    for (let i = -3; i <= 3; i++) addBox(g, i * 1.1, 0, 0, 1.0, 1.6 + Math.abs(i) * 0.12, 1.0, "#9c8f74");
    return g;
  },
  "grand-arena": () => {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const f = 1 - i * 0.22;
      addCyl(g, 0, i * 0.9, 0, 2.6 * f, 2.7 * f, 0.9, "#cdbfa0");
    }
    return g;
  },
  "great-cathedral": () => {
    const g = new THREE.Group();
    addBox(g, 0, 0, 0, 3.4, 3.2, 4.2, "#b8b0a2");
    addCone(g, 0, 3.2, 0, 2.6, 1.6, "#8a4a2e");
    addBox(g, 0, 4.6, 0, 0.7, 3.4, 0.7, "#7a6e8e");
    addCone(g, 0, 8.0, 0, 0.8, 1.2, "#5a4e6e");
    return g;
  },
  "domed-basilica": () => {
    const g = new THREE.Group();
    addCyl(g, 0, 0, 0, 2.6, 2.8, 2.4, "#e8e2d4");
    addSphereCap(g, 0, 2.4, 0, 2.3, "#cfb87a");
    addCyl(g, 0, 4.6, 0, 0.15, 0.15, 0.8, "#8a7040");
    return g;
  },
  "crystal-hall": () => {
    const g = new THREE.Group();
    addBox(g, 0, 0, 0, 7, 2.6, 3.4, "#bfd0dc", { metalness: 0.3, roughness: 0.25 });
    addCyl(g, 0, 2.6, 0, 1.7, 1.7, 0.1, "#bfd0dc");
    return g;
  },
  "iron-spire": () => {
    const g = new THREE.Group();
    addCyl(g, 0, 0, 0, 1.6, 2.6, 2.0, "#8a7a5a", { metalness: 0.4 });
    addCyl(g, 0, 2.0, 0, 0.9, 1.6, 2.0, "#8a7a5a", { metalness: 0.4 });
    addCyl(g, 0, 4.0, 0, 0.4, 0.9, 2.2, "#8a7a5a", { metalness: 0.4 });
    addCyl(g, 0, 6.2, 0, 0.08, 0.4, 1.6, "#8a7a5a", { metalness: 0.4 });
    return g;
  },
  "world-skyport": () => {
    const g = new THREE.Group();
    addBox(g, 0, 0, 0, 8, 1.4, 4, "#cfd8e0", { metalness: 0.2, roughness: 0.3 });
    addBox(g, 0, 1.4, 0, 7.4, 0.6, 3.6, "#a8c0d0", { metalness: 0.3, roughness: 0.2 });
    return g;
  },
  "launch-spire": () => {
    const g = new THREE.Group();
    addBox(g, -1.6, 0, 0, 0.5, 6, 0.5, "#9aa2ae");
    addBox(g, 1.6, 0, 0, 0.5, 6, 0.5, "#9aa2ae");
    addCyl(g, 0, 0, 0, 0.55, 0.55, 5.6, "#eef2f5");
    addCone(g, 0, 5.6, 0, 0.55, 1.1, "#d05a4a");
    return g;
  },
  "arcology-core": () => {
    const g = new THREE.Group();
    const geo = new THREE.OctahedronGeometry(2.6, 0);
    const m = new THREE.Mesh(geo, mat("#7a4ac0", { metalness: 0.3, roughness: 0.3 }));
    m.position.y = 2.6;
    m.castShadow = true; m.receiveShadow = true;
    g.add(m);
    return g;
  },
};

// ---------------------------------------------------------------------------
// Catalogue assembly
// ---------------------------------------------------------------------------
const results = [];

function pushResult(entry) {
  results.push(entry);
}

function bakeSingle(structure, recipeFn, variants = 2) {
  for (let v = 0; v < variants; v++) {
    for (const tall of [false, true]) {
      const seed = mulberry(structure.charCodeAt(0) * 7919 + v * 101 + (tall ? 1 : 0))() * 1e9 | 0;
      const model = recipeFn(seed, tall);
      const group = buildVoxelGroup(model.cells, PALETTE);
      const baked = bakeScene(group);
      const id = `${structure}-v${v}-${tall ? "tall" : "short"}`;
      pushResult({ id, kind: "building-single", structure, variant: v, tall, ...baked });
    }
  }
}

bakeSingle("hut", hutRecipe, 3);
bakeSingle("temple", templeRecipe);
bakeSingle("keep", keepRecipe);
bakeSingle("manor", manorRecipe, 3);
bakeSingle("factory", factoryRecipe);
// dome only has one height bucket in the sim (era8 floors 2-3), bake 2 variants
for (let v = 0; v < 2; v++) {
  const seed = (7000 + v * 131) >>> 0;
  const model = domeRecipe(seed);
  const group = buildVoxelGroup(model.cells, PALETTE);
  const baked = bakeScene(group);
  pushResult({ id: `dome-v${v}-short`, kind: "building-single", structure: "dome", variant: v, tall: false, ...baked });
}

// Towers/arcologies are baked whole at a handful of discrete floor-count
// buckets spanning what floorsFor() actually produces for their eras, so the
// game can just pick the closest bucket the way it already does for the
// short/tall single buildings — no runtime stacking, no repeat artefacts.
function bakeTower(structure, recipeFn, glowFn, buckets, variants = 2) {
  for (let v = 0; v < variants; v++) {
    for (const floors of buckets) {
      const seed = (structure.charCodeAt(0) * 5051 + v * 271 + floors * 131) >>> 0;
      const model = recipeFn(seed, floors);
      const sharedBox = analyticBox(model.w, model.d, model.h);

      const group = buildVoxelGroup(model.cells, PALETTE);
      const baked = bakeScene(group, { forceBox: sharedBox });
      pushResult({ id: `${structure}-v${v}-f${floors}`, kind: "building-single", structure, variant: v, floors, ...baked });

      const glowModel = glowFn(seed, floors, model.w, model.d);
      const glowGroup = buildVoxelGroup(glowModel.cells, PALETTE);
      const glowBaked = bakeScene(glowGroup, { noShadow: true, forceBox: sharedBox });
      // body and glow share the identical forced camera frame, so a given
      // world-space ground line maps to the same pixel row in both — but the
      // glow mask's own lit pixels rarely reach that low (ground-floor
      // windows are often unlit), so its own alpha scan finds the wrong,
      // much higher "bottom". Reuse the body's groundInset instead.
      pushResult({ id: `${structure}-v${v}-f${floors}-glow`, kind: "building-glow", structure, variant: v, floors, ...glowBaked, groundInset: baked.groundInset });
    }
  }
}

bakeTower("tower", towerWholeRecipe, towerWholeGlow, [4, 6, 9, 13]);
bakeTower("arcology", arcologyWholeRecipe, arcologyWholeGlow, [6, 9, 12, 16]);

for (const [wonderId, builder] of Object.entries(WONDER_BUILDERS)) {
  const group = builder();
  const baked = bakeScene(group);
  pushResult({ id: `wonder-${wonderId}`, kind: "wonder", wonderId, ...baked });
}

// props — trees, wells, fences, lamps, market stalls, farm plots, boats…
// the set dressing that turns "buildings on tiles" into a lived-in place.
for (const [name, fn] of Object.entries(PROP_RECIPES)) {
  const model = fn((name.charCodeAt(0) * 2749 + name.length * 97) >>> 0);
  const group = buildVoxelGroup(model.cells, PALETTE);
  const baked = bakeScene(group);
  pushResult({ id: `prop-${name}`, kind: "prop", structure: name, ...baked });
}

globalThis.__BAKE_RESULT__ = results;
globalThis.__BAKE_DONE__ = true;
