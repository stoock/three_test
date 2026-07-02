// Voxel recipe generators — the "art assets" of the game, expressed as data.
// One unit = one VOX cube (see bake-runtime). These are modelled the way a
// voxel artist works in MagicaVoxel: 20-30 voxel footprints, real openings
// (inset windows/doors), overhanging eaves, timber framing, plinths, chimney
// caps, per-voxel colour dithering — NOT "a box with a triangle on top".

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

// ---------------------------------------------------------------------------
// Palette: shaded materials (3 tones each, dithered per voxel) + solid colours
// ---------------------------------------------------------------------------
const SHADES = {
  plaster: ["#ece1c6", "#e2d5b6", "#d6c8a5"],
  timber: ["#54371e", "#4a3019", "#5f4226"],
  thatch: ["#d2a94e", "#c39a40", "#b28a36"],
  thatchDk: ["#8f6c28", "#84621f", "#9a7630"],
  roofTile: ["#b45036", "#a4462e", "#c05a3e"],
  slate: ["#5a6474", "#4e5866", "#67717f"],
  stone: ["#a9a294", "#9c9587", "#b4ac9e"],
  stoneDk: ["#7e786c", "#726c60", "#8a8477"],
  brick: ["#9e4a34", "#8e422e", "#ab553d"],
  wood: ["#8a6238", "#7b5730", "#976d41"],
  woodDk: ["#5f4326", "#533a20", "#6b4f2f"],
  soil: ["#6f5233", "#63482b", "#7b5c3b"],
  crop: ["#6fae3d", "#7fbf4a", "#5f9c34"],
  leaf: ["#4e8f3a", "#59a344", "#427c30"],
  leafDk: ["#3a6e2c", "#346326", "#427a33"],
  metal: ["#aab2be", "#9ea6b2", "#b6bec9"],
  metalDk: ["#6e7682", "#636b76", "#7a828e"],
  glassCur: ["#7fb2d8", "#6fa3cc", "#8fc0e2"],
  neon: ["#7e6fc8", "#7263c0", "#8a7bd4"],
};
const SOLID = {
  glass: "#20303e",
  glassLit: "#ffd98a",
  trim: "#f2ead8",
  door: "#4a3018",
  glowWhite: "#ffffff",
  canvasR: "#c04a3a",
  canvasW: "#ece2d2",
  hay: "#d8b855",
};

export const FLAT_PALETTE = { ...SOLID };
for (const [name, arr] of Object.entries(SHADES)) {
  arr.forEach((hex, i) => (FLAT_PALETTE[name + i] = hex));
}

const pk = (m, r) => m + ((r() * 3) | 0); // dithered shaded material id
const put = (c, x, y, z, m) => c.push([x, y, z, m]);

function fillBox(cells, r, x0, x1, y0, y1, z0, z1, mat, dither = true) {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) put(cells, x, y, z, dither ? pk(mat, r) : mat);
}

// Gable roof: ridge along X (slopes descend in ±Z) or along Z. 1-voxel slabs,
// 2 thick per layer so the top is fully covered; overhanging eaves; darker
// ridge cap. Returns the y of the ridge top.
function gableRoof(cells, r, x0, x1, z0, z1, yBase, mat, ridgeMat, alongX, pitch = 1) {
  if (alongX) {
    const dd = z1 - z0 + 1;
    const peak = Math.ceil(dd / (2 * pitch));
    let y = yBase;
    for (let s = 0; s < peak; s++) {
      y = yBase + s;
      const za = z0 + s * pitch;
      const zb = z1 - s * pitch;
      if (zb - za <= 2 * pitch) {
        for (let x = x0; x <= x1; x++) for (let z = za; z <= zb; z++) put(cells, x, y, z, pk(ridgeMat, r));
        return y;
      }
      for (let x = x0; x <= x1; x++) {
        for (let t = 0; t <= pitch; t++) {
          put(cells, x, y, za + t, pk(mat, r));
          put(cells, x, y, zb - t, pk(mat, r));
        }
      }
    }
    return y;
  } else {
    const ww = x1 - x0 + 1;
    const peak = Math.ceil(ww / (2 * pitch));
    let y = yBase;
    for (let s = 0; s < peak; s++) {
      y = yBase + s;
      const xa = x0 + s * pitch;
      const xb = x1 - s * pitch;
      if (xb - xa <= 2 * pitch) {
        for (let z = z0; z <= z1; z++) for (let x = xa; x <= xb; x++) put(cells, x, y, z, pk(ridgeMat, r));
        return y;
      }
      for (let z = z0; z <= z1; z++) {
        for (let t = 0; t <= pitch; t++) {
          put(cells, xa + t, y, z, pk(mat, r));
          put(cells, xb - t, y, z, pk(mat, r));
        }
      }
    }
    return y;
  }
}

