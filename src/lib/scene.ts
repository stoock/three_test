import type { Character, Era } from "./types";
import { getEra } from "./eras";
import { fbm, hash2, makeRng } from "./chaos";

// Isometric, elevated, textured scene. Terrain is generated from the world seed
// (chaos.fbm) so every realm is unique; the visible grid grows with territory.

export const TILE_W = 64;
export const TILE_H = 32;
const LAYER = 9; // vertical px per elevation step
const MAX_LAYERS = 5;
const BASE_DEPTH = 7;

// ---------- colour helpers ----------
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp255(((n >> 16) & 255) + amt);
  const g = clamp255(((n >> 8) & 255) + amt);
  const b = clamp255((n & 255) + amt);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = clamp255(lerpc((na >> 16) & 255, (nb >> 16) & 255, t));
  const g = clamp255(lerpc((na >> 8) & 255, (nb >> 8) & 255, t));
  const bch = clamp255(lerpc(na & 255, nb & 255, t));
  return `#${((r << 16) | (g << 8) | bch).toString(16).padStart(6, "0")}`;
}
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}
function lerpc(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------- terrain ----------
type Terrain = "water" | "sand" | "grass" | "forest" | "rock" | "snow";

interface Tile {
  col: number;
  row: number;
  e: number;
  terrain: Terrain;
  layers: number;
  color: string;
}

function classify(e: number): Terrain {
  if (e < 0.3) return "water";
  if (e < 0.37) return "sand";
  if (e < 0.6) return "grass";
  if (e < 0.74) return "forest";
  if (e < 0.88) return "rock";
  return "snow";
}

function terrainColor(t: Terrain, era: Era, jitter: number): string {
  const p = era.palette;
  const future = era.index >= 8;
  switch (t) {
    case "water": {
      const base = future ? mix("#16324f", p.accent, 0.25) : "#2f6fae";
      return shade(base, jitter * 14 - 7);
    }
    case "sand":
      return shade("#d8c48c", jitter * 16 - 8);
    case "grass":
      return shade(jitter > 0.5 ? p.ground : p.ground2, jitter * 14 - 7);
    case "forest":
      return shade(mix(p.ground2, "#274d27", 0.55), jitter * 12 - 6);
    case "rock":
      return shade(future ? mix("#5a5570", p.accent, 0.15) : "#8d8478", jitter * 16 - 8);
    case "snow":
      return shade(future ? mix("#cfd6ff", p.accent, 0.2) : "#e9eef2", jitter * 10 - 5);
  }
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
      // Island mask: land in the middle, sea creeping in at the frontier.
      const d = Math.hypot(col - c0, row - c0) / maxD;
      e = e * (1.18 - d * 0.6) - d * 0.12;
      e = Math.max(0, Math.min(1, e));
      const terrain = classify(e);
      const jitter = hash2(col, row, seed + 99);
      const layers =
        terrain === "water" ? 0 : Math.max(1, Math.round(((e - 0.3) / 0.7) * MAX_LAYERS));
      tiles.push({ col, row, e, terrain, layers, color: terrainColor(terrain, era, jitter) });
    }
  }
  return tiles;
}

// ---------- geometry ----------
function groundPos(col: number, row: number): { x: number; y: number } {
  return { x: (col - row) * (TILE_W / 2), y: (col + row) * (TILE_H / 2) };
}

function topDiamond(cx: number, cy: number, fill: string): string {
  const p = `${cx},${cy - TILE_H / 2} ${cx + TILE_W / 2},${cy} ${cx},${cy + TILE_H / 2} ${
    cx - TILE_W / 2
  },${cy}`;
  return `<polygon points="${p}" fill="${fill}" />`;
}

function tileColumn(tile: Tile, cx: number, sy: number): string {
  const top = sy - tile.layers * LAYER;
  const depth = tile.layers * LAYER + BASE_DEPTH;
  const left = shade(tile.color, -20);
  const right = shade(tile.color, -38);

  const leftFace = `<polygon points="${cx - TILE_W / 2},${top} ${cx},${top + TILE_H / 2} ${cx},${
    top + TILE_H / 2 + depth
  } ${cx - TILE_W / 2},${top + depth}" fill="${left}" />`;
  const rightFace = `<polygon points="${cx + TILE_W / 2},${top} ${cx},${top + TILE_H / 2} ${cx},${
    top + TILE_H / 2 + depth
  } ${cx + TILE_W / 2},${top + depth}" fill="${right}" />`;

  return leftFace + rightFace + topDiamond(cx, top, tile.color) + tileDetail(tile, cx, top);
}

