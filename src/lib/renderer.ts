// Canvas2D isometric renderer for "불멸의 연대기".
//
// Implements the art-direction spec: luminance-multiply face shading, edge
// lights, ambient occlusion, directional drop shadows, layered water, era
// silhouettes with an emissive (bloom) layer, atmospheric perspective, fog,
// tone-mapping, vignette, grain and a chaos-driven colour grade.
//
// The renderer is pure drawing logic — it never touches the DOM directly, it
// only draws into a CanvasRenderingContext2D that the caller owns. This keeps
// it usable both for the live <canvas> view and for offscreen snapshot export.

import type { Character, Era } from "./types";
import { getEra, eraProgress } from "./eras";
import { fbm, hash2, makeRng } from "./chaos";

export const TILE_W = 64;
export const TILE_H = 32;
const LAYER = 9; // vertical px per elevation step
const MAX_LAYERS = 5;
const BASE_DEPTH = 7;

// ---------------------------------------------------------------------------
// colour helpers (linear-ish RGB triplets)
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbStr(c: RGB, a = 1): string {
  const r = clamp255(c[0]);
  const g = clamp255(c[1]);
  const b = clamp255(c[2]);
  return a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;
}
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function scaleRgb(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}
function hexMix(a: string, b: string, t: number): string {
  return rgbStr(mixRgb(hexToRgb(a), hexToRgb(b), t));
}

// ---------------------------------------------------------------------------
// lighting constants (spec)
// ---------------------------------------------------------------------------
const FACE_TOP = 1.0;
const FACE_LEFT = 0.78; // light side
const FACE_RIGHT = 0.55; // shade side

function litFace(base: RGB, faceFactor: number, ambient: number): RGB {
  // faceColor = baseColor * (ambient + (1-ambient)*faceFactor)
  return scaleRgb(base, ambient + (1 - ambient) * faceFactor);
}

// ---------------------------------------------------------------------------
// terrain
// ---------------------------------------------------------------------------
type Terrain = "water" | "sand" | "grass" | "forest" | "rock" | "snow";

interface Tile {
  col: number;
  row: number;
  e: number;
  terrain: Terrain;
  layers: number;
  base: RGB;
}

function classify(e: number): Terrain {
  if (e < 0.3) return "water";
  if (e < 0.37) return "sand";
  if (e < 0.6) return "grass";
  if (e < 0.74) return "forest";
  if (e < 0.88) return "rock";
  return "snow";
}

function terrainColor(t: Terrain, era: Era, jitter: number): RGB {
  const p = era.palette;
  const future = era.index >= 8;
  const j = (jitter - 0.5) * 0.12; // ±6% lightness jitter
  let c: RGB;
  switch (t) {
    case "water":
      c = hexToRgb("#1c4a78"); // deep water (shading handled separately)
      break;
    case "sand":
      c = hexToRgb("#d8c48c");
      break;
    case "grass":
      c = hexToRgb(jitter > 0.5 ? p.ground : p.ground2);
      break;
    case "forest":
      c = mixRgb(hexToRgb(p.ground2), hexToRgb("#274d27"), 0.55);
      break;
    case "rock":
      c = future ? mixRgb(hexToRgb("#5a5570"), hexToRgb(p.accent), 0.15) : hexToRgb("#8d8478");
      break;
    case "snow":
      c = future ? mixRgb(hexToRgb("#cfd6ff"), hexToRgb(p.accent), 0.2) : hexToRgb("#e9eef2");
      break;
  }
  return scaleRgb(c, 1 + j);
}

function buildTiles(character: Character, era: Era): Tile[] {
  const N = character.territory;
  const seed = character.seed;
  const tiles: Tile[] = [];
  const c0 = (N - 1) / 2;
  const maxD = Math.hypot(c0, c0) || 1;
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      let e = fbm(col * 0.36 + 1.7, row * 0.36 + 4.3, seed, 4);
      const d = Math.hypot(col - c0, row - c0) / maxD;
      e = e * (1.18 - d * 0.6) - d * 0.12;
      e = Math.max(0, Math.min(1, e));
      const terrain = classify(e);
      const jitter = hash2(col, row, seed + 99);
      const layers =
        terrain === "water" ? 0 : Math.max(1, Math.round(((e - 0.3) / 0.7) * MAX_LAYERS));
      tiles.push({ col, row, e, terrain, layers, base: terrainColor(terrain, era, jitter) });
    }
  }
  return tiles;
}

function groundPos(col: number, row: number): { x: number; y: number } {
  return { x: (col - row) * (TILE_W / 2), y: (col + row) * (TILE_H / 2) };
}

// ---------------------------------------------------------------------------
// scene mood derived from era + chaos
// ---------------------------------------------------------------------------
interface Mood {
  night: boolean;
  ambient: number;
  skyTop: RGB;
  skyMid: RGB;
  skyHorizon: RGB;
  bloomThreshold: number;
  bloomStrength: number;
  vignette: number;
  fog: number;
  // chaos grade
  desat: number; // 0..1 toward grey
  cold: RGB | null;
  gold: RGB | null;
  goldAmt: number;
  grade: RGB; // multiplicative tint
}