// Pyramid (hipped) roof: shrinks 1/side per layer. Solid layers (cheap, small).
function pyramidRoof(cells, r, x0, x1, z0, z1, yBase, mat) {
  let s = 0;
  let y = yBase;
  while (x1 - x0 - 2 * s >= 0 && z1 - z0 - 2 * s >= 0) {
    y = yBase + s;
    fillBox(cells, r, x0 + s, x1 - s, y, y, z0 + s, z1 - s, mat);
    s++;
  }
  return y;
}

// ---------------------------------------------------------------------------
// COTTAGE (hut) — timber-framed farmhouse: stone plinth, plaster + dark
// timber studs/beams, inset door + windows w/ trim, thatch roof with eaves
// and ridge cap, chimney with a cap slab.
// ---------------------------------------------------------------------------
export function hutRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 15 + ((r() * 4) | 0); // 15-18
  const d = 11 + ((r() * 3) | 0); // 11-13
  const hw = tall ? 10 : 7; // wall top
  const cells = [];

  // stone plinth (y0-1)
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) {
      const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
      if (edge) fillBox(cells, r, x, x, 0, 1, z, z, "stone");
      else put(cells, x, 0, z, pk("stoneDk", r));
    }

  // openings on the two camera-visible faces (+x and +z)
  const doorX0 = ((w / 2) | 0) - 1;
  const door = { x0: doorX0, x1: doorX0 + 2, y0: 2, y1: 6 }; // on z = d-1
  const winZ = [
    { x0: 3, x1: 5, y0: 4, y1: 6 },
    { x0: w - 6, x1: w - 4, y0: 4, y1: 6 },
  ];
  const winX = [
    { z0: 2, z1: 4, y0: 4, y1: 6 },
    { z0: d - 5, z1: d - 3, y0: 4, y1: 6 },
  ];
  const inRect = (v, y, o) => v >= (o.x0 ?? o.z0) && v <= (o.x1 ?? o.z1) && y >= o.y0 && y <= o.y1;
  const onFrame = (v, y, o) =>
    v >= (o.x0 ?? o.z0) - 1 && v <= (o.x1 ?? o.z1) + 1 && y >= o.y0 - 1 && y <= o.y1 + 1 && !inRect(v, y, o);

  // walls y2..hw
  for (let y = 2; y <= hw; y++) {
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
        if (!edge) continue;
        let mat = null;
        const isFront = z === d - 1;
        const isSide = x === w - 1;
        // openings (holes) on visible faces
        if (isFront && (inRect(x, y, door) || winZ.some((o) => inRect(x, y, o)))) continue;
        if (isSide && winX.some((o) => inRect(z, y, o))) continue;
        // trim frames
        if (isFront && (onFrame(x, y, door) || winZ.some((o) => onFrame(x, y, o)))) mat = "trim";
        else if (isSide && winX.some((o) => onFrame(z, y, o))) mat = "trim";
        // timber framing: corners, top/bottom beams, studs every 4
        else if (
          x === 0 || x === w - 1 ? z === 0 || z === d - 1 : false // corner posts
        )
          mat = "timber";
        else if (y === 2 || y === hw) mat = "timber";
        else if ((isFront || z === 0) && x % 4 === 0) mat = "timber";
        else if ((isSide || x === 0) && z % 4 === 0) mat = "timber";
        else mat = "plaster";
        put(cells, x, y, z, mat === "trim" ? "trim" : pk(mat, r));
      }
  }

  // inset glass / door (1 voxel deep)
  for (const o of winZ)
    for (let x = o.x0; x <= o.x1; x++)
      for (let y = o.y0; y <= o.y1; y++) put(cells, x, y, d - 2, r() < 0.35 ? "glassLit" : "glass");
  for (const o of winX)
    for (let z = o.z0; z <= o.z1; z++)
      for (let y = o.y0; y <= o.y1; y++) put(cells, w - 2, y, z, r() < 0.35 ? "glassLit" : "glass");
  for (let x = door.x0; x <= door.x1; x++)
    for (let y = door.y0; y <= door.y1; y++) put(cells, x, y, d - 2, "door");
  // stone doorstep
  fillBox(cells, r, door.x0 - 1, door.x1 + 1, 1, 1, d, d, "stone");

  // thatch roof, ridge along X, eaves overhang 2 in z / 1 in x
  const ridgeY = gableRoof(cells, r, -1, w, -2, d + 1, hw + 1, "thatch", "thatchDk", true);
  // gable walls (triangles) at x=0 and x=w-1
  const peak = Math.ceil((d + 4) / 2);
  for (let s = 1; s < peak; s++) {
    const za = -2 + s;
    const zb = d + 1 - s;
    if (zb <= za) break;
    for (let z = Math.max(0, za); z <= Math.min(d - 1, zb); z++) {
      put(cells, 0, hw + s, z, pk("plaster", r));
      put(cells, w - 1, hw + s, z, pk("plaster", r));
    }
  }

  // chimney + cap
  const cx = 3 + ((r() * (w - 8)) | 0);
  fillBox(cells, r, cx, cx + 1, hw, ridgeY + 2, 1, 2, "stoneDk");
  fillBox(cells, r, cx - 1, cx + 2, ridgeY + 3, ridgeY + 3, 0, 3, "stone");

  return { cells, w, d, h: ridgeY + 4 };
}