function tileDetail(tile: Tile, cx: number, top: number): string {
  const r = makeRng(((tile.col + 1) * 92821) ^ ((tile.row + 1) * 53987));
  let s = "";
  if (tile.terrain === "water") {
    const hi = shade(tile.color, 40);
    s += `<polygon points="${cx},${top - TILE_H / 2 + 3} ${cx + 10},${top} ${cx},${
      top + TILE_H / 2 - 3
    } ${cx - 10},${top}" fill="${hi}" opacity="0.35" />`;
    s += `<path d="M ${cx - 12},${top} q 6,-4 12,0 q 6,4 12,0" stroke="${shade(
      tile.color,
      55,
    )}" stroke-width="1" fill="none" opacity="0.5" />`;
  } else if (tile.terrain === "grass") {
    const blade = shade(tile.color, -28);
    for (let i = 0; i < 3; i++) {
      const bx = cx + (r() - 0.5) * TILE_W * 0.5;
      const by = top + (r() - 0.5) * TILE_H * 0.5;
      s += `<line x1="${bx}" y1="${by}" x2="${bx}" y2="${by - 4}" stroke="${blade}" stroke-width="1" opacity="0.6" />`;
    }
  } else if (tile.terrain === "sand") {
    for (let i = 0; i < 4; i++) {
      const bx = cx + (r() - 0.5) * TILE_W * 0.55;
      const by = top + (r() - 0.5) * TILE_H * 0.55;
      s += `<circle cx="${bx}" cy="${by}" r="0.8" fill="${shade(tile.color, -25)}" opacity="0.6" />`;
    }
  } else if (tile.terrain === "rock") {
    s += `<polygon points="${cx - 8},${top + 2} ${cx - 2},${top - 4} ${cx + 3},${top + 1}" fill="${shade(
      tile.color,
      35,
    )}" opacity="0.7" />`;
  } else if (tile.terrain === "snow") {
    s += `<polygon points="${cx},${top - TILE_H / 2} ${cx + TILE_W / 2},${top} ${cx},${
      top + TILE_H / 2
    } ${cx - TILE_W / 2},${top}" fill="#ffffff" opacity="0.25" />`;
  }
  return s;
}

function tree(cx: number, baseY: number, era: Era): string {
  const trunk = "#6b4a2b";
  const canopy = era.index >= 8 ? mix("#2f5d2f", era.palette.accent, 0.35) : "#2f6b34";
  return (
    `<ellipse cx="${cx}" cy="${baseY + 1}" rx="6" ry="2.5" fill="#000" opacity="0.18" />` +
    `<rect x="${cx - 1.5}" y="${baseY - 10}" width="3" height="10" fill="${trunk}" />` +
    `<circle cx="${cx}" cy="${baseY - 14}" r="7" fill="${shade(canopy, -18)}" />` +
    `<circle cx="${cx - 3}" cy="${baseY - 12}" r="5" fill="${canopy}" />` +
    `<circle cx="${cx + 3}" cy="${baseY - 16}" r="5" fill="${shade(canopy, 14)}" />`
  );
}