function eraSkies(era: Era): { top: RGB; mid: RGB; horizon: RGB; night: boolean } {
  const idx = era.index;
  const sky = hexToRgb(era.palette.sky);
  if (idx >= 8) {
    // space / ultra-future: deep blue night
    const top = mixRgb(sky, [8, 6, 24], 0.55);
    const mid = sky;
    const horizon = mixRgb(sky, hexToRgb(era.palette.accent), 0.18);
    return { top, mid, horizon, night: true };
  }
  if (idx === 5) {
    // industrial: sepia / smog
    const top = mixRgb(sky, [120, 96, 70], 0.4);
    const mid = sky;
    const horizon = mixRgb(sky, [150, 120, 86], 0.5);
    return { top, mid, horizon, night: false };
  }
  if (idx === 3) {
    // medieval: cold dawn
    const top = mixRgb(sky, [120, 140, 170], 0.45);
    const mid = sky;
    const horizon = mixRgb(sky, [210, 180, 160], 0.45);
    return { top, mid, horizon, night: false };
  }
  // default warm-ish day
  const top = scaleRgb(sky, 1.12);
  const mid = sky;
  const horizon = scaleRgb(sky, 0.82);
  return { top, mid, horizon, night: false };
}

function buildMood(character: Character, era: Era): Mood {
  const s = eraSkies(era);
  const night = s.night;
  let ambient = night ? 0.3 : 0.42;
  let vignette = night ? 0.45 : 0.35;
  let fog = night ? 0.18 : 0.1;
  const bloomThreshold = 0.75;
  let bloomStrength = night ? 0.9 : 0.5;

  // chaos integration
  const chaos = character.chaos;
  let desat = 0;
  let cold: RGB | null = null;
  let gold: RGB | null = null;
  let goldAmt = 0;
  let grade: RGB = [1, 1, 1];

  if (chaos < 0.4) {
    const k = (0.4 - chaos) / 0.4; // 0..1
    desat = 0.35 * k;
    cold = [120, 150, 210];
    fog += 0.12 * k;
    vignette += 0.18 * k;
    ambient -= 0.05 * k;
    grade = [1 - 0.06 * k, 1 - 0.03 * k, 1 + 0.04 * k];
  } else if (chaos > 0.6) {
    const k = (chaos - 0.6) / 0.4; // 0..1
    gold = [255, 205, 120];
    goldAmt = 0.28 * k;
    bloomStrength += 0.4 * k;
    grade = [1 + 0.1 * k, 1 + 0.05 * k, 1 - 0.04 * k];
  }

  return {
    night,
    ambient,
    skyTop: s.top,
    skyMid: s.mid,
    skyHorizon: s.horizon,
    bloomThreshold,
    bloomStrength,
    vignette,
    fog,
    desat,
    cold,
    gold,
    goldAmt,
    grade,
  };
}

// ---------------------------------------------------------------------------
// drawing primitives
// ---------------------------------------------------------------------------
const SUN = { x: -0.5, y: -1.0, z: -0.7 }; // sunDir

function diamondPath(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - TILE_H / 2);
  ctx.lineTo(cx + TILE_W / 2, cy);
  ctx.lineTo(cx, cy + TILE_H / 2);
  ctx.lineTo(cx - TILE_W / 2, cy);
  ctx.closePath();
}

interface DrawCtx {
  ctx: CanvasRenderingContext2D;
  emis: CanvasRenderingContext2D; // emissive/bloom layer
  mood: Mood;
  era: Era;
  time: number;
  N: number;
}

function depthFog(base: RGB, depth: number, mood: Mood): RGB {
  // atmospheric perspective: mix toward sky horizon with depth
  const c = mixRgb(base, mood.skyHorizon, depth * 0.18);
  // chaos colour grade
  let out: RGB = [c[0] * mood.grade[0], c[1] * mood.grade[1], c[2] * mood.grade[2]];
  if (mood.desat > 0) {
    const lum = out[0] * 0.299 + out[1] * 0.587 + out[2] * 0.114;
    out = mixRgb(out, [lum, lum, lum], mood.desat);
    if (mood.cold) out = mixRgb(out, mood.cold, mood.desat * 0.25);
  }
  if (mood.gold) out = mixRgb(out, mood.gold, mood.goldAmt * 0.4);
  return out;
}

function drawTileColumn(d: DrawCtx, tile: Tile, cx: number, sy: number, neighbours: NeighbourInfo) {
  const { ctx, mood, N } = d;
  const depth = (tile.col + tile.row) / (2 * (N - 1 || 1));
  const base = depthFog(tile.base, depth, mood);

  const top = sy - tile.layers * LAYER;
  const colDepth = tile.layers * LAYER + BASE_DEPTH;

  // --- side faces (luminance multiply) ---
  const leftC = litFace(base, FACE_LEFT, mood.ambient);
  const rightC = litFace(base, FACE_RIGHT, mood.ambient);

  // left face
  ctx.fillStyle = rgbStr(leftC);
  ctx.beginPath();
  ctx.moveTo(cx - TILE_W / 2, top);
  ctx.lineTo(cx, top + TILE_H / 2);
  ctx.lineTo(cx, top + TILE_H / 2 + colDepth);
  ctx.lineTo(cx - TILE_W / 2, top + colDepth);
  ctx.closePath();
  ctx.fill();
  // stratum lines on tall cliffs
  if (tile.layers >= 3 && (tile.terrain === "rock" || tile.terrain === "snow")) {
    ctx.strokeStyle = rgbStr(scaleRgb(leftC, 0.7), 0.5);
    ctx.lineWidth = 1;
    for (let l = 1; l < tile.layers; l++) {
      const yy = top + TILE_H / 4 + (l / tile.layers) * colDepth;
      ctx.beginPath();
      ctx.moveTo(cx - TILE_W / 2, yy);
      ctx.lineTo(cx, yy + TILE_H / 2);
      ctx.stroke();
    }
  }

  // right face
  ctx.fillStyle = rgbStr(rightC);
  ctx.beginPath();
  ctx.moveTo(cx + TILE_W / 2, top);
  ctx.lineTo(cx, top + TILE_H / 2);
  ctx.lineTo(cx, top + TILE_H / 2 + colDepth);
  ctx.lineTo(cx + TILE_W / 2, top + colDepth);
  ctx.closePath();
  ctx.fill();

  // --- top diamond ---
  if (tile.terrain === "water") {
    drawWaterTop(d, tile, cx, top, base, depth);
  } else {
    const topC = litFace(base, FACE_TOP, mood.ambient);
    ctx.fillStyle = rgbStr(topC);
    diamondPath(ctx, cx, top);
    ctx.fill();

    // edge light: top-left two edges +18% (1px), bottom-right two edges -22%
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgbStr(scaleRgb(topC, 1.18), 0.9);
    ctx.beginPath();
    ctx.moveTo(cx - TILE_W / 2, top);
    ctx.lineTo(cx, top - TILE_H / 2);
    ctx.lineTo(cx + TILE_W / 2, top);
    ctx.stroke();
    ctx.strokeStyle = rgbStr(scaleRgb(topC, 0.78), 0.9);
    ctx.beginPath();
    ctx.moveTo(cx + TILE_W / 2, top);
    ctx.lineTo(cx, top + TILE_H / 2);
    ctx.lineTo(cx - TILE_W / 2, top);
    ctx.stroke();

    drawTileDetail(d, tile, cx, top, topC);
  }

  // --- AO toward higher neighbours (top edges) ---
  drawAO(d, tile, cx, top, neighbours);
}