// ---------------------------------------------------------------------------
// TEMPLE — stepped stone base, real colonnade with capitals, cella behind,
// architrave + shallow pediment with trim frieze.
// ---------------------------------------------------------------------------
export function templeRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 20 + ((r() * 4) | 0);
  const d = 13 + ((r() * 2) | 0);
  const hc = tall ? 13 : 11; // column height — classical proportions need tall shafts
  const cells = [];

  // 3-step base
  fillBox(cells, r, 0, w - 1, 0, 0, 0, d - 1, "stone");
  fillBox(cells, r, 1, w - 2, 1, 1, 1, d - 2, "stone");
  fillBox(cells, r, 2, w - 3, 2, 2, 2, d - 3, "stoneDk");

  // colonnade: front (+z) and back rows
  const colY0 = 3;
  const colTop = colY0 + hc;
  for (let cx = 3; cx <= w - 5; cx += 4) {
    for (const cz of [3, d - 5]) {
      fillBox(cells, r, cx, cx + 1, colY0 + 1, colTop - 2, cz, cz + 1, "trim", false);
      // capital + base blocks
      fillBox(cells, r, cx - 1, cx + 2, colTop - 1, colTop - 1, cz - 1, cz + 2, "stone");
      fillBox(cells, r, cx - 1, cx + 2, colY0, colY0, cz - 1, cz + 2, "stone");
    }
  }
  // cella (inner sanctum) — dark, recessed so the white shafts pop
  fillBox(cells, r, 6, w - 7, colY0, colTop - 1, 6, d - 8, "stoneDk");

  // thin architrave + frieze dots
  fillBox(cells, r, 1, w - 2, colTop, colTop, 1, d - 2, "stone");
  for (let x = 2; x < w - 2; x += 2) put(cells, x, colTop, d - 2, "trim");

  // shallow pediment, ridge along X
  const ridgeY = gableRoof(cells, r, 0, w - 1, 1, d - 2, colTop + 1, "stone", "stoneDk", true, 2);

  return { cells, w, d, h: ridgeY + 1 };
}

// ---------------------------------------------------------------------------
// KEEP — curtain wall with proper merlons, corner towers with caps, central
// keep with slate pyramid roof, arched gate + arrow slits.
// ---------------------------------------------------------------------------
export function keepRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 19 + ((r() * 3) | 0);
  const d = 19 + ((r() * 3) | 0);
  const hWall = tall ? 8 : 6;
  const cells = [];

  // curtain wall ring (2 thick), with the gate opening carved on the +z face
  const gx = (w / 2) | 0;
  const inGate = (x, y, z) => z >= d - 2 && x >= gx - 2 && x <= gx + 2 && y <= 4;
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) {
      const edge = x <= 1 || x >= w - 2 || z <= 1 || z >= d - 2;
      const outer = x === 0 || x === w - 1 || z === 0 || z === d - 1;
      if (!edge) continue;
      for (let y = 0; y <= hWall; y++) {
        if (inGate(x, y, z)) continue;
        put(cells, x, y, z, pk(outer ? "stone" : "stoneDk", r));
      }
    }
  // merlons along outer top edge
  for (let x = 0; x < w; x++) {
    if (x % 3 !== 2) {
      put(cells, x, hWall + 1, 0, pk("stone", r));
      put(cells, x, hWall + 1, d - 1, pk("stone", r));
    }
  }
  for (let z = 0; z < d; z++) {
    if (z % 3 !== 2) {
      put(cells, 0, hWall + 1, z, pk("stone", r));
      put(cells, w - 1, hWall + 1, z, pk("stone", r));
    }
  }

  // corner towers (5×5, taller, with caps + merlons)
  const hTower = hWall + 4;
  for (const [tx, tz] of [
    [0, 0],
    [w - 5, 0],
    [0, d - 5],
    [w - 5, d - 5],
  ]) {
    fillBox(cells, r, tx, tx + 4, 0, hTower, tz, tz + 4, "stoneDk");
    for (let i = 0; i < 5; i++) {
      if (i % 2 === 0) {
        put(cells, tx + i, hTower + 1, tz, pk("stone", r));
        put(cells, tx + i, hTower + 1, tz + 4, pk("stone", r));
        put(cells, tx, hTower + 1, tz + i, pk("stone", r));
        put(cells, tx + 4, hTower + 1, tz + i, pk("stone", r));
      }
    }
    // arrow slits on visible faces
    put(cells, tx + 4, hWall - 2, tz + 2, "glass");
    put(cells, tx + 4, hWall - 3, tz + 2, "glass");
    put(cells, tx + 2, hWall - 2, tz + 4, "glass");
    put(cells, tx + 2, hWall - 3, tz + 4, "glass");
  }

  // recessed wooden gate + arch band above the opening
  for (let x = gx - 2; x <= gx + 2; x++) for (let y = 0; y <= 4; y++) put(cells, x, y, d - 3, "door");
  fillBox(cells, r, gx - 3, gx + 3, 5, 6, d - 1, d - 1, "stoneDk");

  // central keep + slate pyramid
  const kx0 = ((w - 9) / 2) | 0;
  const kz0 = ((d - 9) / 2) | 0;
  const hKeep = hWall + 6;
  fillBox(cells, r, kx0, kx0 + 8, 0, hKeep, kz0, kz0 + 8, "stone");
  // keep windows (slits) on visible faces
  for (const yy of [hKeep - 3, hKeep - 6]) {
    put(cells, kx0 + 8, yy, kz0 + 4, "glassLit");
    put(cells, kx0 + 8, yy - 1, kz0 + 4, "glass");
    put(cells, kx0 + 4, yy, kz0 + 8, "glassLit");
    put(cells, kx0 + 4, yy - 1, kz0 + 8, "glass");
  }
  const ry = pyramidRoof(cells, r, kx0 - 1, kx0 + 9, kz0 - 1, kz0 + 9, hKeep + 1, "slate");
  // banner pole
  fillBox(cells, r, kx0 + 4, kx0 + 4, ry + 1, ry + 4, kz0 + 4, kz0 + 4, "timber");
  put(cells, kx0 + 5, ry + 4, kz0 + 4, "canvasR");
  put(cells, kx0 + 6, ry + 4, kz0 + 4, "canvasR");
  put(cells, kx0 + 5, ry + 3, kz0 + 4, "canvasR");

  return { cells, w, d, h: ry + 5 };
}

