import type { Character, Era } from "./types";
import { getEra, eraProgress } from "./eras";
import { fbm, makeRng } from "./chaos";
import { getWonder, type Wonder } from "./wonders";
import { getSpriteEntry, getSpriteImage, getVariantsForStructure } from "./sprites";

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
    case "path": {
      // packed-dirt village road with pebbles and worn wheel lines
      const s = "#b9a276";
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) px(ctx, x, y, mul(s, 0.88 + rng() * 0.2));
      for (let i = 0; i < 10; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, mul(s, 0.72));
      for (let i = 0; i < 6; i++) px(ctx, (rng() * TS) | 0, (rng() * TS) | 0, mul(s, 1.18));
      for (let x = 0; x < TS; x++) {
        px(ctx, x, 5, mul(s, 0.8));
        px(ctx, x, 10, mul(s, 0.8));
      }
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

  // --- roads: BFS shortest paths from home to every building; the union of
  // those paths becomes the village road network (drawn as a packed-dirt top)
  const roadKey = new Set<string>();
  {
    const passable = new Map<string, TileD>();
    for (const t of tiles) if (t.terrain !== "water") passable.set(`${t.col},${t.row}`, t);
    const parent = new Map<string, string | null>();
    const q: string[] = [`${home.col},${home.row}`];
    parent.set(q[0], null);
    while (q.length) {
      const cur = q.shift()!;
      const [cc, cr] = cur.split(",").map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nk = `${cc + dc},${cr + dr}`;
        if (!passable.has(nk) || parent.has(nk)) continue;
        parent.set(nk, cur);
        q.push(nk);
      }
    }
    for (const b of buildings) {
      let cur: string | null | undefined = parent.has(`${b.col},${b.row}`) ? `${b.col},${b.row}` : undefined;
      while (cur) {
        if (cur !== `${b.col},${b.row}`) roadKey.add(cur);
        cur = parent.get(cur) ?? null;
      }
    }
    roadKey.delete(`${home.col},${home.row}`);
    for (const k of builtKey) roadKey.delete(k);
    for (const k of wonderKey) roadKey.delete(k);
  }

  // --- props: set dressing on empty tiles (era-appropriate), boats on water
  const propAt = new Map<string, string>();
  {
    const prng = makeRng((character.seed ^ 0x9e0b) >>> 0);
    const eraPool =
      era.index <= 1
        ? ["well", "fence", "stall", "crates", "bush"]
        : era.index <= 4
          ? ["well", "fence", "stall", "crates", "lamp", "bush"]
          : era.index <= 7
            ? ["lamp", "crates", "fence", "bush"]
            : ["bush", "bush", "lamp-neon"];
    const nearRoadOrBuilding = (t: TileD) =>
      ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dc, dr]) => {
        const nk = `${t.col + dc},${t.row + dr}`;
        return roadKey.has(nk) || builtKey.has(nk);
      });
    for (const t of tiles) {
      const key = `${t.col},${t.row}`;
      if (t.terrain === "water") {
        // rowing boats moored beside the land (pre-space eras)
        const nearLand = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dc, dr]) =>
          tiles.some((o) => o.col === t.col + dc && o.row === t.row + dr && o.terrain !== "water"),
        );
        if (nearLand && era.index >= 1 && era.index <= 7 && prng() < 0.12) propAt.set(key, "boat");
        continue;
      }
      if (builtKey.has(key) || wonderKey.has(key) || roadKey.has(key)) continue;
      if (t.col === home.col && t.row === home.row) continue;
      if (t.terrain === "forest") continue; // trees live there
      if (nearRoadOrBuilding(t) && prng() < 0.4) propAt.set(key, eraPool[(prng() * eraPool.length) | 0]);
      else if (t.terrain === "grass" && era.index <= 4 && prng() < 0.14) propAt.set(key, "farmplot");
      else if (t.terrain === "grass" && prng() < 0.08) propAt.set(key, prng() < 0.6 ? "tree-a" : "tree-b");
    }
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
  // Baked sprites are drawn at ~1.2-1.7 tile-widths and keep their own aspect,
  // so their on-screen height tops out around 4-7 tile-height units — reserve
  // that, not the raw sim floor count (which would waste half the canvas).
  const towerEra = era.structure === "tower" || era.structure === "arcology";
  for (const b of buildings) {
    const t = tiles.find((x) => x.col === b.col && x.row === b.row)!;
    consider(b.col, b.row, t.layers + (towerEra ? 7 : 4), BASE_DEPTH);
  }
  for (const p of wonderPlacements) {
    const t = tiles.find((x) => x.col === p.col && x.row === p.row)!;
    consider(p.col, p.row, t.layers + 6, BASE_DEPTH);
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
    const key = `${t.col},${t.row}`;
    if (t.terrain === "water") {
      drawColumn(ctx, top.x, top.y, SHW, SHH, SCH, 1, SDEPTH * 0.4, "water", "water_deep", "water_deep");
      water.push({ x: top.x, y: top.y });
      const boat = propAt.get(key);
      if (boat) drawProp(ctx, gctx, boat, top.x, top.y + SHH * 0.2, SHW, night);
      continue;
    }
    const m = terrainMats(t.terrain);
    drawColumn(ctx, top.x, top.y, SHW, SHH, SCH, t.layers, SDEPTH, roadKey.has(key) ? "path" : m.top, m.sideTop, m.sideDeep);

    if (t.terrain === "forest" && !builtKey.has(key) && !wonderKey.has(key) && !roadKey.has(key)) {
      const n = 1 + ((treeRng() * 2) | 0);
      for (let k = 0; k < n; k++) {
        const name = treeRng() < 0.65 ? "tree-a" : treeRng() < 0.75 ? "bush" : "tree-b";
        drawProp(ctx, gctx, name, top.x + (treeRng() - 0.5) * SHW * 0.8, top.y + (treeRng() - 0.5) * SHH * 0.8, SHW, night);
      }
    }
    if (wonderKey.has(key)) {
      const wp = wonderPlacements.find((p) => p.col === t.col && p.row === t.row)!;
      drawWonder(ctx, gctx, top.x, top.y, SHW, SHH, SCH, wp.w, era);
    } else {
      const b = buildings.find((x) => x.col === t.col && x.row === t.row);
      if (b) drawBuilding(ctx, gctx, top.x, top.y, SHW, SHH, SCH, b, era);
      else {
        const prop = propAt.get(key);
        if (prop) drawProp(ctx, gctx, prop, top.x, top.y, SHW, night);
      }
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

// Per-prop on-screen width relative to a tile's half-width. Baked sprites keep
// their own aspect, so height follows automatically.
const PROP_SCALE: Record<string, number> = {
  "tree-a": 1.5,
  "tree-b": 1.3,
  bush: 0.8,
  well: 1.0,
  fence: 1.4,
  farmplot: 1.9,
  lamp: 0.55,
  "lamp-neon": 0.55,
  stall: 1.2,
  crates: 0.8,
  boat: 1.3,
};

function drawProp(ctx: Ctx, gctx: Ctx, name: string, cx: number, baseY: number, shw: number, night: boolean) {
  const entry = getSpriteEntry(`prop-${name}`);
  const img = getSpriteImage(`prop-${name}`);
  if (!entry || !img) return;
  const targetW = shw * (PROP_SCALE[name] ?? 1);
  const targetH = targetW * (entry.pxH / entry.pxW);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, cx - targetW / 2, baseY - targetH, targetW, targetH);
  // lamps cast light into the bloom layer after dark
  if (night && (name === "lamp" || name === "lamp-neon")) {
    gctx.fillStyle = "rgba(255,230,160,0.9)";
    gctx.beginPath();
    gctx.arc(cx, baseY - targetH * 0.8, targetW * 0.35, 0, Math.PI * 2);
    gctx.fill();
  }
}

// ---- buildings ----
function drawSpriteFootprint(
  ctx: Ctx,
  img: HTMLCanvasElement | HTMLImageElement,
  cx: number,
  baseY: number,
  targetW: number,
  aspect: number, // pxH / pxW of the source image, preserved to avoid distortion
) {
  const targetH = targetW * aspect;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, cx - targetW / 2, baseY - targetH, targetW, targetH);
  return targetH;
}

