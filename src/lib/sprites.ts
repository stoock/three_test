// Loads the pre-baked sprite catalogue (see scripts/bake-sprites/). Each
// sprite was rendered once, offline, with real three.js lighting/shadows and
// exported as a static PNG — players never load WebGL, only these images.
// This module preloads them into <img> elements the Canvas2D renderer can
// drawImage() synchronously once preloadSprites() has resolved.

export interface SpriteEntry {
  id: string;
  kind: "building-single" | "building-body" | "building-glow" | "building-cap" | "wonder";
  structure: string | null;
  wonderId: string | null;
  variant: number | null;
  tall: boolean | null;
  floors: number | null;
  file: string;
  pxW: number;
  pxH: number;
  w: number;
  d: number;
  h: number;
}

let manifest: SpriteEntry[] | null = null;
const byId = new Map<string, SpriteEntry>();
const images = new Map<string, HTMLImageElement>();
let loaded = false;
let loadingPromise: Promise<void> | null = null;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Fetches manifest.json and preloads every sprite. Call once at app start. */
export function preloadSprites(): Promise<void> {
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    const res = await fetch("/sprites/manifest.json");
    manifest = (await res.json()) as SpriteEntry[];
    for (const e of manifest) byId.set(e.id, e);
    await Promise.all(
      manifest.map(async (e) => {
        const img = await loadImage(`/sprites/${e.file}`);
        images.set(e.id, img);
      }),
    );
    loaded = true;
  })();
  return loadingPromise;
}

export function spritesReady(): boolean {
  return loaded;
}

export function getSpriteEntry(id: string): SpriteEntry | undefined {
  return byId.get(id);
}

export function getSpriteImage(id: string): HTMLImageElement | undefined {
  return images.get(id);
}

/** All baked variants for a given era.structure / kind, e.g. ("hut", "building-single"). */
export function getVariantsForStructure(structure: string, kind: SpriteEntry["kind"]): SpriteEntry[] {
  if (!manifest) return [];
  return manifest.filter((e) => e.structure === structure && e.kind === kind);
}

// ---- tinted glow-mask cache -------------------------------------------------
// Glow sprites are baked as plain white shapes on transparent backgrounds so a
// single bake can be recoloured to any era's accent colour at runtime.
const tintCache = new Map<string, HTMLCanvasElement>();

export function getTintedSprite(id: string, color: string): HTMLCanvasElement | undefined {
  const key = `${id}@${color}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const img = images.get(id);
  if (!img) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(img, 0, 0);
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  tintCache.set(key, canvas);
  return canvas;
}