// ---------------------------------------------------------------------------
// MANOR — two-storey townhouse: brick ground floor, timbered plaster upper,
// cross-gabled tile roof with a dormer, twin chimneys, porch over the door.
// ---------------------------------------------------------------------------
export function manorRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 18 + ((r() * 4) | 0);
  const d = 12 + ((r() * 2) | 0);
  const h1 = 6; // brick ground floor top
  const h2 = tall ? 12 : 10; // upper wall top
  const cells = [];

  const doorX0 = ((w / 2) | 0) - 1;
  const door = { x0: doorX0, x1: doorX0 + 2, y0: 1, y1: 5 };
  const winG = [
    { x0: 3, x1: 5, y0: 2, y1: 4 },
    { x0: w - 6, x1: w - 4, y0: 2, y1: 4 },
  ];
  const winU = [
    { x0: 3, x1: 5, y0: h1 + 2, y1: h1 + 4 },
    { x0: doorX0, x1: doorX0 + 2, y0: h1 + 2, y1: h1 + 4 },
    { x0: w - 6, x1: w - 4, y0: h1 + 2, y1: h1 + 4 },
  ];
  const winSide = [
    { z0: 3, z1: 5, y0: h1 + 2, y1: h1 + 4 },
    { z0: d - 6, z1: d - 4, y0: 2, y1: 4 },
  ];
  const inR = (v, y, o) => v >= (o.x0 ?? o.z0) && v <= (o.x1 ?? o.z1) && y >= o.y0 && y <= o.y1;
  const onF = (v, y, o) =>
    v >= (o.x0 ?? o.z0) - 1 && v <= (o.x1 ?? o.z1) + 1 && y >= o.y0 - 1 && y <= o.y1 + 1 && !inR(v, y, o);

  for (let y = 0; y <= h2; y++) {
    const upper = y > h1;
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
        if (!edge) continue;
        const front = z === d - 1;
        const side = x === w - 1;
        if (front && (inR(x, y, door) || winG.some((o) => inR(x, y, o)) || winU.some((o) => inR(x, y, o)))) continue;
        if (side && winSide.some((o) => inR(z, y, o))) continue;
        let mat;
        if (front && (onF(x, y, door) || winG.some((o) => onF(x, y, o)) || winU.some((o) => onF(x, y, o)))) mat = "trim";
        else if (side && winSide.some((o) => onF(z, y, o))) mat = "trim";
        else if (!upper) mat = pk("brick", r);
        else if (y === h1 + 1 || y === h2) mat = pk("timber", r);
        else if ((front || z === 0) && (x % 5 === 0 || x === w - 1)) mat = pk("timber", r);
        else if ((side || x === 0) && z % 5 === 0) mat = pk("timber", r);
        else mat = pk("plaster", r);
        put(cells, x, y, z, mat);
      }
  }
  // glass + door insets
  for (const o of [...winG, ...winU])
    for (let x = o.x0; x <= o.x1; x++)
      for (let y = o.y0; y <= o.y1; y++) put(cells, x, y, d - 2, r() < 0.4 ? "glassLit" : "glass");
  for (const o of winSide)
    for (let z = o.z0; z <= o.z1; z++)
      for (let y = o.y0; y <= o.y1; y++) put(cells, w - 2, y, z, r() < 0.4 ? "glassLit" : "glass");
  for (let x = door.x0; x <= door.x1; x++) for (let y = door.y0; y <= door.y1; y++) put(cells, x, y, d - 2, "door");

  // porch roof over the door (small tile slab on posts)
  fillBox(cells, r, door.x0 - 2, door.x1 + 2, door.y1 + 1, door.y1 + 1, d - 1, d + 1, "roofTile");
  fillBox(cells, r, door.x0 - 2, door.x0 - 2, 0, door.y1, d + 1, d + 1, "timber");
  fillBox(cells, r, door.x1 + 2, door.x1 + 2, 0, door.y1, d + 1, d + 1, "timber");

  // main tile roof (ridge along X) + dormer on the visible slope
  const ridgeY = gableRoof(cells, r, -1, w, -2, d + 1, h2 + 1, "roofTile", "woodDk", true);
  for (let s = 1; s < Math.ceil((d + 4) / 2); s++) {
    const za = -2 + s;
    const zb = d + 1 - s;
    if (zb <= za) break;
    for (let z = Math.max(0, za); z <= Math.min(d - 1, zb); z++) {
      put(cells, 0, h2 + s, z, pk("plaster", r));
      put(cells, w - 1, h2 + s, z, pk("plaster", r));
    }
  }
  // dormer: small box + mini gable poking out of the +z slope
  const dx = 4 + ((r() * (w - 10)) | 0);
  fillBox(cells, r, dx, dx + 3, h2 + 1, h2 + 4, d - 1, d + 0, "plaster");
  fillBox(cells, r, dx + 1, dx + 2, h2 + 2, h2 + 3, d + 0, d + 0, "glassLit", false);
  fillBox(cells, r, dx - 1, dx + 4, h2 + 5, h2 + 5, d - 2, d + 1, "roofTile");

  // twin brick chimneys with caps
  for (const cx of [2, w - 4]) {
    fillBox(cells, r, cx, cx + 1, h2, ridgeY + 3, 2, 3, "brick");
    fillBox(cells, r, cx - 1, cx + 2, ridgeY + 4, ridgeY + 4, 1, 4, "stoneDk");
  }

  return { cells, w, d, h: ridgeY + 5 };
}