interface NeighbourInfo {
  // is the neighbour on that edge higher than this tile?
  nw: boolean; // up-left
  ne: boolean; // up-right
}

function drawAO(d: DrawCtx, _tile: Tile, cx: number, top: number, n: NeighbourInfo) {
  const { ctx } = d;
  if (n.ne) {
    // higher tile up-right → shade NE edge (cx..cx+W/2 along top-right)
    const grad = ctx.createLinearGradient(cx, top - TILE_H / 2, cx + TILE_W / 4, top - TILE_H / 4);
    grad.addColorStop(0, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, top - TILE_H / 2);
    ctx.lineTo(cx + TILE_W / 2, top);
    ctx.lineTo(cx + TILE_W / 4, top - TILE_H / 8);
    ctx.closePath();
    ctx.fill();
  }
  if (n.nw) {
    const grad = ctx.createLinearGradient(cx, top - TILE_H / 2, cx - TILE_W / 4, top - TILE_H / 4);
    grad.addColorStop(0, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx, top - TILE_H / 2);
    ctx.lineTo(cx - TILE_W / 2, top);
    ctx.lineTo(cx - TILE_W / 4, top - TILE_H / 8);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWaterTop(d: DrawCtx, tile: Tile, cx: number, top: number, base: RGB, depth: number) {
  const { ctx, mood, time, era } = d;
  const future = era.index >= 8;
  const deep = depthFog(hexToRgb("#1c4a78"), depth, mood);
  const shallow = depthFog(future ? mixRgb(hexToRgb("#3f8fc4"), hexToRgb("#2effe8"), 0.25) : hexToRgb("#3f8fc4"), depth, mood);
  // shallower (lower e closer to 0.3 boundary => shore) -> mix toward shallow
  const shoreT = Math.max(0, Math.min(1, (0.3 - tile.e) / 0.3 + 0.3));
  const wcol = mixRgb(deep, shallow, shoreT * 0.6);
  ctx.fillStyle = rgbStr(litFace(wcol, 0.95, mood.ambient));
  diamondPath(ctx, cx, top);
  ctx.fill();

  // two scrolling sine wavelets (opposite directions)
  ctx.save();
  diamondPath(ctx, cx, top);
  ctx.clip();
  const w1 = Math.sin(time * 1.3 + (tile.col - tile.row) * 0.9);
  const w2 = Math.sin(-time * 0.9 + (tile.col + tile.row) * 1.1);
  ctx.strokeStyle = rgbStr(scaleRgb(wcol, 1.4), 0.4);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - TILE_W / 2, top + w1 * 2);
  ctx.quadraticCurveTo(cx, top + 4 + w1 * 2, cx + TILE_W / 2, top + w1 * 2);
  ctx.stroke();
  ctx.strokeStyle = rgbStr(scaleRgb(wcol, 1.25), 0.3);
  ctx.beginPath();
  ctx.moveTo(cx - TILE_W / 2, top - 3 + w2 * 2);
  ctx.quadraticCurveTo(cx, top + 1 + w2 * 2, cx + TILE_W / 2, top - 3 + w2 * 2);
  ctx.stroke();
  ctx.restore();

  // shore foam pulse near shallow tiles
  if (shoreT > 0.55) {
    const pulse = 0.3 + 0.3 * (0.5 + 0.5 * Math.sin(time * 2.2 + tile.col + tile.row));
    const foam = future ? "rgba(200,255,250," : "rgba(207,234,247,";
    ctx.strokeStyle = `${foam}${pulse.toFixed(2)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - TILE_W / 2 + 4, top + TILE_H / 2 - 4);
    ctx.lineTo(cx, top + TILE_H / 2 - 1);
    ctx.lineTo(cx + TILE_W / 2 - 4, top + TILE_H / 2 - 4);
    ctx.stroke();
  }
}

function drawTileDetail(d: DrawCtx, tile: Tile, cx: number, top: number, topC: RGB) {
  const { ctx } = d;
  const r = makeRng(((tile.col + 1) * 92821) ^ ((tile.row + 1) * 53987));
  ctx.save();
  diamondPath(ctx, cx, top);
  ctx.clip();
  if (tile.terrain === "grass" || tile.terrain === "forest") {
    // noise lightness blobs
    const blobs = 4 + Math.floor(r() * 3);
    for (let i = 0; i < blobs; i++) {
      const bx = cx + (r() - 0.5) * TILE_W * 0.7;
      const by = top + (r() - 0.5) * TILE_H * 0.7;
      const k = r() > 0.5 ? 1.08 : 0.92;
      ctx.fillStyle = rgbStr(scaleRgb(topC, k), 0.5);
      ctx.beginPath();
      ctx.ellipse(bx, by, 6 + r() * 4, 3 + r() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // edge grass blades
    const blades = 5 + Math.floor(r() * 3);
    ctx.strokeStyle = rgbStr(scaleRgb(topC, 0.7), 0.7);
    ctx.lineWidth = 1;
    for (let i = 0; i < blades; i++) {
      const bx = cx + (r() - 0.5) * TILE_W * 0.55;
      const by = top + (r() - 0.5) * TILE_H * 0.4 + 2;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx + (r() - 0.5) * 2, by - 3 - r() * 2);
      ctx.stroke();
    }
  } else if (tile.terrain === "sand") {
    for (let i = 0; i < 5; i++) {
      const bx = cx + (r() - 0.5) * TILE_W * 0.6;
      const by = top + (r() - 0.5) * TILE_H * 0.6;
      ctx.fillStyle = rgbStr(scaleRgb(topC, 0.85), 0.5);
      ctx.beginPath();
      ctx.arc(bx, by, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (tile.terrain === "rock") {
    // cracks
    ctx.strokeStyle = rgbStr(scaleRgb(topC, 0.55), 0.6);
    ctx.lineWidth = 1;
    for (let i = 0; i < 2 + Math.floor(r() * 2); i++) {
      const sx = cx + (r() - 0.5) * TILE_W * 0.4;
      const sy = top + (r() - 0.5) * TILE_H * 0.4;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + (r() - 0.5) * 14, sy + (r() - 0.5) * 8);
      ctx.stroke();
    }
    // protruding highlight
    ctx.fillStyle = rgbStr(scaleRgb(topC, 1.3), 0.6);
    ctx.beginPath();
    ctx.ellipse(cx + (r() - 0.5) * 8, top - 2, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (tile.terrain === "snow") {
    // blue shadow patch + sparkle
    ctx.fillStyle = "rgba(150,180,230,0.3)";
    ctx.beginPath();
    ctx.ellipse(cx + (r() - 0.5) * 10, top + 3, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(cx + (r() - 0.5) * TILE_W * 0.5, top + (r() - 0.5) * TILE_H * 0.5, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// directional drop shadow (ground projection)
function drawDropShadow(d: DrawCtx, cx: number, baseY: number, height: number, radius: number) {
  const { ctx } = d;
  const len = height * 0.6;
  // shadow falls opposite to sun (sun is to upper-left, so shadow to lower-right)
  const dx = 0.5 * len * 0.5;
  const dy = 0.4 * len * 0.4 + 4;
  ctx.save();
  ctx.filter = "blur(3px)";
  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.beginPath();
  ctx.ellipse(cx + dx, baseY + dy * 0.3, radius * 1.1, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// trees / buildings / character
// ---------------------------------------------------------------------------
function drawTree(d: DrawCtx, cx: number, baseY: number) {
  const { ctx, era, mood } = d;
  const canopy = era.index >= 8 ? mixRgb(hexToRgb("#2f5d2f"), hexToRgb(era.palette.accent), 0.35) : hexToRgb("#2f6b34");
  drawDropShadow(d, cx, baseY, 14, 6);
  ctx.fillStyle = "#6b4a2b";
  ctx.fillRect(cx - 1.5, baseY - 10, 3, 10);
  const lit = (c: RGB, f: number) => rgbStr(litFace(c, f, mood.ambient));
  ctx.fillStyle = lit(canopy, 0.82);
  ctx.beginPath();
  ctx.arc(cx, baseY - 14, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit(canopy, 1.0);
  ctx.beginPath();
  ctx.arc(cx - 3, baseY - 12, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = lit(scaleRgb(canopy, 1.12), 1.0);
  ctx.beginPath();
  ctx.arc(cx + 3, baseY - 16, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBuilding(d: DrawCtx, cx: number, baseY: number, h: number, seedTile: number) {
  const { ctx, emis, era, mood, time } = d;
  const { structure, palette } = era;
  const wallW = TILE_W * 0.46;
  const left = litFace(hexToRgb(palette.structure), FACE_LEFT, mood.ambient);
  const right = litFace(hexToRgb(palette.structure), FACE_RIGHT, mood.ambient);
  const top = baseY - h;
  const r = makeRng(seedTile);
  const accent = hexToRgb(palette.accent);

  drawDropShadow(d, cx, baseY, h, wallW * 0.7);

  // walls
  ctx.fillStyle = rgbStr(left);
  ctx.beginPath();
  ctx.moveTo(cx - wallW / 2, baseY);
  ctx.lineTo(cx, baseY + TILE_H / 4);
  ctx.lineTo(cx, top + TILE_H / 4);
  ctx.lineTo(cx - wallW / 2, top);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgbStr(right);
  ctx.beginPath();
  ctx.moveTo(cx + wallW / 2, baseY);
  ctx.lineTo(cx, baseY + TILE_H / 4);
  ctx.lineTo(cx, top + TILE_H / 4);
  ctx.lineTo(cx + wallW / 2, top);
  ctx.closePath();
  ctx.fill();

  // roof
  const roofC = hexToRgb(palette.structureRoof);
  const pitched = ["hut", "temple", "keep", "manor"].includes(structure);
  if (pitched) {
    const peak = top - TILE_H * 0.55;
    ctx.fillStyle = rgbStr(litFace(roofC, 0.9, mood.ambient));
    ctx.beginPath();
    ctx.moveTo(cx - wallW / 2, top);
    ctx.lineTo(cx, top + TILE_H / 4);
    ctx.lineTo(cx + wallW / 2, top);
    ctx.lineTo(cx, peak);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = rgbStr(litFace(roofC, 1.0, mood.ambient));
    ctx.beginPath();
    ctx.moveTo(cx - wallW / 2, top);
    ctx.lineTo(cx, top + TILE_H / 4);
    ctx.lineTo(cx + wallW / 2, top);
    ctx.lineTo(cx, top - TILE_H / 4);
    ctx.closePath();
    ctx.fill();
  }

  // ---- era-specific silhouette details ----
  drawEraDetails(d, structure, cx, baseY, top, wallW, h, r, accent);

  // ---- windows / neon → emissive layer for bloom ----
  if (era.index >= 5) {
    const rows = Math.min(8, Math.floor(h / 11));
    for (let i = 0; i < rows; i++) {
      const wy = top + 12 + i * 11;
      if (wy > baseY - 5) break;
      const litL = r() > 0.4;
      // left wall windows
      if (litL) {
        emis.fillStyle = rgbStr(scaleRgb(accent, 1.1));
        emis.fillRect(cx - wallW / 2 + 5, wy, 5, 6);
      } else {
        ctx.fillStyle = rgbStr(scaleRgb(left, 0.6));
        ctx.fillRect(cx - wallW / 2 + 5, wy, 5, 6);
      }
      const litR = r() > 0.5;
      if (litR) {
        emis.fillStyle = rgbStr(scaleRgb(accent, 0.9));
        emis.fillRect(cx + 4, wy, 5, 6);
      } else {
        ctx.fillStyle = rgbStr(scaleRgb(right, 0.6));
        ctx.fillRect(cx + 4, wy, 5, 6);
      }
    }
  } else {
    // doorway
    ctx.fillStyle = rgbStr(scaleRgb(left, 0.45));
    ctx.fillRect(cx - 3, baseY - 9, 6, 9);
  }
  // suppress unused warning for time in non-animated branches
  void time;
}

function drawEraDetails(
  d: DrawCtx,
  structure: string,
  cx: number,
  baseY: number,
  top: number,
  wallW: number,
  h: number,
  r: () => number,
  accent: RGB,
) {
  const { ctx, emis, mood, time } = d;
  switch (structure) {
    case "temple": {
      // front columns
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      const cols = 4;
      for (let i = 0; i < cols; i++) {
        const px = cx - wallW / 2 + 4 + (i * (wallW - 8)) / (cols - 1);
        ctx.fillRect(px - 1, top + 6, 2, h - 8);
      }
      break;
    }
    case "keep": {
      // crenellations + arrow slit + flag
      ctx.fillStyle = rgbStr(scaleRgb(hexToRgb("#8d8f96"), 0.6));
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(cx - wallW / 2 + i * (wallW / 4), top - 4, wallW / 8, 4);
      }
      ctx.strokeStyle = "rgba(0,0,0,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 6, top + 14);
      ctx.lineTo(cx - 6, top + 22);
      ctx.stroke();
      // flag waving
      const fw = Math.sin(time * 3) * 3;
      ctx.fillStyle = rgbStr(accent);
      ctx.beginPath();
      ctx.moveTo(cx, top - TILE_H * 0.55);
      ctx.lineTo(cx + 10 + fw, top - TILE_H * 0.55 + 3);
      ctx.lineTo(cx, top - TILE_H * 0.55 + 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5a4a3a";
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, top - TILE_H * 0.6);
      ctx.stroke();
      break;
    }
    case "factory": {
      // chimney + smoke particles + saw-tooth roof
      const chx = cx + wallW / 2 - 6;
      ctx.fillStyle = rgbStr(scaleRgb(hexToRgb("#5a3a2a"), 1.0));
      ctx.fillRect(chx, top - 18, 6, 18);
      for (let i = 0; i < 4; i++) {
        const t2 = (time * 0.6 + i * 0.3) % 1;
        const sy = top - 18 - t2 * 26;
        ctx.fillStyle = `rgba(80,80,80,${(0.4 * (1 - t2)).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(chx + 3 + Math.sin(t2 * 6) * 3, sy, 3 + t2 * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "dome": {
      // glowing ring + antenna
      emis.strokeStyle = rgbStr(accent, 0.9);
      emis.lineWidth = 2;
      emis.beginPath();
      emis.ellipse(cx, top, wallW / 2, TILE_H / 3, 0, 0, Math.PI * 2);
      emis.stroke();
      ctx.strokeStyle = rgbStr(scaleRgb(accent, 0.8));
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, top - TILE_H / 4);
      ctx.lineTo(cx, top - TILE_H / 4 - 12);
      ctx.stroke();
      emis.fillStyle = rgbStr(accent);
      emis.beginPath();
      emis.arc(cx, top - TILE_H / 4 - 12, 2, 0, Math.PI * 2);
      emis.fill();
      break;
    }
    case "arcology": {
      // strong neon edge strips
      emis.strokeStyle = rgbStr(accent);
      emis.lineWidth = 2.2;
      emis.beginPath();
      emis.moveTo(cx - wallW / 2, baseY);
      emis.lineTo(cx - wallW / 2, top);
      emis.lineTo(cx, top + TILE_H / 4);
      emis.lineTo(cx + wallW / 2, top);
      emis.lineTo(cx + wallW / 2, baseY);
      emis.stroke();
      emis.strokeStyle = rgbStr(hexToRgb("#ff6ad8"));
      emis.lineWidth = 1.4;
      emis.beginPath();
      emis.moveTo(cx, top + TILE_H / 4);
      emis.lineTo(cx, baseY + TILE_H / 4);
      emis.stroke();
      break;
    }
    case "tower": {
      // glass curtain-wall grid lines
      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.lineWidth = 1;
      for (let gx = cx - wallW / 2 + 6; gx < cx + wallW / 2; gx += 8) {
        ctx.beginPath();
        ctx.moveTo(gx, top);
        ctx.lineTo(gx, baseY);
        ctx.stroke();
      }
      break;
    }
    default:
      break;
  }
  void mood;
}

function drawCharacter(d: DrawCtx, cx: number, feetY: number, character: Character) {
  const { ctx, emis, era, mood, time } = d;
  const maturity = Math.min(1, character.age / 80);
  const scale = (0.8 + maturity * 0.5) * 1.4; // 1.3~1.5× emphasis
  const bodyH = 18 * scale;
  const headR = 4.5 * scale;
  const robe = hexToRgb(era.palette.accent);
  const skin: RGB = [240, 201, 160];
  const bodyTop = feetY - bodyH;
  const headCy = bodyTop - headR;
  const accent = hexToRgb(era.palette.accent);

  // focus ring (pulse)
  const pulse = 0.18 + 0.12 * (0.5 + 0.5 * Math.sin(time * 2.4));
  ctx.strokeStyle = rgbStr(accent, pulse);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, feetY + 2, 13 * scale, 5.5 * scale, 0, 0, Math.PI * 2);
  ctx.stroke();

  drawDropShadow(d, cx, feetY, bodyH, 9 * scale);

  // spirit aura — rising particles when spirit high
  const spirit = character.attributes.spirit ?? 0;
  if (spirit > 20) {
    const count = Math.min(8, Math.floor(spirit / 12));
    for (let i = 0; i < count; i++) {
      const ph = (time * 0.5 + i / count) % 1;
      const ax = cx + Math.sin(time + i * 2) * 8 * scale;
      const ay = feetY - ph * (bodyH + 18);
      emis.fillStyle = rgbStr(accent, (1 - ph) * 0.8);
      emis.beginPath();
      emis.arc(ax, ay, 1.4, 0, Math.PI * 2);
      emis.fill();
    }
  }

  // robe (two faces)
  ctx.fillStyle = rgbStr(litFace(robe, FACE_LEFT, mood.ambient));
  ctx.beginPath();
  ctx.moveTo(cx - 5 * scale, feetY);
  ctx.lineTo(cx + 5 * scale, feetY);
  ctx.lineTo(cx + 3.5 * scale, bodyTop);
  ctx.lineTo(cx - 3.5 * scale, bodyTop);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgbStr(litFace(robe, FACE_RIGHT, mood.ambient));
  ctx.beginPath();
  ctx.moveTo(cx, feetY);
  ctx.lineTo(cx + 5 * scale, feetY);
  ctx.lineTo(cx + 3.5 * scale, bodyTop);
  ctx.lineTo(cx, bodyTop);
  ctx.closePath();
  ctx.fill();

  // head
  ctx.fillStyle = rgbStr(skin);
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  // hair / hood
  ctx.fillStyle = rgbStr(scaleRgb(robe, 0.6));
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, Math.PI, Math.PI * 2);
  ctx.fill();

  // rim light (1px)
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 3.5 * scale, bodyTop);
  ctx.lineTo(cx - 5 * scale, feetY);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, headCy, headR, Math.PI * 0.9, Math.PI * 1.4);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// sky / atmosphere
