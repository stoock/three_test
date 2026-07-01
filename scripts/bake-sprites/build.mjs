// Bakes the sprite catalogue: bundles bake-runtime.js (three.js + recipes),
// runs it inside a headless Chromium page (no network/CDN needed — everything
// is bundled locally), and writes the resulting PNGs + manifest.json into
// public/sprites/. This script is a *dev-time tool only* — players never run
// three.js or WebGL; they just load the resulting static PNGs.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve Playwright from the project's own node_modules if present, else
// fall back to a known global install path (used in this sandbox).
async function loadPlaywright() {
  try {
    return (await import("playwright")).default ?? (await import("playwright"));
  } catch {
    const globalPath = "/opt/node22/lib/node_modules/playwright/index.js";
    if (existsSync(globalPath)) {
      const mod = await import(globalPath);
      return mod.default ?? mod;
    }
    throw new Error("Playwright not found. `npm install -D playwright` and retry.");
  }
}
const pw = await loadPlaywright();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const outDir = path.join(root, "public", "sprites");
const tmpDir = path.join(root, ".bake-tmp");

mkdirSync(tmpDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const bundlePath = path.join(tmpDir, "bake.bundle.js");
console.log("[bake] bundling...");
execFileSync(
  "npx",
  ["--yes", "esbuild", path.join(__dirname, "bake-runtime.js"), "--bundle", `--outfile=${bundlePath}`, "--format=iife"],
  { stdio: "inherit" },
);

const htmlPath = path.join(tmpDir, "bake.html");
writeFileSync(htmlPath, `<!doctype html><html><body><script src="./bake.bundle.js"></script></body></html>`);

console.log("[bake] launching headless chromium...");
const browser = await pw.chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
page.on("console", (m) => {
  if (m.type() === "error") console.error("[page]", m.text());
});
await page.goto("file://" + htmlPath, { waitUntil: "load" });
await page.waitForFunction(() => globalThis.__BAKE_DONE__ === true, { timeout: 30000 });
const results = await page.evaluate(() => globalThis.__BAKE_RESULT__);
await browser.close();

console.log(`[bake] got ${results.length} sprites, writing files...`);
const manifest = [];
for (const r of results) {
  const base64 = r.dataUrl.replace(/^data:image\/png;base64,/, "");
  const file = `${r.id}.png`;
  writeFileSync(path.join(outDir, file), Buffer.from(base64, "base64"));
  manifest.push({
    id: r.id,
    kind: r.kind,
    structure: r.structure ?? null,
    wonderId: r.wonderId ?? null,
    variant: r.variant ?? null,
    tall: r.tall ?? null,
    floors: r.floors ?? null,
    file,
    pxW: r.pxW,
    pxH: r.pxH,
    w: r.w,
    d: r.d,
    h: r.h,
  });
}
writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
rmSync(tmpDir, { recursive: true, force: true });
console.log(`[bake] done. ${manifest.length} sprites in ${path.relative(root, outDir)}`);