function building(cx: number, baseY: number, h: number, era: Era, seedTile: number): string {
  const { structure, palette } = era;
  const wallW = TILE_W * 0.46;
  const left = palette.structure;
  const right = shade(palette.structure, -28);
  const top = baseY - h;
  const r = makeRng(seedTile);

  const shadow = `<ellipse cx="${cx}" cy="${baseY + 2}" rx="${wallW * 0.7}" ry="6" fill="#000" opacity="0.22" />`;

  const leftFace = `<polygon points="${cx - wallW / 2},${baseY} ${cx},${baseY + TILE_H / 4} ${cx},${
    top + TILE_H / 4
  } ${cx - wallW / 2},${top}" fill="${left}" />`;
  const rightFace = `<polygon points="${cx + wallW / 2},${baseY} ${cx},${baseY + TILE_H / 4} ${cx},${
    top + TILE_H / 4
  } ${cx + wallW / 2},${top}" fill="${right}" />`;

  let roof = "";
  if (["hut", "temple", "keep", "manor"].includes(structure)) {
    const peak = top - TILE_H * 0.55;
    roof = `<polygon points="${cx - wallW / 2},${top} ${cx},${top + TILE_H / 4} ${cx + wallW / 2},${top} ${cx},${peak}" fill="${palette.structureRoof}" />`;
  } else {
    roof = `<polygon points="${cx - wallW / 2},${top} ${cx},${top + TILE_H / 4} ${cx + wallW / 2},${top} ${cx},${
      top - TILE_H / 4
    }" fill="${palette.structureRoof}" />`;
  }

  let windows = "";
  if (era.index >= 5) {
    const rows = Math.min(8, Math.floor(h / 11));
    for (let i = 0; i < rows; i++) {
      const wy = top + 10 + i * 10;
      if (wy > baseY - 4) break;
      const lit = r() > 0.4 ? palette.accent : shade(palette.accent, -90);
      windows += `<rect x="${cx - wallW / 2 + 4}" y="${wy}" width="5" height="5" fill="${lit}" opacity="0.9" />`;
      windows += `<rect x="${cx + 3}" y="${wy}" width="5" height="5" fill="${shade(lit, -20)}" opacity="0.9" />`;
    }
  } else {
    // a doorway for early eras
    windows += `<rect x="${cx - 3}" y="${baseY - 9}" width="6" height="9" fill="${shade(left, -50)}" />`;
  }

  return shadow + leftFace + rightFace + roof + windows;
}

function characterFigure(cx: number, feetY: number, character: Character, era: Era): string {
  const maturity = Math.min(1, character.age / 80);
  const scale = 0.8 + maturity * 0.5;
  const bodyH = 18 * scale;
  const headR = 4.5 * scale;
  const robe = era.palette.accent;
  const skin = "#f0c9a0";
  const bodyTop = feetY - bodyH;
  const headCy = bodyTop - headR;
  let aura = "";
  if (era.index >= 8) {
    aura = `<ellipse cx="${cx}" cy="${headCy}" rx="${headR * 3.2}" ry="${headR * 3.2}" fill="${era.palette.accent}" opacity="0.18" />`;
  }
  return (
    aura +
    `<ellipse cx="${cx}" cy="${feetY + 2}" rx="${10 * scale}" ry="${4 * scale}" fill="#000" opacity="0.22" />` +
    `<polygon points="${cx - 5 * scale},${feetY} ${cx + 5 * scale},${feetY} ${cx + 3.5 * scale},${bodyTop} ${
      cx - 3.5 * scale
    },${bodyTop}" fill="${robe}" />` +
    `<polygon points="${cx - 5 * scale},${feetY} ${cx},${feetY} ${cx},${bodyTop} ${
      cx - 3.5 * scale
    },${bodyTop}" fill="${shade(robe, -25)}" />` +
    `<circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${skin}" />` +
    `<path d="M ${cx - headR},${headCy} a ${headR},${headR} 0 0 1 ${headR * 2},0 z" fill="${shade(
      robe,
      -40,
    )}" />`
  );
}

