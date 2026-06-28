// Chaos-theory toolkit: deterministic-per-seed but sensitively dependent on
// initial conditions, so every world (and every life) diverges.

/** mulberry32 — a fast, well-distributed seeded PRNG. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash → [0,1). Stable for a given (x, y, seed). */
export function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x1f1f1f1f) ^ Math.imul(y | 0, 0x3c6ef35f) ^ Math.imul(seed | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth 2D value noise in [0,1]. */
export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash2(xi, yi, seed);
  const tr = hash2(xi + 1, yi, seed);
  const bl = hash2(xi, yi + 1, seed);
  const br = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf);
  const v = smooth(yf);
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
}

/** Fractional Brownian motion — layered noise giving natural-looking terrain. */
export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * The logistic map x → r·x·(1−x). For r in ~[3.57, 4) it is chaotic: a
 * vanishingly small change in x or r leads to a completely different orbit.
 * We use it as the world's "fortune", so good and bad fortune alternate
 * unpredictably and identical runs never recur.
 */
export function logisticStep(x: number, r: number): number {
  const next = r * x * (1 - x);
  // Keep strictly inside the open interval to avoid fixed points at 0/1.
  return Math.min(0.999999, Math.max(0.000001, next));
}

/** Derives a chaos control parameter r in the chaotic band from a seed. */
export function chaosR(seed: number): number {
  return 3.74 + (hash2(seed, 7919, 104729) * 0.25); // r ∈ [3.74, 3.99)
}
