import type { Character, Era } from "./types";
import { getEra, eraProgress } from "./eras";
import { fbm, makeRng } from "./chaos";
import { getWonder, type Wonder, type Silhouette } from "./wonders";

// ============================================================================
// Voxel / Minecraft-style isometric renderer.
// The world is built from textured cubes. Pixel-art block textures (16×16) are
// generated once and painted onto isometric cube faces via affine transforms,
// giving each material real surface detail and each era a distinct silhouette.
// ============================================================================

export const TILE_W = 32;
export const TILE_H = 16;
const HW = TILE_W / 2; // 16
const HH = TILE_H / 2; // 8
const CUBE_H = 16; // vertical height of one block (screen px, S=1)
const MAX_LAYERS = 4;
const BASE_DEPTH = 12; // thickness of the island slab below sea level
const TS = 16; // texture size in px

type AnyCanvas = HTMLCanvasElement;
type Ctx = CanvasRenderingContext2D;

function makeCanvas(w: number, h: number): { canvas: AnyCanvas; ctx: Ctx } | null {
  let canvas: AnyCanvas | OffscreenCanvas;
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    canvas = c;
  } else if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(w, h);
  } else {
    return null;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  return { canvas: canvas as AnyCanvas, ctx: ctx as unknown as Ctx };
}

export function canRenderCanvas(): boolean {
  return typeof document !== "undefined" || typeof OffscreenCanvas !== "undefined";
}

// ---------- colour ----------
function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbHex(r: number, g: number, b: number): string {
  return "#" + ((clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b)).toString(16).padStart(6, "0");
}
function mul(h: string, f: number): string {
  const [r, g, b] = hexRgb(h);
  return rgbHex(r * f, g * f, b * f);
}
function mix(a: string, b: string, t: number): string {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
function hexA(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ============================================================================
// Pixel-art texture generation (cached)
// ============================================================================
const baseTexCache = new Map<string, AnyCanvas>();
const shadeTexCache = new Map<string, AnyCanvas>();

function px(ctx: Ctx, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function buildBaseTex(name: string): AnyCanvas {
  const made = makeCanvas(TS, TS);
  if (!made) throw new Error("no canvas");
  const { canvas, ctx } = made;
  const rng = makeRng(hashStr(name));
  const fill = (c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, TS, TS);
  };

  switch (name) {
    case "grass": {
      const base = "#6fae3d";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(base, 0.85 + rng() * 0.3));
      for (let i = 0; i < 22; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, mul(base, 0.7));
      for (let i = 0; i < 10; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, "#9ed46a");
      break;
    }
    case "dirt_grass": {
      const dirt = "#7a5536";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(dirt, 0.8 + rng() * 0.4));
      for (let i = 0; i < 14; i++) px(ctx, (rng() * TS) | 0, 3 + ((rng() * (TS - 3)) | 0), mul(dirt, 0.6));
      const g = "#6fae3d";
      for (let x = 0; x < TS; x++) {
        px(ctx, x, 0, mul(g, 0.95 + rng() * 0.1));
        px(ctx, x, 1, mul(g, 0.85 + rng() * 0.15));
        if (rng() > 0.5) px(ctx, x, 2, mul(g, 0.8));
      }
      break;
    }
    case "dirt": {
      const dirt = "#6f4d30";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(dirt, 0.78 + rng() * 0.4));
      for (let i = 0; i < 16; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, mul(dirt, 0.6));
      break;
    }
    case "sand": {
      const s = "#dcc88c";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(s, 0.9 + rng() * 0.18));
      for (let i = 0; i < 12; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, mul(s, 0.82));
      break;
    }
    case "stone":
    case "stone_side": {
      const s = "#8f877b";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(s, 0.85 + rng() * 0.28));
      for (let i = 0; i < 5; i++) {
        let cx = (rng() * TS) | 0;
        let cy = (rng() * TS) | 0;
        for (let k = 0; k < 4; k++) {
          px(ctx, cx, cy, mul(s, 0.62));
          cx = Math.min(TS - 1, Math.max(0, cx + ((rng() * 3) | 0) - 1));
          cy = Math.min(TS - 1, cy + 1);
        }
      }
      break;
    }
    case "snow": {
      const s = "#eef4f8";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(s, 0.93 + rng() * 0.07));
      for (let i = 0; i < 6; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, "#cfe0ee");
      for (let i = 0; i < 4; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, "#ffffff");
      break;
    }
    case "water":
    case "water_deep": {
      const b = name === "water_deep" ? "#1f4f86" : "#2f74b4";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(b, 0.9 + rng() * 0.16));
      for (let y = 1; y < TS; y += 4) for (let x = 0; x < TS; x++) if ((x + y) % 3 === 0) px(ctx, x, y, mul(b, 1.25));
      break;
    }
    case "planks": {
      const w = "#9c6b3c";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(w, 0.86 + rng() * 0.26));
      for (let x = 0; x < TS; x += 5) for (let y = 0; y < TS; y++) px(ctx, x, y, mul(w, 0.62));
      for (let y = 0; y < TS; y += 6) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(w, 0.72));
      break;
    }
    case "thatch": {
      const t = "#caa242";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(t, 0.85 + rng() * 0.3));
      for (let y = 0; y < TS; y += 3) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(t, 0.68));
      break;
    }
    case "tile_roof": {
      const t = "#a8432f";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(t, 0.85 + rng() * 0.25));
      for (let y = 0; y < TS; y += 4) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(t, 0.66));
      break;
    }
    case "brick":
    case "stonebrick": {
      const b = name === "brick" ? "#9c4a38" : "#7f7a70";
      const mortar = name === "brick" ? "#c8b8a0" : "#a8a298";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(b, 0.86 + rng() * 0.22));
      for (let y = 0; y < TS; y += 4) {
        for (let x = 0; x < TS; x++) px(ctx, x, y, mortar);
        const off = (y / 4) % 2 === 0 ? 0 : 4;
        for (let x = off; x < TS; x += 8) for (let k = 0; k < 4; k++) px(ctx, x, Math.min(TS - 1, y + k), mortar);
      }
      break;
    }
    case "plaster": {
      const p = "#ddcba2";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(p, 0.93 + rng() * 0.12));
      break;
    }
    case "metal": {
      const m = "#aab2be";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(m, 0.85 + rng() * 0.24));
      for (let x = 0; x < TS; x += 5) for (let y = 0; y < TS; y++) px(ctx, x, y, mul(m, 0.7));
      for (let y = 2; y < TS; y += 6) for (let x = 2; x < TS; x += 6) px(ctx, x, y, mul(m, 1.2));
      break;
    }
    case "glass":
    case "glass_neon": {
      const neon = name === "glass_neon";
      const frame = neon ? "#241a40" : "#33405c";
      const glass = neon ? "#3a2c66" : "#46577a";
      fill(frame);
      for (let cy = 0; cy < TS; cy += 5)
        for (let cx = 0; cx < TS; cx += 5)
          for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) px(ctx, cx + x, cy + y, mul(glass, 0.9 + rng() * 0.2));
      break;
    }
    case "leaf": {
      const g = "#357a32";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(g, 0.8 + rng() * 0.4));
      for (let i = 0; i < 16; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, mul(g, 0.65));
      for (let i = 0; i < 8; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, "#5aa84a");
      break;
    }
    case "log": {
      const w = "#6e4a2a";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(w, 0.85 + rng() * 0.22));
      for (let x = 2; x < TS; x += 5) for (let y = 0; y < TS; y++) px(ctx, x, y, mul(w, 0.65));
      break;
    }
    default:
      fill("#888888");
  }
  return canvas;
}