// ---------- assembly ----------
export function buildSceneInner(
  character: Character,
  width: number,
  height: number,
): { inner: string; era: Era } {
  const era = getEra(character.techLevel);
  const N = character.territory;
  const tiles = buildTiles(character, era);

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

  // choose the character's home: land tile nearest centre
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

  // building placements (deterministic per seed/era)
  const rb = makeRng((character.seed ^ (era.index * 2654435761)) >>> 0);
  const density = Math.min(N * N - 1, 3 + Math.floor(character.techLevel / 55) + Math.floor(N / 2));
  const buildable = tiles.filter(
    (t) =>
      (t.terrain === "grass" || t.terrain === "sand" || t.terrain === "forest") &&
      t.layers <= 3 &&
      !(t.col === home.col && t.row === home.row),
  );
  // shuffle buildable by seed
  for (let i = buildable.length - 1; i > 0; i--) {
    const j = Math.floor(rb() * (i + 1));
    [buildable[i], buildable[j]] = [buildable[j], buildable[i]];
  }
  const builtSet = new Set<string>();
  for (let i = 0; i < Math.min(density, buildable.length); i++) {
    builtSet.add(`${buildable[i].col},${buildable[i].row}`);
  }
  const visualTier = Math.min(era.index, 9);

  // draw back-to-front
  const ordered = [...tiles].sort((a, b) => a.col + a.row - (b.col + b.row));
  const parts: string[] = [];
  for (const t of ordered) {
    const g = groundPos(t.col, t.row);
    parts.push(tileColumn(t, g.x, g.y));
    const topY = g.y - t.layers * LAYER;

    if (t.terrain === "forest" && !builtSet.has(`${t.col},${t.row}`)) {
      const tr = makeRng(((t.col + 5) * 40503) ^ ((t.row + 5) * 12289));
      const n = 1 + Math.floor(tr() * 2);
      for (let k = 0; k < n; k++) {
        parts.push(tree(g.x + (tr() - 0.5) * 16, topY + (tr() - 0.5) * 8, era));
      }
    }

    if (builtSet.has(`${t.col},${t.row}`)) {
      const baseH = 16 + visualTier * 5;
      const h = baseH + makeRng(((t.col + 1) * 7919) ^ ((t.row + 1) * 104729))() * (visualTier >= 6 ? 70 : 22);
      parts.push(building(g.x, topY, h, era, ((t.col * 31 + t.row) ^ era.index) >>> 0));
    }

    if (t.col === home.col && t.row === home.row) {
      parts.push(characterFigure(g.x, topY, character, era));
    }
  }

  // sky decorations (screen space, behind transform group)
  let sky = "";
  if (era.index >= 8) {
    const rs = makeRng((character.seed ^ 0x5eed) >>> 0);
    for (let i = 0; i < 40; i++) {
      sky += `<circle cx="${rs() * width}" cy="${rs() * height * 0.6}" r="${rs() * 1.2}" fill="#fff" opacity="${
        0.3 + rs() * 0.6
      }" />`;
    }
    sky += `<circle cx="${width * 0.8}" cy="${height * 0.2}" r="22" fill="${era.palette.accent}" opacity="0.25" />`;
  } else {
    sky += `<circle cx="${width * 0.78}" cy="${height * 0.2}" r="26" fill="#fff" opacity="0.55" />`;
    sky += `<circle cx="${width * 0.78}" cy="${height * 0.2}" r="40" fill="#fff" opacity="0.12" />`;
  }

  const inner = `${sky}<g transform="translate(${tx.toFixed(2)},${ty.toFixed(2)}) scale(${s.toFixed(
    3,
  )})">${parts.join("")}</g>`;
  return { inner, era };
}

function svgWrap(inner: string, era: Era, w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${shade(era.palette.sky, 18)}" />
        <stop offset="0.6" stop-color="${era.palette.sky}" />
        <stop offset="1" stop-color="${shade(era.palette.sky, -28)}" />
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#sky)" />
    ${inner}
  </svg>`;
}

export function buildSceneSvg(character: Character, width: number, height: number): string {
  const { inner, era } = buildSceneInner(character, width, height);
  return svgWrap(inner, era, width, height);
}

function svgToDataUrl(svg: string): string {
  if (typeof window === "undefined") return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function captureSnapshot(character: Character, title: string): string {
  const W = 320;
  const H = 200;
  const { inner, era } = buildSceneInner(character, W, H);
  const body = `${inner}
    <rect x="0" y="${H - 34}" width="${W}" height="34" fill="#000" opacity="0.45" />
    <text x="8" y="${H - 19}" font-family="sans-serif" font-size="12" fill="#fff" font-weight="bold">${escapeXml(
      title,
    )}</text>
    <text x="8" y="${H - 6}" font-family="sans-serif" font-size="10" fill="#dfe">${escapeXml(
      era.name,
    )} · ${Math.floor(character.age)}세 · ${escapeXml(character.name)}</text>`;
  return svgToDataUrl(svgWrap(body, era, W, H));
}
