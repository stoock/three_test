import type { Character, Era } from "./types";
import { getEra } from "./eras";

// Shared isometric scene geometry, used by both the live view and the
// snapshot ("photo") generator so a logged photo matches what was on screen.

export const TILE_W = 64;
export const TILE_H = 32;

interface Pt {
  x: number;
  y: number;
}

function isoToScreen(col: number, row: number, originX: number, originY: number): Pt {
  return {
    x: originX + (col - row) * (TILE_W / 2),
    y: originY + (col + row) * (TILE_H / 2),
  };
}

function diamond(cx: number, cy: number, fill: string, stroke: string): string {
  const p = [
    `${cx},${cy - TILE_H / 2}`,
    `${cx + TILE_W / 2},${cy}`,
    `${cx},${cy + TILE_H / 2}`,
    `${cx - TILE_W / 2},${cy}`,
  ].join(" ");
  return `<polygon points="${p}" fill="${fill}" stroke="${stroke}" stroke-width="1" />`;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, Math.round(r + amt)));
  g = Math.max(0, Math.min(255, Math.round(g + amt)));
  b = Math.max(0, Math.min(255, Math.round(b + amt)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

// Deterministic pseudo-random from a seed so scenes are stable per state.
function rng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function building(cx: number, cy: number, h: number, era: Era): string {
  const { structure, palette } = era;
  const wallW = TILE_W * 0.5;
  const left = palette.structure;
  const right = shade(palette.structure, -30);
  const roof = palette.structureRoof;
  const top = cy - h;

  // Two visible walls (left + right faces) of an iso box.
  const leftFace = `<polygon points="${cx - wallW / 2},${cy} ${cx},${cy + TILE_H / 4} ${cx},${
    top + TILE_H / 4
  } ${cx - wallW / 2},${top}" fill="${left}" />`;
  const rightFace = `<polygon points="${cx + wallW / 2},${cy} ${cx},${cy + TILE_H / 4} ${cx},${
    top + TILE_H / 4
  } ${cx + wallW / 2},${top}" fill="${right}" />`;

  let roofShape = "";
  if (structure === "hut" || structure === "temple" || structure === "keep" || structure === "manor") {
    // Pitched roof.
    const peak = top - TILE_H * 0.5;
    roofShape = `<polygon points="${cx - wallW / 2},${top} ${cx},${top + TILE_H / 4} ${cx + wallW / 2},${top} ${cx},${peak}" fill="${roof}" />`;
  } else {
    // Flat / futuristic top.
    roofShape = `<polygon points="${cx - wallW / 2},${top} ${cx},${top + TILE_H / 4} ${cx + wallW / 2},${top} ${cx},${top - TILE_H / 4}" fill="${roof}" />`;
  }

  // A few glowing windows for later eras.
  let windows = "";
  if (era.index >= 6) {
    const r = rng(Math.round(cx * 13 + cy * 7 + h));
    for (let i = 0; i < Math.min(6, Math.floor(h / 10)); i++) {
      const wy = top + 8 + i * 9;
      if (wy > cy - 4) break;
      const lit = r() > 0.4 ? palette.accent : shade(palette.accent, -80);
      windows += `<rect x="${cx - wallW / 2 + 4}" y="${wy}" width="5" height="4" fill="${lit}" opacity="0.9" />`;
      windows += `<rect x="${cx + 3}" y="${wy}" width="5" height="4" fill="${shade(lit, -20)}" opacity="0.9" />`;
    }
  }

  return leftFace + rightFace + roofShape + windows;
}

function characterFigure(cx: number, cy: number, character: Character, era: Era): string {
  // Visual scale grows slightly with age but caps — an immortal that "grows".
  const maturity = Math.min(1, character.age / 60);
  const scale = 0.7 + maturity * 0.5;
  const bodyH = 18 * scale;
  const headR = 4.5 * scale;
  const skin = "#f0c9a0";
  const robe = era.palette.accent;
  const feetY = cy;
  const bodyTop = feetY - bodyH;
  const headCy = bodyTop - headR;

  // Aura for advanced eras (immortal radiance).
  let aura = "";
  if (era.index >= 8) {
    aura = `<ellipse cx="${cx}" cy="${headCy}" rx="${headR * 3}" ry="${headR * 3}" fill="${era.palette.accent}" opacity="0.18" />`;
  }

  return (
    aura +
    `<ellipse cx="${cx}" cy="${feetY + 2}" rx="${10 * scale}" ry="${4 * scale}" fill="#000" opacity="0.18" />` +
    `<polygon points="${cx - 5 * scale},${feetY} ${cx + 5 * scale},${feetY} ${cx + 3.5 * scale},${bodyTop} ${cx - 3.5 * scale},${bodyTop}" fill="${robe}" />` +
    `<circle cx="${cx}" cy="${headCy}" r="${headR}" fill="${skin}" />` +
    `<rect x="${cx - headR}" y="${headCy - headR}" width="${headR * 2}" height="${headR}" rx="${headR * 0.4}" fill="${shade(robe, -40)}" />`
  );
}

/** Builds the inner SVG markup (no <svg> wrapper) of the world for given state. */
export function buildSceneInner(
  character: Character,
  width: number,
  height: number,
  grid = 6,
): { inner: string; era: Era } {
  const era = getEra(character.techLevel);
  const { palette } = era;
  const originX = width / 2;
  const originY = height * 0.38;

  const parts: string[] = [];

  // Tiles, painted back-to-front.
  const tiles: { z: number; svg: string; cx: number; cy: number }[] = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const { x, y } = isoToScreen(col, row, originX, originY);
      const alt = (col + row) % 2 === 0;
      const fill = alt ? palette.ground : palette.ground2;
      tiles.push({
        z: col + row,
        cx: x,
        cy: y,
        svg: diamond(x, y, fill, shade(fill, -25)),
      });
    }
  }
  tiles.sort((a, b) => a.z - b.z);
  for (const t of tiles) parts.push(t.svg);

  // Structures: number and height scale with tech level.
  const density = Math.min(grid * grid - 1, 2 + Math.floor(character.techLevel / 60));
  const r = rng(101 + era.index * 7 + Math.floor(character.techLevel / ERA_NOISE));
  const used = new Set<string>();
  const placements: { cx: number; cy: number; z: number; h: number }[] = [];
  let attempts = 0;
  while (placements.length < density && attempts < 200) {
    attempts++;
    const col = Math.floor(r() * grid);
    const row = Math.floor(r() * grid);
    const key = `${col},${row}`;
    // Keep the center clear for the character.
    if (col === Math.floor(grid / 2) && row === Math.floor(grid / 2)) continue;
    if (used.has(key)) continue;
    used.add(key);
    const { x, y } = isoToScreen(col, row, originX, originY);
    // Cap visual height growth so far-future eras don't render off-canvas.
    const visualTier = Math.min(era.index, 9);
    const baseH = 16 + visualTier * 5;
    const h = baseH + r() * (visualTier >= 6 ? 60 : 20);
    placements.push({ cx: x, cy: y, z: col + row, h });
  }
  placements.sort((a, b) => a.z - b.z);
  for (const p of placements) parts.push(building(p.cx, p.cy, p.h, era));

  // Character at center, drawn last so it's always visible.
  const center = isoToScreen(Math.floor(grid / 2), Math.floor(grid / 2), originX, originY);
  parts.push(characterFigure(center.x, center.y, character, era));

  return { inner: parts.join(""), era };
}