function getBaseTex(name: string): AnyCanvas {
  let t = baseTexCache.get(name);
  if (!t) {
    t = buildBaseTex(name);
    baseTexCache.set(name, t);
  }
  return t;
}

function getTex(name: string, factor: number): AnyCanvas {
  const key = `${name}@${factor.toFixed(2)}`;
  const hit = shadeTexCache.get(key);
  if (hit) return hit;
  const base = getBaseTex(name);
  if (factor === 1) {
    shadeTexCache.set(key, base);
    return base;
  }
  const made = makeCanvas(TS, TS)!;
  made.ctx.drawImage(base, 0, 0);
  made.ctx.globalCompositeOperation = "multiply";
  made.ctx.fillStyle = rgbHex(factor * 255, factor * 255, factor * 255);
  made.ctx.fillRect(0, 0, TS, TS);
  made.ctx.globalCompositeOperation = "source-over";
  shadeTexCache.set(key, made.canvas);
  return made.canvas;
}

// face brightness factors
const F_TOP = 1.0;
const F_LEFT = 0.8;
const F_RIGHT = 0.6;

// ============================================================================
// scene data
// ============================================================================
type Terrain = "water" | "sand" | "grass" | "forest" | "rock" | "snow";
interface TileD {
  col: number;
  row: number;
  terrain: Terrain;
  layers: number;
}
interface BuildingD {
  col: number;
  row: number;
  floors: number;
  seed: number;
}
interface SceneData {
  era: Era;
  night: boolean;
  base: AnyCanvas;
  glow: AnyCanvas;
  W: number;
  H: number;
  S: number;
  water: { x: number; y: number }[];
  clouds: { x: number; y: number; s: number }[];
  stars: { x: number; y: number; r: number; p: number }[];
  particles: { x: number; y: number; vx: number; vy: number; c: string; r: number }[];
  charX: number;
  charY: number;
  charScale: number;
}

function classify(e: number): Terrain {
  if (e < 0.3) return "water";
  if (e < 0.37) return "sand";
  if (e < 0.6) return "grass";
  if (e < 0.74) return "forest";
  if (e < 0.88) return "rock";
  return "snow";
}

function buildTiles(c: Character): TileD[] {
  const N = c.territory;
  const c0 = (N - 1) / 2;
  const maxD = Math.hypot(c0, c0) || 1;
  const tiles: TileD[] = [];
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      let e = fbm(col * 0.36 + 1.7, row * 0.36 + 4.3, c.seed, 4);
      const d = Math.hypot(col - c0, row - c0) / maxD;
      e = e * (1.18 - d * 0.6) - d * 0.12;
      e = Math.max(0, Math.min(1, e));
      const terrain = classify(e);
      const layers = terrain === "water" ? 0 : Math.max(1, Math.round(((e - 0.3) / 0.7) * MAX_LAYERS));
      tiles.push({ col, row, terrain, layers });
    }
  }
  return tiles;
}

// ============================================================================
// face painting
// ============================================================================
function paintFace(ctx: Ctx, tex: AnyCanvas, p0x: number, p0y: number, ux: number, uy: number, vx: number, vy: number) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(ux / TS, uy / TS, vx / TS, vy / TS, p0x, p0y);
  ctx.drawImage(tex, -0.5, -0.5, TS + 1, TS + 1);
  ctx.restore();
}
function fillQuad(ctx: Ctx, pts: number[], color: string) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