// ---------------------------------------------------------------------------
// FACTORY — long brick shed with sawtooth roof, arched windows, tall round
// chimney with cap ring, loading dock door.
// ---------------------------------------------------------------------------
export function factoryRecipe(seed, tall) {
  const r = mulberry(seed);
  const w = 24 + ((r() * 4) | 0);
  const d = 14 + ((r() * 2) | 0);
  const hw = tall ? 9 : 7;
  const cells = [];

  // brick shell with stone base course
  for (let y = 0; y <= hw; y++)
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
        if (!edge) continue;
        put(cells, x, y, z, y === 0 ? pk("stoneDk", r) : pk("brick", r));
      }

  // arched windows applied onto the +z face: a trim frame patch on the wall
  // plane with glass one voxel proud — reads as a framed, glazed opening.
  const nw = ((w - 6) / 6) | 0;
  for (let k = 0; k < nw; k++) {
    const x0 = 3 + k * 6;
    fillBox(cells, r, x0 - 1, x0 + 3, 1, 5, d - 1, d - 1, "trim", false); // frame patch
    for (let x = x0; x <= x0 + 2; x++)
      for (let y = 2; y <= 4; y++) put(cells, x, y, d, r() < 0.3 ? "glassLit" : "glass");
    put(cells, x0 + 1, 5, d, "glass"); // arch center
  }
  // loading door on +x face
  fillBox(cells, r, w - 1, w - 1, 1, 5, 4, 8, "trim", false);
  fillBox(cells, r, w, w, 1, 4, 5, 7, "door", false);

  // sawtooth roof: teeth along x, vertical glass faces toward +x
  const teethW = 6;
  const teeth = (w / teethW) | 0;
  for (let k = 0; k < teeth; k++) {
    const xs = k * teethW;
    for (let i = 0; i < teethW && xs + i < w; i++) {
      const y = hw + 1 + ((i / 2) | 0);
      fillBox(cells, r, xs + i, xs + i, y, y, 0, d - 1, "metalDk");
      if (i === teethW - 1) {
        // vertical glass face
        for (let yy = hw + 1; yy <= y; yy++)
          for (let z = 1; z < d - 1; z++) put(cells, xs + i, yy, z, "glassCur0");
      }
    }
  }

  // tall chimney (3×3 with cut corners → round-ish) + cap ring + rim
  const cx = w - 5;
  const chH = hw + 12;
  for (let y = 0; y <= chH; y++)
    for (let x = cx; x <= cx + 2; x++)
      for (let z = 2; z <= 4; z++) {
        if ((x === cx || x === cx + 2) && (z === 2 || z === 4) && y > 2) continue; // cut corners
        put(cells, x, y, z, pk("brick", r));
      }
  fillBox(cells, r, cx - 1, cx + 3, chH + 1, chH + 1, 1, 5, "stoneDk");
  fillBox(cells, r, cx, cx + 2, chH + 2, chH + 2, 2, 4, "stoneDk");

  return { cells, w, d, h: chH + 3 };
}