function groundShadow(ctx: Ctx, cx: number, baseY: number, w: number) {
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx + w * 0.12, baseY + w * 0.1, w * 0.55, w * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Towers/arcologies are baked whole at discrete floor-count buckets (see
// scripts/bake-sprites) rather than stacked at runtime — stacking flat 2D
// floor slices always left each slice's own top-face diamond visible above
// the next one, since 2D layering can't occlude the way real 3D geometry
// does. A whole pre-baked tower sidesteps that entirely.
const TOWER_STRUCTURES = new Set(["tower", "arcology"]);

function drawBuilding(ctx: Ctx, gctx: Ctx, cx: number, cyTop: number, shw: number, shh: number, sch: number, b: BuildingD, era: Era) {
  const rng = makeRng((b.seed ^ (era.index * 99991)) >>> 0);
  const structure = era.structure;
  const sizeMul = 0.88 + rng() * 0.42;

  if (TOWER_STRUCTURES.has(structure)) {
    const variants = getVariantsForStructure(structure, "building-single" as const);
    if (variants.length === 0) return;
    // pick the baked floor-count bucket closest to what the sim wants
    let chosen = variants[0];
    let bestDiff = Infinity;
    for (const v of variants) {
      const diff = Math.abs((v.floors ?? 0) - b.floors);
      if (diff < bestDiff) {
        bestDiff = diff;
        chosen = v;
      }
    }
    const img = getSpriteImage(chosen.id);
    if (!img) return;

    const targetW = shw * (1.15 + sizeMul * 0.5);
    groundShadow(ctx, cx, cyTop, targetW);
    const aspect = chosen.pxH / chosen.pxW;
    // the body sprite already has its lit windows, corner lights and crown
    // spire baked in with real lighting — only the (blurred) bloom layer
    // needs a separate, restrained pass.
    drawSpriteFootprint(ctx, img, cx, cyTop, targetW, aspect);

    const glow = getSpriteImage(`${chosen.id}-glow`);
    if (glow) {
      gctx.save();
      gctx.globalAlpha = 0.35;
      drawSpriteFootprint(gctx, glow, cx, cyTop, targetW, aspect);
      gctx.restore();
    }
    return;
  }

  // single, fully pre-baked building
  const variants = getVariantsForStructure(structure, "building-single");
  if (variants.length === 0) return;
  const tall = b.floors >= tallThreshold(structure);
  const pool = variants.filter((v) => v.tall === tall);
  const chosen = (pool.length > 0 ? pool : variants)[Math.floor(rng() * (pool.length > 0 ? pool.length : variants.length))];
  const img = getSpriteImage(chosen.id);
  if (!img) return;

  const targetW = shw * (1.0 + sizeMul * 0.45);
  groundShadow(ctx, cx, cyTop, targetW);
  drawSpriteFootprint(ctx, img, cx, cyTop, targetW, chosen.pxH / chosen.pxW);
}

function tallThreshold(structure: string): number {
  switch (structure) {
    case "hut":
      return 6;
    case "temple":
      return 4;
    case "keep":
      return 6;
    case "manor":
      return 5;
    case "factory":
      return 6;
    default:
      return 3;
  }
}

// ============================================================================
// Wonders / landmarks — pre-baked low-poly monuments, larger than ordinary
// buildings, drawn as a single sprite with a soft ambient glow pass.
// ============================================================================
function drawWonder(ctx: Ctx, gctx: Ctx, cx: number, cyTop: number, shw: number, shh: number, sch: number, w: Wonder, era: Era) {
  void shh;
  void sch;
  void era;
  const entry = getSpriteEntry(`wonder-${w.id}`);
  const img = getSpriteImage(`wonder-${w.id}`);
  if (!entry || !img) return;

  const targetW = shw * (w.footprint >= 2 ? 3.2 : 2.4);
  groundShadow(ctx, cx, cyTop, targetW * 1.15);
  const aspect = entry.pxH / entry.pxW;
  drawSpriteFootprint(ctx, img, cx, cyTop, targetW, aspect);

  // every wonder radiates a faint ambient glow — monuments should feel alive
  gctx.save();
  gctx.globalAlpha = 0.5;
  drawSpriteFootprint(gctx, img, cx, cyTop, targetW, aspect);
  gctx.restore();
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
  ctx.globalAlpha = scene.night ? 0.68 : 0.6;
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