// ============================================================================
// prepareScene
// ============================================================================
export function prepareScene(character: Character, W: number, H: number): SceneData {
  const era = getEra(character.techLevel);
  const night = era.index >= 8;
  const tiles = buildTiles(character);
  const N = character.territory;

  const rb = makeRng((character.seed ^ (era.index * 2654435761)) >>> 0);
  const c0 = (N - 1) / 2;
  let home = tiles[0];
  let bestD = Infinity;
  for (const t of tiles) {
    if (t.terrain === "water") continue;
    const d = Math.hypot(t.col - c0, t.row - c0);
    if (d < bestD) {
      bestD = d;
      home = t;
    }
  }
  const distHome = (t: TileD) => Math.hypot(t.col - home.col, t.row - home.row);
  let buildable = tiles.filter(
    (t) => (t.terrain === "grass" || t.terrain === "sand" || t.terrain === "forest") && !(t.col === home.col && t.row === home.row),
  );

  // --- place built wonders on prominent land tiles near the city centre ---
  const wonderPlacements: { w: Wonder; col: number; row: number }[] = [];
  const screenWonders: Wonder[] = [];
  {
    const near = buildable.slice().sort((a, b) => distHome(a) - distHome(b));
    let idx = 0;
    for (const id of character.wonders) {
      const w = getWonder(id);
      if (!w) continue;
      if (w.silhouette === "beam" || w.silhouette === "ring") {
        screenWonders.push(w);
        continue;
      }
      if (idx < near.length) {
        const t = near[idx++];
        wonderPlacements.push({ w, col: t.col, row: t.row });
      }
    }
  }
  const wonderKey = new Set(wonderPlacements.map((p) => `${p.col},${p.row}`));
  buildable = buildable.filter((t) => !wonderKey.has(`${t.col},${t.row}`));

  // --- clustered placement near home + centre→edge height gradient ---
  const maxLandDist = buildable.reduce((m, t) => Math.max(m, distHome(t)), 1);
  buildable.sort((a, b) => distHome(a) + rb() * 2.2 - (distHome(b) + rb() * 2.2));
  const landCount = tiles.filter((t) => t.terrain !== "water").length;
  const density = Math.min(
    buildable.length,
    4 + Math.floor(character.techLevel / 45) + Math.floor(landCount * 0.45),
  );
  const buildings: BuildingD[] = [];
  const builtKey = new Set<string>();
  for (let i = 0; i < density; i++) {
    const t = buildable[i];
    builtKey.add(`${t.col},${t.row}`);
    const dn = distHome(t) / maxLandDist; // 0 centre … 1 edge
    const hMult = Math.max(0.4, 1.35 - dn);
    let floors = Math.max(1, Math.round(floorsFor(era, rb) * hMult));
    if (rb() < 0.12) floors = Math.round(floors * (1.5 + rb())); // occasional landmark spike
    buildings.push({ col: t.col, row: t.row, floors, seed: ((t.col * 73 + t.row * 131) >>> 0) || 1 });
  }

  // fit-to-canvas (extents at S=1)
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  const consider = (col: number, row: number, topZ: number, botExtra: number) => {
    const x = (col - row) * HW;
    const yTop = (col + row) * HH - topZ * CUBE_H - HH;
    const yBot = (col + row) * HH + HH + botExtra;
    minX = Math.min(minX, x - HW);
    maxX = Math.max(maxX, x + HW);
    minY = Math.min(minY, yTop);
    maxY = Math.max(maxY, yBot);
  };
  for (const t of tiles) consider(t.col, t.row, t.layers, t.terrain === "water" ? 0 : BASE_DEPTH);
  for (const b of buildings) {
    const t = tiles.find((x) => x.col === b.col && x.row === b.row)!;
    consider(b.col, b.row, t.layers + b.floors + 2, BASE_DEPTH);
  }
  for (const p of wonderPlacements) {
    const t = tiles.find((x) => x.col === p.col && x.row === p.row)!;
    consider(p.col, p.row, t.layers + 12, BASE_DEPTH); // wonders are tall — reserve headroom
  }
  const spanX = maxX - minX || 1;
  const spanY = maxY - minY || 1;
  const pad = 18;
  const S = Math.min(2.4, (W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const ox = (W - spanX * S) / 2 - minX * S;
  const oy = (H - spanY * S) / 2 - minY * S;
  const SHW = HW * S;
  const SHH = HH * S;
  const SCH = CUBE_H * S;
  const SDEPTH = BASE_DEPTH * S;
  const project = (col: number, row: number, z: number) => ({ x: ox + (col - row) * SHW, y: oy + (col + row) * SHH - z * SCH });

  const baseMade = makeCanvas(W, H)!;
  const glowMade = makeCanvas(W, H)!;
  const ctx = baseMade.ctx;
  const gctx = glowMade.ctx;

  paintSky(ctx, gctx, era, night, W, H);

  const stars: SceneData["stars"] = [];
  const clouds: SceneData["clouds"] = [];
  const rs = makeRng((character.seed ^ 0x51ed) >>> 0);
  if (night) {
    for (let i = 0; i < 70; i++) stars.push({ x: rs() * W, y: rs() * H * 0.55, r: 0.5 + rs() * 1.3, p: rs() * Math.PI * 2 });
  } else {
    for (let i = 0; i < 4; i++) clouds.push({ x: rs() * W, y: 30 + rs() * H * 0.22, s: 0.7 + rs() * 0.8 });
  }

  const ordered = [...tiles].sort((a, b) => a.col + a.row - (b.col + b.row));
  const water: { x: number; y: number }[] = [];
  const treeRng = makeRng((character.seed ^ 0xa11) >>> 0);

  for (const t of ordered) {
    const top = project(t.col, t.row, t.layers);
    if (t.terrain === "water") {
      drawColumn(ctx, top.x, top.y, SHW, SHH, SCH, 1, SDEPTH * 0.4, "water", "water_deep", "water_deep");
      water.push({ x: top.x, y: top.y });
    } else {
      const m = terrainMats(t.terrain);
      drawColumn(ctx, top.x, top.y, SHW, SHH, SCH, t.layers, SDEPTH, m.top, m.sideTop, m.sideDeep);
    }
    const key = `${t.col},${t.row}`;
    if (t.terrain === "forest" && !builtKey.has(key) && !wonderKey.has(key)) {
      const n = 1 + ((treeRng() * 2) | 0);
      for (let k = 0; k < n; k++) drawTree(ctx, top.x + (treeRng() - 0.5) * SHW * 0.7, top.y + (treeRng() - 0.5) * SHH * 0.7, S, era);
    }
    if (wonderKey.has(key)) {
      const wp = wonderPlacements.find((p) => p.col === t.col && p.row === t.row)!;
      drawWonder(ctx, gctx, top.x, top.y, SHW, SHH, SCH, wp.w, era);
    } else {
      const b = buildings.find((x) => x.col === t.col && x.row === t.row);
      if (b) drawBuilding(ctx, gctx, top.x, top.y, SHW, SHH, SCH, b, era);
    }
  }

  // screen-space wonders (space elevator beam, orbital/Dyson ring)
  for (const w of screenWonders) drawScreenWonder(ctx, gctx, w, era, W, H);

  const homeTop = project(home.col, home.row, home.layers);

  const particles: SceneData["particles"] = [];
  const pr = makeRng((character.seed ^ 0xbeef) >>> 0);
  const pc = particleConf(era);
  for (let i = 0; i < pc.count; i++)
    particles.push({ x: pr() * W, y: pr() * H, vx: (pr() - 0.5) * pc.spd, vy: -pc.rise * (0.5 + pr()), c: pc.color, r: 0.6 + pr() * pc.size });

  return {
    era,
    night,
    base: baseMade.canvas,
    glow: glowMade.canvas,
    W,
    H,
    S,
    water,
    clouds,
    stars,
    particles,
    charX: homeTop.x,
    charY: homeTop.y,
    charScale: S * (0.9 + Math.min(1, character.age / 80) * 0.5),
  };
}

function floorsFor(era: Era, rng: () => number): number {
  const i = era.index;
  if (i <= 1) return 1 + ((rng() * 2) | 0);
  if (i === 2) return 2;
  if (i === 3) return 2 + ((rng() * 2) | 0);
  if (i === 4) return 2 + ((rng() * 2) | 0);
  if (i === 5) return 2 + ((rng() * 2) | 0);
  if (i === 6 || i === 7) return 4 + ((rng() * 6) | 0);
  if (i === 8) return 2 + ((rng() * 2) | 0);
  return 6 + ((rng() * 9) | 0);
}

function terrainMats(t: Terrain): { top: string; sideTop: string; sideDeep: string } {
  switch (t) {
    case "grass":
    case "forest":
      return { top: "grass", sideTop: "dirt_grass", sideDeep: "dirt" };
    case "sand":
      return { top: "sand", sideTop: "sand", sideDeep: "sand" };
    case "rock":
      return { top: "stone", sideTop: "stone_side", sideDeep: "stone_side" };
    case "snow":
      return { top: "snow", sideTop: "snow", sideDeep: "stone_side" };
    default:
      return { top: "water", sideTop: "water_deep", sideDeep: "water_deep" };
  }
}

function drawColumn(
  ctx: Ctx,
  cx: number,
  cyTop: number,
  shw: number,
  shh: number,
  sch: number,
  layers: number,
  baseDepth: number,
  topMat: string,
  sideTopMat: string,
  sideDeepMat: string,
) {
  for (let i = 0; i < layers; i++) {
    const yt = cyTop + i * sch;
    const mat = i === 0 ? sideTopMat : sideDeepMat;
    paintFace(ctx, getTex(mat, F_LEFT), cx - shw, yt, shw, shh, 0, sch);
    paintFace(ctx, getTex(mat, F_RIGHT), cx, yt + shh, shw, -shh, 0, sch);
  }
  const yb = cyTop + layers * sch;
  paintFace(ctx, getTex(sideDeepMat, F_LEFT), cx - shw, yb, shw, shh, 0, baseDepth);
  paintFace(ctx, getTex(sideDeepMat, F_RIGHT), cx, yb + shh, shw, -shh, 0, baseDepth);
  paintFace(ctx, getTex(topMat, F_TOP), cx - shw, cyTop, shw, -shh, shw, shh);
}

function drawTree(ctx: Ctx, cx: number, cyTop: number, S: number, era: Era) {
  const trunkH = 10 * S;
  const tw = 3 * S;
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.beginPath();
  ctx.ellipse(cx, cyTop + 1, 7 * S, 3 * S, 0, 0, Math.PI * 2);
  ctx.fill();
  fillQuad(ctx, [cx - tw / 2, cyTop, cx, cyTop + 1.5 * S, cx, cyTop + 1.5 * S - trunkH, cx - tw / 2, cyTop - trunkH], mul("#6e4a2a", 0.8));
  fillQuad(ctx, [cx, cyTop + 1.5 * S, cx + tw / 2, cyTop, cx + tw / 2, cyTop - trunkH, cx, cyTop + 1.5 * S - trunkH], mul("#6e4a2a", 0.6));
  const shw = 6 * S,
    shh = 3 * S,
    sch = 7 * S;
  const ly = cyTop - trunkH - sch + shh;
  void era;
  paintFace(ctx, getTex("leaf", F_LEFT), cx - shw, ly, shw, shh, 0, sch);
  paintFace(ctx, getTex("leaf", F_RIGHT), cx, ly + shh, shw, -shh, 0, sch);
  paintFace(ctx, getTex("leaf", F_TOP), cx - shw, ly, shw, -shh, shw, shh);
}

// ---- buildings ----
function drawBuilding(ctx: Ctx, gctx: Ctx, cx: number, cyTop: number, shw: number, shh: number, sch: number, b: BuildingD, era: Era) {
  const rng = makeRng((b.seed ^ (era.index * 99991)) >>> 0);
  const spec = buildingSpec(era, rng);
  const floors = b.floors;

  // per-building footprint + brightness variety (seed-driven)
  const fw = 0.6 + rng() * 0.32;
  const fh = 0.6 + rng() * 0.32;
  let bw = shw * fw;
  let bh = shh * fh;
  const bMul = 0.86 + (Math.round(rng() * 6) / 20); // {0.86..1.16} bucketed for cache reuse
  const mirror = rng() < 0.5; // swap left/right wall shade to break repetition
  const fL = (mirror ? F_RIGHT : F_LEFT) * bMul;
  const fR = (mirror ? F_LEFT : F_RIGHT) * bMul;

  // setback for tall buildings → stepped skyscraper silhouette
  const setbackEvery = floors >= 6 ? 3 + ((rng() * 2) | 0) : 999;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx + bw * 0.35, cyTop + bh * 0.35, bw * 1.1, bh * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  let w = bw;
  let h = bh;
  for (let i = 0; i < floors; i++) {
    if (i > 0 && i % setbackEvery === 0) {
      w *= 0.82;
      h *= 0.82;
    }
    const yt = cyTop - (i + 1) * sch;
    paintFace(ctx, getTex(spec.wall, fL), cx - w, yt, w, h, 0, sch);
    paintFace(ctx, getTex(spec.wall, fR), cx, yt + h, w, -h, 0, sch);

    if (spec.windows) {
      const lit = makeWindowTex(b.seed + i, era);
      paintFace(ctx, lit, cx - w, yt, w, h, 0, sch);
      paintFace(ctx, lit, cx, yt + h, w, -h, 0, sch);
      paintFace(gctx, lit, cx - w, yt, w, h, 0, sch);
      paintFace(gctx, lit, cx, yt + h, w, -h, 0, sch);
    } else {
      // openings (doors/windows) so low-era buildings aren't blank boxes
      const fac = getFacadeTex(i === 0);
      paintFace(ctx, fac, cx - w, yt, w, h, 0, sch);
      paintFace(ctx, fac, cx, yt + h, w, -h, 0, sch);
    }
  }

  const roofY = cyTop - floors * sch;
  if (spec.roof === "pitch") drawPitchRoof(ctx, cx, roofY, w, h, sch * (0.65 + rng() * 0.7), spec.roofMat);
  else paintFace(ctx, getTex(spec.roofMat, F_TOP), cx - w, roofY, w, -h, w, h);

  switch (era.structure) {
    case "temple":
      drawColumns(ctx, cx, cyTop, bw, sch * floors);
      break;
    case "keep":
      drawCrenellations(ctx, cx, roofY, w, h);
      break;
    case "manor":
      drawChimney(ctx, cx + (rng() - 0.5) * bw, roofY, sch * (0.8 + rng() * 0.6), "tile_roof");
      break;
    case "factory":
      drawChimney(ctx, cx + bw * 0.3, roofY, sch * (1.5 + rng()), "brick");
      if (rng() < 0.5) drawChimney(ctx, cx - bw * 0.3, roofY, sch * (1.2 + rng()), "brick");
      break;
    case "tower":
    case "arcology":
      if (rng() < 0.7) drawAntenna(ctx, gctx, cx, roofY, sch, era);
      if (era.structure === "arcology") drawNeonEdges(ctx, gctx, cx, cyTop, w, h, sch * floors, era);
      break;
    case "dome":
      drawDome(ctx, gctx, cx, roofY, w, h, era);
      break;
  }
}

interface BSpec {
  wall: string;
  roof: "pitch" | "flat";
  roofMat: string;
  windows: boolean;
}
// Per-era variant pools — same era now yields several distinct buildings.
const SPEC_POOL: Record<string, BSpec[]> = {
  hut: [
    { wall: "planks", roof: "pitch", roofMat: "thatch", windows: false },
    { wall: "log", roof: "pitch", roofMat: "thatch", windows: false },
    { wall: "planks", roof: "pitch", roofMat: "tile_roof", windows: false },
  ],
  temple: [
    { wall: "stone", roof: "flat", roofMat: "stone", windows: false },
    { wall: "stone", roof: "pitch", roofMat: "tile_roof", windows: false },
    { wall: "stonebrick", roof: "flat", roofMat: "stone", windows: false },
  ],
  keep: [
    { wall: "stonebrick", roof: "flat", roofMat: "stonebrick", windows: false },
    { wall: "stone", roof: "flat", roofMat: "stonebrick", windows: false },
  ],
  manor: [
    { wall: "plaster", roof: "pitch", roofMat: "tile_roof", windows: false },
    { wall: "brick", roof: "pitch", roofMat: "tile_roof", windows: false },
    { wall: "plaster", roof: "pitch", roofMat: "thatch", windows: false },
  ],
  factory: [
    { wall: "brick", roof: "flat", roofMat: "brick", windows: false },
    { wall: "brick", roof: "flat", roofMat: "metal", windows: true },
  ],
  tower: [
    { wall: "glass", roof: "flat", roofMat: "metal", windows: true },
    { wall: "metal", roof: "flat", roofMat: "metal", windows: true },
  ],
  dome: [
    { wall: "metal", roof: "flat", roofMat: "metal", windows: true },
    { wall: "glass", roof: "flat", roofMat: "metal", windows: true },
  ],
  arcology: [
    { wall: "glass_neon", roof: "flat", roofMat: "metal", windows: true },
    { wall: "metal", roof: "flat", roofMat: "metal", windows: true },
  ],
};
function buildingSpec(era: Era, rng: () => number): BSpec {
  const pool = SPEC_POOL[era.structure] ?? SPEC_POOL.temple;
  return pool[Math.floor(rng() * pool.length)];
}

function getFacadeTex(withDoor: boolean): AnyCanvas {
  const key = withDoor ? "facade_door" : "facade_win";
  const cached = baseTexCache.get(key);
  if (cached) return cached;
  const made = makeCanvas(TS, TS)!;
  const ctx = made.ctx;
  const dark = "rgba(28,24,32,0.6)";
  const sill = "rgba(255,255,255,0.12)";
  for (let cy = 2; cy < TS - 3; cy += 5)
    for (let cx = 2; cx < TS - 2; cx += 5) {
      ctx.fillStyle = dark;
      ctx.fillRect(cx, cy, 2, 3);
      ctx.fillStyle = sill;
      ctx.fillRect(cx, cy + 3, 2, 1);
    }
  if (withDoor) {
    ctx.clearRect(6, 10, 4, 6);
    ctx.fillStyle = "rgba(20,16,22,0.78)";
    ctx.fillRect(6, 10, 4, 6);
  }
  baseTexCache.set(key, made.canvas);
  return made.canvas;
}

function makeWindowTex(seed: number, era: Era): AnyCanvas {
  const key = `win${seed % 64}_${era.index >= 8 ? "n" : "d"}`;
  const cached = baseTexCache.get(key);
  if (cached) return cached;
  const made = makeCanvas(TS, TS)!;
  const ctx = made.ctx;
  const r = makeRng(seed + 1);
  const lit = era.index >= 8 ? (r() > 0.5 ? "#ff5ad8" : "#5af0ff") : r() > 0.5 ? "#ffd98a" : "#ffffee";
  for (let cy = 0; cy < TS; cy += 5)
    for (let cx = 0; cx < TS; cx += 5)
      if (r() > 0.45) for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) px(ctx, cx + x, cy + y, lit);
  baseTexCache.set(key, made.canvas);
  return made.canvas;
}

function matColor(mat: string): string {
  switch (mat) {
    case "thatch":
      return "#caa242";
    case "tile_roof":
      return "#a8432f";
    case "stone":
      return "#8f877b";
    case "stonebrick":
      return "#7f7a70";
    case "metal":
      return "#aab2be";
    case "brick":
      return "#9c4a38";
    default:
      return "#999999";
  }
}

function drawPitchRoof(ctx: Ctx, cx: number, roofY: number, bw: number, bh: number, height: number, mat: string) {
  const peakY = roofY - height;
  const base = matColor(mat);
  fillQuad(ctx, [cx - bw, roofY, cx, roofY + bh, cx, peakY], mul(base, F_LEFT));
  fillQuad(ctx, [cx, roofY + bh, cx + bw, roofY, cx, peakY], mul(base, F_RIGHT));
  fillQuad(ctx, [cx - bw, roofY, cx, peakY, cx + bw, roofY, cx, roofY - bh * 0.2], mul(base, 1.05));
  ctx.strokeStyle = mul(base, 1.2);
  ctx.lineWidth = Math.max(1, bw * 0.08);
  ctx.beginPath();
  ctx.moveTo(cx, peakY);
  ctx.lineTo(cx, roofY + bh);
  ctx.stroke();
}

function drawColumns(ctx: Ctx, cx: number, cyTop: number, bw: number, height: number) {
  const col = "#e6e0d2";
  for (const dx of [-bw * 0.6, -bw * 0.2, bw * 0.2, bw * 0.6]) {
    ctx.fillStyle = mul(col, dx < 0 ? F_LEFT : F_RIGHT);
    ctx.fillRect(cx + dx - 1.5, cyTop - height, 3, height);
  }
}

function drawCrenellations(ctx: Ctx, cx: number, roofY: number, bw: number, bh: number) {
  const m = "#7f7a70";
  const n = 4;
  for (let i = 0; i <= n; i++) {
    if (i % 2 !== 0) continue;
    const tt = i / n;
    const x = cx - bw + tt * 2 * bw;
    const y = roofY + (tt - 0.5) * 2 * bh;
    ctx.fillStyle = mul(m, F_TOP);
    ctx.fillRect(x - 2, y - 6, 4, 6);
  }
}

function drawChimney(ctx: Ctx, cx: number, roofY: number, h: number, mat: string) {
  const w = 5;
  ctx.fillStyle = mul(matColor(mat), F_LEFT);
  ctx.fillRect(cx - w / 2, roofY - h, w, h);
  ctx.fillStyle = mul(matColor(mat), F_RIGHT);
  ctx.fillRect(cx, roofY - h, w / 2, h);
}

function drawAntenna(ctx: Ctx, gctx: Ctx, cx: number, roofY: number, sch: number, era: Era) {
  ctx.strokeStyle = "#cfd6df";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, roofY);
  ctx.lineTo(cx, roofY - sch * 1.2);
  ctx.stroke();
  const c = era.palette.accent;
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(cx, roofY - sch * 1.2, 2.2, 0, Math.PI * 2);
  ctx.fill();
  gctx.fillStyle = c;
  gctx.beginPath();
  gctx.arc(cx, roofY - sch * 1.2, 4, 0, Math.PI * 2);
  gctx.fill();
}