// ---------------------------------------------------------------------------
// DOME — rounded metal base, panelled hemisphere with meridian lines and a
// glowing equator ring, airlock tunnel.
// ---------------------------------------------------------------------------
export function domeRecipe(seed) {
  const r = mulberry(seed);
  const R = 8 + ((r() * 2) | 0);
  const w = R * 2 + 3;
  const d = w;
  const cxc = (w - 1) / 2;
  const czc = (d - 1) / 2;
  const hBase = 3;
  const cells = [];

  // base drum (rounded square)
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) {
      const dist = Math.hypot(x - cxc, z - czc);
      if (dist <= R + 1 && dist > R - 1.4) fillBox(cells, r, x, x, 0, hBase, z, z, "metal");
      else if (dist <= R - 1.4) put(cells, x, 0, z, pk("metalDk", r));
    }
  // hemisphere shell with meridian panel lines
  for (let y = 0; y <= R; y++) {
    const rr = Math.sqrt(Math.max(0, R * R - y * y));
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        const dist = Math.hypot(x - cxc, z - czc);
        if (dist <= rr && dist > rr - 1.5) {
          const ang = Math.atan2(z - czc, x - cxc);
          const meridian = Math.abs(((ang * 4) / Math.PI) % 1) < 0.12;
          put(cells, x, hBase + 1 + y, z, meridian ? pk("metalDk", r) : pk("metal", r));
        }
      }
  }
  // glowing equator ring
  for (let x = 0; x < w; x++)
    for (let z = 0; z < d; z++) {
      const dist = Math.hypot(x - cxc, z - czc);
      if (dist <= R && dist > R - 1.4) put(cells, x, hBase + 1, z, "glowWhite");
    }
  // airlock tunnel on +z
  fillBox(cells, r, cxc - 2, cxc + 2, 0, 3, d - 2, d + 1, "metalDk");
  fillBox(cells, r, cxc - 1, cxc + 1, 1, 2, d + 1, d + 1, "glass", false);

  return { cells, w, d, h: hBase + R + 2 };
}

// ---------------------------------------------------------------------------
// TOWER (modern curtain-wall high-rise) — mullion grid, spandrel bands,
// corner columns, setback crown, roof plant + antenna. Baked whole per
// floor-count bucket; each sim floor = 3 voxel rows.
// ---------------------------------------------------------------------------
function litStream(seed) {
  return mulberry(seed ^ 0x6c69746d);
}

export function towerWholeRecipe(seed, floors) {
  const r = mulberry(seed);
  const lit = litStream(seed);
  const w = 11 + ((r() * 3) | 0);
  const d = 11 + ((r() * 3) | 0);
  const H = floors * 3;
  const setbackY = Math.floor(H * 0.72);
  const cells = [];

  for (let y = 0; y <= H; y++) {
    const sb = y > setbackY ? 2 : 0;
    const x0 = sb;
    const x1 = w - 1 - sb;
    const z0 = sb;
    const z1 = d - 1 - sb;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) continue;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        let mat;
        if (corner) mat = pk("metalDk", r);
        else if (y % 3 === 0) mat = pk("metal", r); // spandrel band
        else if ((x - x0) % 3 === 0 || (z - z0) % 3 === 0) mat = pk("metal", r); // mullions
        else mat = lit() < 0.3 ? "glassLit" : pk("glassCur", r);
        put(cells, x, y, z, mat);
      }
    if (y === setbackY) fillBox(cells, r, 0, w - 1, y, y, 0, d - 1, "metalDk"); // setback terrace
  }
  // roof: slab + plant box + antenna
  fillBox(cells, r, 2, w - 3, H + 1, H + 1, 2, d - 3, "metalDk");
  fillBox(cells, r, 3, 6, H + 2, H + 3, 3, 5, "metal");
  const ax = ((w / 2) | 0);
  fillBox(cells, r, ax, ax, H + 2, H + 6, (d / 2) | 0, (d / 2) | 0, "metalDk");
  put(cells, ax, H + 7, (d / 2) | 0, "glowWhite");

  return { cells, w, d, h: H + 8 };
}

export function towerWholeGlow(seed, floors, w, d) {
  const r = mulberry(seed);
  const lit = litStream(seed);
  void r;
  const rr = mulberry(seed); // consume identically to body's r usage order
  void rr;
  // Reproduce exactly the lit cells: replicate the body loops but only emit lit
  const r2 = mulberry(seed);
  const w2 = 11 + ((r2() * 3) | 0);
  const d2 = 11 + ((r2() * 3) | 0);
  const H = floors * 3;
  const setbackY = Math.floor(H * 0.72);
  const cells = [];
  for (let y = 0; y <= H; y++) {
    const sb = y > setbackY ? 2 : 0;
    const x0 = sb;
    const x1 = w2 - 1 - sb;
    const z0 = sb;
    const z1 = d2 - 1 - sb;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) continue;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        if (corner || y % 3 === 0 || (x - x0) % 3 === 0 || (z - z0) % 3 === 0) continue;
        if (lit() < 0.3) put(cells, x, y, z, "glowWhite");
      }
  }
  put(cells, (w2 / 2) | 0, H + 7, (d2 / 2) | 0, "glowWhite");
  return { cells, w: w2, d: d2, h: H + 8 };
}