const ERA_NOISE = 50;

/** Full standalone SVG string of the world (used for live render via dangerouslySet or as image). */
export function buildSceneSvg(character: Character, width: number, height: number): string {
  const { inner, era } = buildSceneInner(character, width, height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${era.palette.sky}" />
        <stop offset="1" stop-color="${shade(era.palette.sky, -25)}" />
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#sky)" />
    ${inner}
  </svg>`;
}

function svgToDataUrl(svg: string): string {
  if (typeof window === "undefined") {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }
  return `data:image/svg+xml;base64,${window.btoa(unescape(encodeURIComponent(svg)))}`;
}

/** Captures a labelled "photo" of the current moment as a data URL for the log. */
export function captureSnapshot(character: Character, title: string): string {
  const W = 320;
  const H = 200;
  const { inner, era } = buildSceneInner(character, W, H, 5);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${era.palette.sky}" />
        <stop offset="1" stop-color="${shade(era.palette.sky, -25)}" />
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)" />
    ${inner}
    <rect x="0" y="${H - 34}" width="${W}" height="34" fill="#000" opacity="0.45" />
    <text x="8" y="${H - 19}" font-family="sans-serif" font-size="12" fill="#fff" font-weight="bold">${escapeXml(
      title,
    )}</text>
    <text x="8" y="${H - 6}" font-family="sans-serif" font-size="10" fill="#dfe">${escapeXml(
      era.name,
    )} · ${Math.floor(character.age)}세 · ${escapeXml(character.name)}</text>
  </svg>`;
  return svgToDataUrl(svg);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