function drawDome(ctx: Ctx, gctx: Ctx, cx: number, roofY: number, bw: number, bh: number, era: Era) {
  ctx.fillStyle = mul("#cdd8e6", 0.9);
  ctx.beginPath();
  ctx.ellipse(cx, roofY + bh * 0.2, bw * 0.9, bw * 0.6, 0, Math.PI, 0);
  ctx.fill();
  for (const g of [ctx, gctx]) {
    g.strokeStyle = era.palette.accent;
    g.lineWidth = g === gctx ? 3 : 2;
    g.beginPath();
    g.ellipse(cx, roofY + bh * 0.2, bw * 0.9, bw * 0.28, 0, Math.PI, 0);
    g.stroke();
  }
}

function drawNeonEdges(ctx: Ctx, gctx: Ctx, cx: number, cyTop: number, bw: number, bh: number, totalH: number, era: Era) {
  const c = era.palette.accent;
  const top = cyTop - totalH;
  for (const g of [ctx, gctx]) {
    g.strokeStyle = c;
    g.lineWidth = g === gctx ? 3 : 1.5;
    g.beginPath();
    g.moveTo(cx, cyTop + bh);
    g.lineTo(cx, top + bh);
    g.moveTo(cx - bw, top);
    g.lineTo(cx, top + bh);
    g.lineTo(cx + bw, top);
    g.stroke();
  }
}