// ---------------------------------------------------------------------------
// ARCOLOGY — tiered neon monolith: three shrinking tiers, glowing corner
// strips and tier-top light bands, sparse lit cells, crown spire.
// ---------------------------------------------------------------------------
export function arcologyWholeRecipe(seed, floors) {
  const r = mulberry(seed);
  const lit = litStream(seed);
  const w = 13 + ((r() * 3) | 0);
  const d = 13 + ((r() * 3) | 0);
  const H = floors * 3;
  const t1 = Math.floor(H * 0.45);
  const t2 = Math.floor(H * 0.75);
  const cells = [];

  for (let y = 0; y <= H; y++) {
    const tier = y > t2 ? 2 : y > t1 ? 1 : 0;
    const sb = tier * 2;
    const x0 = sb;
    const x1 = w - 1 - sb;
    const z0 = sb;
    const z1 = d - 1 - sb;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) continue;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        let mat;
        if (corner) mat = y % 6 === 0 ? "glowWhite" : pk("metalDk", r); // sparse corner lights
        else if (y === t2) mat = "glowWhite"; // single light band
        else if (lit() < 0.14) mat = "glowWhite";
        else mat = pk("neon", r);
        put(cells, x, y, z, mat);
      }
    if (y === t1 || y === t2) fillBox(cells, r, x0 - 1, x1 + 1, y, y, z0 - 1, z1 + 1, "metalDk"); // terrace lips
  }
  // crown: stepped cap + short metal spire with a single glowing tip
  const cx = (w / 2) | 0;
  const cz = (d / 2) | 0;
  pyramidRoof(cells, r, cx - 3, cx + 3, cz - 3, cz + 3, H + 1, "metalDk");
  fillBox(cells, r, cx, cx, H + 3, H + 5, cz, cz, "metalDk");
  put(cells, cx, H + 6, cz, "glowWhite");

  return { cells, w, d, h: H + 7 };
}

export function arcologyWholeGlow(seed, floors, w, d) {
  const r2 = mulberry(seed);
  const lit = litStream(seed);
  const w2 = 13 + ((r2() * 3) | 0);
  const d2 = 13 + ((r2() * 3) | 0);
  const H = floors * 3;
  const t1 = Math.floor(H * 0.45);
  const t2 = Math.floor(H * 0.75);
  const cells = [];
  for (let y = 0; y <= H; y++) {
    const tier = y > t2 ? 2 : y > t1 ? 1 : 0;
    const sb = tier * 2;
    const x0 = sb;
    const x1 = w2 - 1 - sb;
    const z0 = sb;
    const z1 = d2 - 1 - sb;
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const edge = x === x0 || x === x1 || z === z0 || z === z1;
        if (!edge) continue;
        const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
        if (corner) {
          if (y % 6 === 0) put(cells, x, y, z, "glowWhite");
        } else if (y === t2) put(cells, x, y, z, "glowWhite");
        else if (lit() < 0.14) put(cells, x, y, z, "glowWhite");
      }
  }
  const cx = (w2 / 2) | 0;
  const cz = (d2 / 2) | 0;
  put(cells, cx, H + 6, cz, "glowWhite");
  return { cells, w: w2, d: d2, h: H + 7 };
}