// ---------------------------------------------------------------------------
function drawSky(d: DrawCtx, character: Character, width: number, height: number) {
  const { ctx, mood, time, era } = d;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, rgbStr(mood.skyTop));
  grad.addColorStop(0.55, rgbStr(mood.skyMid));
  grad.addColorStop(1, rgbStr(mood.skyHorizon));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  const rs = makeRng((character.seed ^ 0x5eed) >>> 0);
  if (mood.night) {
    // stars twinkle
    for (let i = 0; i < 60; i++) {
      const sx = rs() * width;
      const sy = rs() * height * 0.55;
      const base2 = 0.3 + rs() * 0.5;
      const tw = base2 * (0.6 + 0.4 * Math.sin(time * 2 + i));
      ctx.fillStyle = `rgba(255,255,255,${tw.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, rs() * 1.1 + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    // occasional meteor
    const meteorT = (time * 0.12) % 6;
    if (meteorT < 0.5) {
      const mx = width * 0.2 + meteorT * width * 0.6;
      const my = height * 0.1 + meteorT * height * 0.2;
      const g2 = ctx.createLinearGradient(mx - 30, my - 12, mx, my);
      g2.addColorStop(0, "rgba(255,255,255,0)");
      g2.addColorStop(1, "rgba(255,255,255,0.9)");
      ctx.strokeStyle = g2;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx - 30, my - 12);
      ctx.lineTo(mx, my);
      ctx.stroke();
    }
    // moon halo
    const mx = width * 0.8;
    const my = height * 0.2;
    const halo = ctx.createRadialGradient(mx, my, 4, mx, my, 50);
    halo.addColorStop(0, rgbStr(hexToRgb(era.palette.accent), 0.5));
    halo.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgbStr(hexToRgb(era.palette.accent), 0.85);
    ctx.beginPath();
    ctx.arc(mx, my, 12, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // sun + halo
    const sx = width * 0.78;
    const sy = height * 0.2;
    const halo = ctx.createRadialGradient(sx, sy, 6, sx, sy, 70);
    halo.addColorStop(0, "rgba(255,250,220,0.7)");
    halo.addColorStop(1, "rgba(255,250,220,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sx, sy, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,252,235,0.95)";
    ctx.beginPath();
    ctx.arc(sx, sy, 16, 0, Math.PI * 2);
    ctx.fill();
    // drifting clouds
    for (let i = 0; i < 4; i++) {
      const speed = 8 + i * 4;
      const cxp = ((rs() * width + time * speed) % (width + 120)) - 60;
      const cyp = height * (0.08 + rs() * 0.22);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      for (let b = 0; b < 4; b++) {
        ctx.beginPath();
        ctx.ellipse(cxp + b * 16, cyp + (b % 2) * 4, 18, 9, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawParticles(d: DrawCtx, character: Character, width: number, height: number) {
  const { ctx, era, time, mood } = d;
  const rs = makeRng((character.seed ^ 0xa11ce) >>> 0);
  const count = 24 + Math.floor(character.chaos * 16);
  let col = "rgba(255,255,255,0.25)";
  if (era.index === 5) col = "rgba(90,80,70,0.4)"; // smog
  else if (era.index >= 8) col = rgbStr(hexToRgb(era.palette.accent), 0.5); // data fireflies
  else if (era.index >= 6) col = rgbStr(hexToRgb(era.palette.accent), 0.4);
  if (mood.gold) col = "rgba(255,210,130,0.6)"; // boom gold particles

  for (let i = 0; i < count; i++) {
    const seedx = rs();
    const seedy = rs();
    const drift = era.index >= 8 ? Math.sin(time + i) * 20 : time * (6 + seedx * 8);
    const px = (seedx * width + drift) % width;
    const py = (seedy * height - (era.index === 5 ? -time * 4 : time * 6)) % height;
    const yy = (py + height) % height;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px, yy, era.index >= 8 ? 1.3 : 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// main scene draw (pre-post)
// ---------------------------------------------------------------------------
function buildNeighbourMap(tiles: Tile[], N: number): Map<string, NeighbourInfo> {
  const layerAt = new Map<string, number>();
  for (const t of tiles) layerAt.set(`${t.col},${t.row}`, t.layers);
  const map = new Map<string, NeighbourInfo>();
  for (const t of tiles) {
    const here = t.layers;
    const nw = (layerAt.get(`${t.col},${t.row - 1}`) ?? 0) > here; // up-left in iso (row-1)
    const ne = (layerAt.get(`${t.col - 1},${t.row}`) ?? 0) > here; // up-right (col-1)
    map.set(`${t.col},${t.row}`, { nw, ne });
  }
  return map;
}

interface SceneScene {
  draw: (
    ctx: CanvasRenderingContext2D,
    emis: CanvasRenderingContext2D,
    time: number,
  ) => void;
  era: Era;
  mood: Mood;
}

export function prepareScene(character: Character, width: number, height: number): SceneScene {
  const era = getEra(character.techLevel);
  const mood = buildMood(character, era);
  const N = character.territory;
  const tiles = buildTiles(character, era);
  const neighbours = buildNeighbourMap(tiles, N);

  // fit-to-canvas transform
  const spanX = N * TILE_W;
  const maxBuildingH = 150;
  const minY = -MAX_LAYERS * LAYER - maxBuildingH - TILE_H / 2;
  const maxY = (N - 1) * TILE_H + TILE_H / 2 + BASE_DEPTH + MAX_LAYERS * LAYER;
  const spanY = maxY - minY;
  const minX = -((N - 1) * TILE_W) / 2 - TILE_W / 2;
  const pad = 16;
  const s = Math.min(2.0, (width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const tx = (width - s * spanX) / 2 - s * minX;
  const ty = (height - s * spanY) / 2 - s * minY;

  // home tile
  const c0 = (N - 1) / 2;
  let home = tiles[0];
  let bestD = Infinity;
  for (const t of tiles) {
    if (t.terrain === "water") continue;
    const dd = Math.hypot(t.col - c0, t.row - c0);
    if (dd < bestD) {
      bestD = dd;
      home = t;
    }
  }

  // building placement (deterministic)
  const rb = makeRng((character.seed ^ (era.index * 2654435761)) >>> 0);
  const density = Math.min(N * N - 1, 3 + Math.floor(character.techLevel / 55) + Math.floor(N / 2));
  const buildable = tiles.filter(
    (t) =>
      (t.terrain === "grass" || t.terrain === "sand" || t.terrain === "forest") &&
      t.layers <= 3 &&
      !(t.col === home.col && t.row === home.row),
  );
  for (let i = buildable.length - 1; i > 0; i--) {
    const j = Math.floor(rb() * (i + 1));
    [buildable[i], buildable[j]] = [buildable[j], buildable[i]];
  }
  const builtSet = new Set<string>();
  for (let i = 0; i < Math.min(density, buildable.length); i++) {
    builtSet.add(`${buildable[i].col},${buildable[i].row}`);
  }
  const visualTier = Math.min(era.index, 9);
  const ordered = [...tiles].sort((a, b) => a.col + a.row - (b.col + b.row));

  const draw = (
    ctx: CanvasRenderingContext2D,
    emis: CanvasRenderingContext2D,
    time: number,
  ) => {
    const d: DrawCtx = { ctx, emis, mood, era, time, N };

    drawSky(d, character, width, height);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(s, s);
    emis.save();
    emis.translate(tx, ty);
    emis.scale(s, s);

    for (const t of ordered) {
      const g = groundPos(t.col, t.row);
      const nb = neighbours.get(`${t.col},${t.row}`) ?? { nw: false, ne: false };
      drawTileColumn(d, t, g.x, g.y, nb);
      const topY = g.y - t.layers * LAYER;

      if (t.terrain === "forest" && !builtSet.has(`${t.col},${t.row}`)) {
        const tr = makeRng(((t.col + 5) * 40503) ^ ((t.row + 5) * 12289));
        const n = 1 + Math.floor(tr() * 2);
        for (let k = 0; k < n; k++) {
          drawTree(d, g.x + (tr() - 0.5) * 16, topY + (tr() - 0.5) * 8);
        }
      }
      if (builtSet.has(`${t.col},${t.row}`)) {
        const baseH = 16 + visualTier * 5;
        const h =
          baseH +
          makeRng(((t.col + 1) * 7919) ^ ((t.row + 1) * 104729))() * (visualTier >= 6 ? 70 : 22);
        drawBuilding(d, g.x, topY, h, ((t.col * 31 + t.row) ^ era.index) >>> 0);
      }
      if (t.col === home.col && t.row === home.row) {
        drawCharacter(d, g.x, topY, character);
      }
    }

    ctx.restore();
    emis.restore();

    drawParticles(d, character, width, height);
  };

  return { draw, era, mood };
}

// ---------------------------------------------------------------------------
// post-processing (bloom, tone-map, vignette, grain)
// ---------------------------------------------------------------------------
function makeCanvas(w: number, h: number): { c: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D } {
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    const ctx = c.getContext("2d") as unknown as CanvasRenderingContext2D;
    return { c, ctx };
  }
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d")! };
}

/**
 * Renders one frame into `target` with the full post chain. `target` must be a
 * 2D context sized (width,height). Safe to call only when a canvas backend is
 * available (browser / worker). Returns nothing.
 */
export function renderFrame(
  target: CanvasRenderingContext2D,
  scene: SceneScene,
  character: Character,
  width: number,
  height: number,
  time: number,
) {
  const mood = scene.mood;

  // base + emissive buffers
  const base = makeCanvas(width, height);
  const emisBuf = makeCanvas(width, height);
  emisBuf.ctx.clearRect(0, 0, width, height);
  scene.draw(base.ctx, emisBuf.ctx, time);

  // ---- bloom: blur the emissive layer and add ----
  const bloom = makeCanvas(width, height);
  bloom.ctx.filter = `blur(${(4 + mood.bloomStrength * 5).toFixed(1)}px)`;
  bloom.ctx.drawImage(emisBuf.c as CanvasImageSource, 0, 0);
  bloom.ctx.filter = "none";

  // compose base
  target.clearRect(0, 0, width, height);
  target.drawImage(base.c as CanvasImageSource, 0, 0);

  // add bloom (emissive is already above threshold by construction)
  target.save();
  target.globalCompositeOperation = "lighter";
  target.globalAlpha = mood.bloomStrength;
  target.drawImage(bloom.c as CanvasImageSource, 0, 0);
  // a second tighter pass for the core glow
  target.globalAlpha = mood.bloomStrength * 0.6;
  target.drawImage(emisBuf.c as CanvasImageSource, 0, 0);
  target.restore();

  // ---- fog: bottom horizon haze ----
  const fog = target.createLinearGradient(0, height * 0.5, 0, height);
  fog.addColorStop(0, rgbStr(mood.skyHorizon, 0));
  fog.addColorStop(1, rgbStr(mood.skyHorizon, mood.fog));
  target.fillStyle = fog;
  target.fillRect(0, 0, width, height);

  // ---- chaos boom: golden overlay grade ----
  if (mood.gold && mood.goldAmt > 0) {
    target.save();
    target.globalCompositeOperation = "soft-light";
    target.fillStyle = rgbStr(mood.gold, Math.min(0.5, mood.goldAmt * 1.6));
    target.fillRect(0, 0, width, height);
    target.restore();
  }
  if (mood.desat > 0 && mood.cold) {
    target.save();
    target.globalCompositeOperation = "multiply";
    target.fillStyle = rgbStr(mood.cold, mood.desat * 0.18);
    target.fillRect(0, 0, width, height);
    target.restore();
  }

  // ---- vignette ----
  const vg = target.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.35,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${mood.vignette.toFixed(2)})`);
  target.fillStyle = vg;
  target.fillRect(0, 0, width, height);

  // ---- film grain (light) ----
  drawGrain(target, width, height, time);
}

let grainCanvas: { c: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D } | null = null;
let grainTile = 96;
function drawGrain(target: CanvasRenderingContext2D, width: number, height: number, time: number) {
  if (!grainCanvas) {
    grainCanvas = makeCanvas(grainTile, grainTile);
    const img = grainCanvas.ctx.createImageData(grainTile, grainTile);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    grainCanvas.ctx.putImageData(img, 0, 0);
  }
  target.save();
  target.globalCompositeOperation = "overlay";
  target.globalAlpha = 0.04;
  const ox = Math.floor((time * 13) % grainTile);
  const oy = Math.floor((time * 7) % grainTile);
  for (let y = -oy; y < height; y += grainTile) {
    for (let x = -ox; x < width; x += grainTile) {
      target.drawImage(grainCanvas.c as CanvasImageSource, x, y);
    }
  }
  target.restore();
}

/** True when a canvas 2D backend is available (browser or worker). */
export function canRenderCanvas(): boolean {
  return typeof document !== "undefined" || typeof OffscreenCanvas !== "undefined";
}

// expose era helpers re-export for convenience
export { eraProgress };