// ============================================================================
// Wonders / landmarks — distinctive silhouettes, larger than ordinary buildings
// ============================================================================
function prismPx(
  ctx: Ctx,
  cx: number,
  cyTop: number,
  hw: number,
  hh: number,
  height: number,
  top: string,
  left: string,
  right: string,
) {
  // left & right faces then top diamond (solid colours)
  fillQuad(ctx, [cx - hw, cyTop, cx, cyTop + hh, cx, cyTop + hh - height, cx - hw, cyTop - height], left);
  fillQuad(ctx, [cx, cyTop + hh, cx + hw, cyTop, cx + hw, cyTop - height, cx, cyTop + hh - height], right);
  fillQuad(ctx, [cx - hw, cyTop - height, cx, cyTop + hh - height, cx + hw, cyTop - height, cx, cyTop - hh - height], top);
}

function drawWonder(ctx: Ctx, gctx: Ctx, cx: number, cyTop: number, shw: number, shh: number, sch: number, w: Wonder, era: Era) {
  const s = (w.footprint >= 2 ? 1.5 : 1.15); // wonders dwarf normal buildings
  const hw = shw * s;
  const hh = shh * s;
  const ch = sch;
  const accent = era.palette.accent;

  // ground shadow
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx + hw * 0.3, cyTop + hh * 0.3, hw * 1.2, hh * 1.2, 0, 0, Math.PI * 2);
  ctx.fill();

  const sil: Silhouette = w.silhouette;
  if (sil === "pyramid") {
    const steps = 5;
    for (let i = 0; i < steps; i++) {
      const f = 1 - i / steps;
      prismPx(ctx, cx, cyTop - i * ch * 0.9, hw * f, hh * f, ch * 0.9, mul("#d8c48c", 1.0), mul("#d8c48c", 0.8), mul("#d8c48c", 0.6));
    }
  } else if (sil === "henge") {
    const n = 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const px2 = cx + Math.cos(a) * hw * 0.8;
      const py2 = cyTop + Math.sin(a) * hh * 0.8;
      prismPx(ctx, px2, py2, hw * 0.13, hh * 0.13, ch * 1.6, mul("#9a948a", 1), mul("#9a948a", 0.8), mul("#9a948a", 0.6));
    }
  } else if (sil === "colonnade") {
    prismPx(ctx, cx, cyTop, hw, hh, ch * 0.6, mul("#e6e0d2", 1), mul("#e6e0d2", 0.82), mul("#e6e0d2", 0.64));
    const top0 = cyTop - ch * 0.6;
    for (let i = -3; i <= 3; i++) {
      ctx.fillStyle = mul("#efe9da", i < 0 ? F_LEFT : F_RIGHT);
      ctx.fillRect(cx + (i / 3) * hw * 0.8 - 2, top0 - ch * 1.6, 4, ch * 1.6);
    }
    // pediment
    fillQuad(ctx, [cx - hw, top0 - ch * 1.6, cx + hw, top0 - ch * 1.6, cx, top0 - ch * 2.4], mul("#cfc7b4", 1));
  } else if (sil === "arena") {
    for (let i = 0; i < 3; i++) {
      const f = 1 - i * 0.22;
      ctx.fillStyle = mul("#cdbfa0", 1 - i * 0.12);
      ctx.beginPath();
      ctx.ellipse(cx, cyTop - i * ch * 0.7, hw * f, hh * f, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mul("#9c8f74", 0.8);
      ctx.beginPath();
      ctx.ellipse(cx, cyTop - i * ch * 0.7 - ch * 0.35, hw * f * 0.7, hh * f * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (sil === "dome") {
    prismPx(ctx, cx, cyTop, hw, hh, ch * 1.2, mul("#d8d2c4", 1), mul("#d8d2c4", 0.82), mul("#d8d2c4", 0.64));
    const dy = cyTop - ch * 1.2;
    ctx.fillStyle = mul(mix("#e8e2d4", accent, 0.15), 1);
    ctx.beginPath();
    ctx.ellipse(cx, dy + hh * 0.2, hw * 0.85, hw * 0.7, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, dy - hw * 0.5, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (sil === "spire") {
    prismPx(ctx, cx, cyTop, hw * 0.8, hh * 0.8, ch * 2.2, mul("#b8b0a2", 1), mul("#b8b0a2", 0.82), mul("#b8b0a2", 0.62));
    const t0 = cyTop - ch * 2.2;
    // tall steeple
    fillQuad(ctx, [cx - hw * 0.3, t0, cx + hw * 0.3, t0, cx, t0 - ch * 2.2], mul("#7a6e8e", 1));
    // stained glass glow
    gctx.fillStyle = accent;
    gctx.fillRect(cx - 2, cyTop - ch * 1.6, 4, ch * 1.0);
  } else if (sil === "hall") {
    prismPx(ctx, cx, cyTop, hw, hh, ch * 1.4, mul("#bfd0dc", 1), mul("#9fb6c6", 0.85), mul("#88a0b2", 0.66));
    // glow roof line
    gctx.fillStyle = mix("#bfe8ff", accent, 0.3);
    gctx.fillRect(cx - hw, cyTop - ch * 1.5, hw * 2, 3);
  } else if (sil === "lattice") {
    const topY = cyTop - ch * 4.2;
    for (const g of [ctx]) {
      g.strokeStyle = mul("#8a7a5a", 1);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - hw * 0.8, cyTop + hh);
      g.lineTo(cx, topY);
      g.lineTo(cx + hw * 0.8, cyTop + hh);
      g.moveTo(cx - hw * 0.5, cyTop - ch * 1.5);
      g.lineTo(cx + hw * 0.5, cyTop - ch * 1.5);
      g.moveTo(cx - hw * 0.3, cyTop - ch * 2.8);
      g.lineTo(cx + hw * 0.3, cyTop - ch * 2.8);
      g.stroke();
    }
  } else if (sil === "rocket") {
    prismPx(ctx, cx - hw * 0.5, cyTop, hw * 0.25, hh * 0.25, ch * 3, mul("#9aa2ae", 1), mul("#9aa2ae", 0.8), mul("#9aa2ae", 0.6)); // gantry
    // rocket body
    ctx.fillStyle = "#eef2f5";
    ctx.fillRect(cx - 4, cyTop - ch * 3.2, 8, ch * 3.2);
    fillQuad(ctx, [cx - 4, cyTop - ch * 3.2, cx + 4, cyTop - ch * 3.2, cx, cyTop - ch * 3.9], "#d05a4a");
    gctx.fillStyle = "#ffd060";
    gctx.beginPath();
    gctx.ellipse(cx, cyTop + hh * 0.3, 7, 4, 0, 0, Math.PI * 2);
    gctx.fill();
  } else if (sil === "core") {
    const cy = cyTop - ch * 1.5;
    const r = hw * 1.0;
    fillQuad(ctx, [cx, cy - r, cx + r, cy, cx, cy + r, cx - r, cy], mix("#5a3a8a", accent, 0.4));
    for (const g of [ctx, gctx]) {
      g.strokeStyle = accent;
      g.lineWidth = g === gctx ? 4 : 2;
      g.beginPath();
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r, cy);
      g.closePath();
      g.moveTo(cx, cy - r);
      g.lineTo(cx, cy + r);
      g.moveTo(cx - r, cy);
      g.lineTo(cx + r, cy);
      g.stroke();
    }
  }
}

function drawScreenWonder(ctx: Ctx, gctx: Ctx, w: Wonder, era: Era, W: number, H: number) {
  const accent = era.palette.accent;
  if (w.silhouette === "beam") {
    const x = W * 0.5;
    const grad = ctx.createLinearGradient(x, 0, x, H);
    grad.addColorStop(0, hexA(accent, 0.0));
    grad.addColorStop(1, hexA(accent, 0.5));
    ctx.fillStyle = grad;
    ctx.fillRect(x - 4, 0, 8, H);
    gctx.fillStyle = hexA(accent, 0.8);
    gctx.fillRect(x - 3, 0, 6, H);
  } else if (w.silhouette === "ring") {
    for (const g of [ctx, gctx]) {
      g.strokeStyle = g === gctx ? hexA(accent, 0.9) : hexA(accent, 0.5);
      g.lineWidth = g === gctx ? 6 : 3;
      g.beginPath();
      g.ellipse(W * 0.5, H * 0.32, W * 0.42, H * 0.16, 0.2, Math.PI * 1.05, Math.PI * 1.95);
      g.stroke();
    }
  }
}

// ---- sky ----
function paintSky(ctx: Ctx, gctx: Ctx, era: Era, night: boolean, W: number, H: number) {
  const p = era.palette;
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  if (night) {
    grad.addColorStop(0, mul(p.sky, 0.7));
    grad.addColorStop(0.6, p.sky);
    grad.addColorStop(1, mix(p.sky, "#000010", 0.4));
  } else {
    grad.addColorStop(0, mul(p.sky, 1.08));
    grad.addColorStop(0.55, p.sky);
    grad.addColorStop(1, mix(p.sky, p.accent, 0.18));
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const sx = W * 0.8;
  const sy = H * 0.2;
  if (night) {
    ctx.fillStyle = mix("#cfe0ff", p.accent, 0.3);
    ctx.beginPath();
    ctx.arc(sx, sy, 16, 0, Math.PI * 2);
    ctx.fill();
    gctx.fillStyle = mix("#cfe0ff", p.accent, 0.3);
    gctx.beginPath();
    gctx.arc(sx, sy, 26, 0, Math.PI * 2);
    gctx.fill();
  } else {
    const sg = ctx.createRadialGradient(sx, sy, 4, sx, sy, 60);
    sg.addColorStop(0, "rgba(255,250,220,0.9)");
    sg.addColorStop(1, "rgba(255,250,220,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff7d8";
    ctx.beginPath();
    ctx.arc(sx, sy, 18, 0, Math.PI * 2);
    ctx.fill();
    gctx.fillStyle = "#fff7d8";
    gctx.beginPath();
    gctx.arc(sx, sy, 30, 0, Math.PI * 2);
    gctx.fill();
  }
}

function particleConf(era: Era): { count: number; color: string; spd: number; rise: number; size: number } {
  const i = era.index;
  if (i === 5) return { count: 26, color: "rgba(120,120,120,0.5)", spd: 6, rise: 8, size: 1.6 };
  if (i === 7) return { count: 30, color: era.palette.accent, spd: 10, rise: 4, size: 1.2 };
  if (i >= 8) return { count: 36, color: era.palette.accent, spd: 8, rise: 6, size: 1.4 };
  return { count: 18, color: "rgba(255,255,220,0.5)", spd: 8, rise: 3, size: 1.2 };
}

// ============================================================================
// renderFrame
// ============================================================================
export function renderFrame(ctx: Ctx, scene: SceneData, character: Character, W: number, H: number, t: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;

  ctx.drawImage(scene.base, 0, 0);

  if (!scene.night) {
    for (const c of scene.clouds) {
      const x = ((c.x + t * 6 * c.s) % (W + 120)) - 60;
      drawCloud(ctx, x, c.y, c.s);
    }
  } else {
    for (const s of scene.stars) {
      const a = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + s.p));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // water shimmer
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const w of scene.water) {
    const a = 0.1 + 0.1 * Math.sin(t * 1.5 + w.x * 0.05 + w.y * 0.03);
    ctx.strokeStyle = `rgba(180,220,255,${a})`;
    ctx.lineWidth = 1;
    const off = Math.sin(t + w.x * 0.1) * scene.S * 2;
    ctx.beginPath();
    ctx.moveTo(w.x - scene.S * 8 + off, w.y);
    ctx.quadraticCurveTo(w.x + off, w.y - scene.S * 3, w.x + scene.S * 8 + off, w.y);
    ctx.stroke();
  }
  ctx.restore();

  // particles
  ctx.save();
  ctx.globalAlpha = 0.5;
  for (const pt of scene.particles) {
    let px2 = (pt.x + pt.vx * t) % W;
    let py2 = (pt.y + pt.vy * t) % H;
    if (px2 < 0) px2 += W;
    if (py2 < 0) py2 += H;
    ctx.fillStyle = pt.c;
    ctx.beginPath();
    ctx.arc(px2, py2, pt.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  drawCharacter(ctx, scene, character, t);

  // bloom
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  try {
    ctx.filter = scene.night ? "blur(6px)" : "blur(4px)";
  } catch {
    /* unsupported */
  }
  ctx.globalAlpha = scene.night ? 0.9 : 0.6;
  ctx.drawImage(scene.glow, 0, 0);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.restore();

  // chaos grade
  const chaos = character.chaos;
  if (chaos < 0.4) {
    ctx.fillStyle = `rgba(30,46,96,${(0.4 - chaos) * 0.8})`;
    ctx.fillRect(0, 0, W, H);
  } else if (chaos > 0.6) {
    ctx.save();
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = `rgba(255,196,90,${(chaos - 0.6) * 0.9})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.62);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, scene.night ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.32)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

function drawCloud(ctx: Ctx, x: number, y: number, s: number) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#ffffff";
  for (const [dx, dy, r] of [
    [0, 0, 18],
    [16, 4, 14],
    [-16, 4, 13],
    [4, -6, 12],
  ] as const) {
    ctx.beginPath();
    ctx.ellipse(x + dx * s, y + dy * s, r * s, r * s * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCharacter(ctx: Ctx, scene: SceneData, character: Character, t: number) {
  const x = scene.charX;
  const y = scene.charY;
  const S = scene.charScale;
  const accent = scene.era.palette.accent;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = hexA(accent, 0.18 + 0.1 * Math.sin(t * 2));
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 11 * S, 5 * S, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 7 * S, 3 * S, 0, 0, Math.PI * 2);
  ctx.fill();

  const bodyH = 14 * S;
  const bw = 5 * S;
  const robe = accent;
  fillQuad(ctx, [x - bw, y - 2 * S, x, y, x, y - bodyH, x - bw, y - bodyH - 2 * S], mul(robe, 0.8));
  fillQuad(ctx, [x, y, x + bw, y - 2 * S, x + bw, y - bodyH - 2 * S, x, y - bodyH], mul(robe, 0.6));

  const hy = y - bodyH - 2 * S;
  const hw = 3.5 * S;
  const skin = "#f0c9a0";
  fillQuad(ctx, [x - hw, hy - 1 * S, x, hy, x, hy - 4 * S, x - hw, hy - 5 * S], mul(skin, 0.85));
  fillQuad(ctx, [x, hy, x + hw, hy - 1 * S, x + hw, hy - 5 * S, x, hy - 4 * S], mul(skin, 0.65));
  fillQuad(ctx, [x - hw, hy - 1 * S, x, hy - 5 * S, x + hw, hy - 1 * S, x, hy + S], mix(skin, "#ffffff", 0.1));

  if (scene.era.index >= 6 || character.attributes.spirit > 400) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const ag = ctx.createRadialGradient(x, hy - 2 * S, 1, x, hy - 2 * S, 22 * S);
    ag.addColorStop(0, hexA(accent, 0.35));
    ag.addColorStop(1, hexA(accent, 0));
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(x, hy - 2 * S, 22 * S, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export { eraProgress };