// ---------------------------------------------------------------------------
// PROPS — the set dressing that makes tiles read as a lived-in place.
// ---------------------------------------------------------------------------
function treeA(seed) {
  const r = mulberry(seed);
  const cells = [];
  const th = 5 + ((r() * 2) | 0);
  fillBox(cells, r, 5, 6, 0, th, 5, 6, "woodDk");
  const cy = th + 3;
  const R = 4.6 + r();
  for (let x = 0; x < 12; x++)
    for (let y = th; y < th + 10; y++)
      for (let z = 0; z < 12; z++) {
        const dist = Math.hypot(x - 5.5, (y - cy) * 1.15, z - 5.5);
        if (dist <= R - 0.4 + r() * 0.9) put(cells, x, y, z, r() < 0.25 ? pk("leafDk", r) : pk("leaf", r));
      }
  return { cells, w: 12, d: 12, h: th + 10 };
}
function treeB(seed) {
  const r = mulberry(seed);
  const cells = [];
  fillBox(cells, r, 4, 5, 0, 2, 4, 5, "woodDk");
  const rings = [4, 3.4, 2.8, 2.2, 1.6, 1.0, 0.5];
  rings.forEach((rr2, i) => {
    const y = 3 + i * 2;
    for (let x = 0; x < 10; x++)
      for (let z = 0; z < 10; z++) {
        if (Math.hypot(x - 4.5, z - 4.5) <= rr2 + r() * 0.5)
          for (let yy = y; yy < y + 2; yy++) put(cells, x, yy, z, pk("leafDk", r));
      }
  });
  return { cells, w: 10, d: 10, h: 3 + rings.length * 2 };
}
function bush(seed) {
  const r = mulberry(seed);
  const cells = [];
  for (let x = 0; x < 7; x++)
    for (let y = 0; y < 5; y++)
      for (let z = 0; z < 7; z++) {
        if (Math.hypot(x - 3, (y - 1.4) * 1.3, z - 3) <= 2.7 + r() * 0.7) put(cells, x, y, z, pk("leaf", r));
      }
  return { cells, w: 7, d: 7, h: 5 };
}
function well(seed) {
  const r = mulberry(seed);
  const cells = [];
  for (let x = 0; x < 7; x++)
    for (let z = 0; z < 7; z++) {
      const edge = x === 0 || x === 6 || z === 0 || z === 6;
      if (edge && Math.hypot(x - 3, z - 3) <= 3.6) fillBox(cells, r, x, x, 0, 2, z, z, "stone");
    }
  fillBox(cells, r, 0, 0, 0, 6, 3, 3, "timber");
  fillBox(cells, r, 6, 6, 0, 6, 3, 3, "timber");
  gableRoof(cells, r, -1, 7, 1, 5, 7, "roofTile", "woodDk", false);
  return { cells, w: 7, d: 7, h: 10 };
}
function fence(seed) {
  const r = mulberry(seed);
  const cells = [];
  for (let x = 0; x < 12; x++) {
    if (x % 4 === 0) fillBox(cells, r, x, x, 0, 3, 0, 0, "woodDk");
    put(cells, x, 1, 0, pk("wood", r));
    put(cells, x, 3, 0, pk("wood", r));
  }
  return { cells, w: 12, d: 1, h: 4 };
}
function farmplot(seed) {
  const r = mulberry(seed);
  const cells = [];
  fillBox(cells, r, 0, 13, 0, 0, 0, 10, "soil");
  for (let z = 1; z <= 9; z += 2)
    for (let x = 1; x < 13; x++) {
      if (r() < 0.8) put(cells, x, 1, z, pk("crop", r));
      if (r() < 0.25) put(cells, x, 2, z, pk("crop", r));
    }
  return { cells, w: 14, d: 11, h: 3 };
}
function lamp(seed) {
  const r = mulberry(seed);
  const cells = [];
  fillBox(cells, r, 1, 3, 0, 0, 1, 3, "stoneDk");
  fillBox(cells, r, 2, 2, 1, 7, 2, 2, "woodDk");
  fillBox(cells, r, 1, 3, 8, 9, 1, 3, "glassLit", false);
  fillBox(cells, r, 1, 3, 10, 10, 1, 3, "metalDk");
  return { cells, w: 5, d: 5, h: 11 };
}
function lampNeon(seed) {
  const r = mulberry(seed);
  const cells = [];
  fillBox(cells, r, 2, 2, 0, 8, 2, 2, "metalDk");
  fillBox(cells, r, 1, 3, 9, 9, 1, 3, "glowWhite", false);
  return { cells, w: 5, d: 5, h: 10 };
}
function stall(seed) {
  const r = mulberry(seed);
  const cells = [];
  fillBox(cells, r, 0, 8, 0, 2, 4, 6, "wood"); // counter
  fillBox(cells, r, 0, 8, 1, 1, 5, 5, "hay", false); // goods hint
  for (const px2 of [0, 8]) for (const pz of [0, 6]) fillBox(cells, r, px2, px2, 0, 6, pz, pz, "woodDk");
  for (let x = -1; x <= 9; x++)
    for (let z = -1; z <= 7; z++) put(cells, x, 7, z, (x + (z % 4 < 2 ? 0 : 2)) % 4 < 2 ? "canvasR" : "canvasW");
  return { cells, w: 9, d: 7, h: 8 };
}
function crates(seed) {
  const r = mulberry(seed);
  const cells = [];
  fillBox(cells, r, 0, 3, 0, 3, 0, 3, "wood");
  fillBox(cells, r, 5, 7, 0, 2, 1, 3, "woodDk");
  fillBox(cells, r, 1, 3, 4, 6, 1, 3, "wood");
  return { cells, w: 8, d: 4, h: 7 };
}
function boat(seed) {
  const r = mulberry(seed);
  const cells = [];
  for (let x = 0; x < 11; x++) {
    const taper = x === 0 || x === 10 ? 1 : 0;
    for (let z = taper; z < 4 - taper; z++) {
      put(cells, x, 0, z, pk("wood", r));
      if (z === taper || z === 3 - taper) put(cells, x, 1, z, pk("woodDk", r));
    }
  }
  put(cells, 0, 1, 1, pk("woodDk", r));
  put(cells, 0, 1, 2, pk("woodDk", r));
  put(cells, 10, 1, 1, pk("woodDk", r));
  put(cells, 10, 1, 2, pk("woodDk", r));
  fillBox(cells, r, 4, 6, 1, 1, 1, 2, "wood"); // bench
  return { cells, w: 11, d: 4, h: 3 };
}

export const PROP_RECIPES = {
  "tree-a": treeA,
  "tree-b": treeB,
  bush,
  well,
  fence,
  farmplot,
  lamp,
  "lamp-neon": lampNeon,
  stall,
  crates,
  boat,
};
