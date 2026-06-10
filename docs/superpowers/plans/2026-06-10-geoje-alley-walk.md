# 거제동 골목길 1인칭 걷기 씬 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 참조 영상(부산 거제동 여고로14번길 거리뷰)의 골목길을 Three.js 1인칭 걷기 씬으로 재현한다.

**Architecture:** 모듈식 스트리트 키트 — `src/kit/`의 팩토리 함수들이 `THREE.Group`을 반환하고, `src/layout.js`의 순수 배치 데이터를 `src/main.js`가 읽어 조립한다. 텍스처는 프로시저럴(캔버스) + 영상 추출(ffmpeg 크롭) 혼합.

**Tech Stack:** Three.js r160 (vendor 복사, 빌드 없음), ES modules, 정적 서버는 PowerShell HttpListener(`serve.ps1`).

**검증 방식 주의:** 이 환경에는 node/npm/python이 없어 테스트 러너를 사용할 수 없다. 각 태스크의 검증은 ① `node` 없이 동작하는 정적 분석(브라우저 콘솔 에러 확인) ② `serve.ps1`로 서빙한 페이지의 브라우저 스크린샷(verify 스킬 또는 사용자 확인)으로 한다.

**좌표계:** 골목은 +Z 방향으로 길이 160m. 플레이어는 z=2에서 +Z를 보고 시작. +Z를 볼 때 왼쪽 = +X(학교 옹벽), 오른쪽 = -X(상가/주택). 도로 폭 6m (x: -3 ~ +3).

**ffmpeg 경로:** `/tmp/ffmpeg-dl/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe` (없으면 `https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip` 재다운로드 후 압축 해제)

---

### Task 1: 프로젝트 스캐폴드 (vendor 복사, serve.ps1, index.html, 최소 main.js)

**Files:**
- Create: `vendor/three/` (이전 브랜치에서 복사), `serve.ps1`, `index.html`, `src/main.js`

- [ ] **Step 1: vendor 파일 복사**

```bash
git checkout claude/yeouido-park-threejs-game-fvm993 -- vendor/three/three.module.js vendor/three/addons/controls/PointerLockControls.js vendor/three/addons/objects/Sky.js vendor/three/LICENSE
```

- [ ] **Step 2: serve.ps1 작성**

```powershell
# serve.ps1 — 빌드 도구 없는 환경용 정적 서버 (PowerShell 5.1 HttpListener)
param([int]$Port = 8000)
$mime = @{ ".html"="text/html; charset=utf-8"; ".js"="text/javascript; charset=utf-8"; ".jpg"="image/jpeg"; ".png"="image/png"; ".webm"="video/webm"; ".md"="text/plain; charset=utf-8" }
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/ (Ctrl+C to stop)"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
  if ($rel -eq "") { $rel = "index.html" }
  $path = Join-Path $root $rel
  if ((Test-Path $path -PathType Leaf) -and ($path.StartsWith($root))) {
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
    $ctx.Response.ContentLength64 = $bytes.Length
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $ctx.Response.StatusCode = 404
  }
  $ctx.Response.Close()
}
```

- [ ] **Step 3: index.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>거제동 골목길 산책</title>
<style>
  body { margin: 0; overflow: hidden; font-family: sans-serif; }
  #overlay {
    position: fixed; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px;
    background: rgba(0,0,0,0.65); color: #fff; cursor: pointer; z-index: 10;
  }
  #overlay h1 { font-size: 28px; margin: 0; }
  #overlay p { margin: 0; opacity: 0.85; }
  #overlay.hidden { display: none; }
</style>
</head>
<body>
<div id="overlay">
  <h1>거제동 골목길 산책</h1>
  <p>클릭하여 시작 — W A S D 이동 · 마우스 시점 · Shift 달리기 · ESC 일시정지</p>
  <p id="webgl-warn" style="color:#f88; display:none;">이 브라우저는 WebGL을 지원하지 않습니다.</p>
</div>
<script type="importmap">
{
  "imports": {
    "three": "./vendor/three/three.module.js",
    "three/addons/": "./vendor/three/addons/"
  }
}
</script>
<script type="module" src="./src/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: 최소 main.js 작성 (하늘 + 햇빛 + 임시 바닥)**

```js
// src/main.js
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const overlay = document.getElementById('overlay');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.75;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfd8e8, 120, 400);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 1.6, 2);
camera.lookAt(0, 1.6, 20);

// 하늘 + 태양 (맑은 오후)
const sky = new Sky();
sky.scale.setScalar(1000);
scene.add(sky);
const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(140));
sky.material.uniforms.turbidity.value = 6;
sky.material.uniforms.rayleigh.value = 1.5;
sky.material.uniforms.mieCoefficient.value = 0.004;
sky.material.uniforms.mieDirectionalG.value = 0.85;
sky.material.uniforms.sunPosition.value.copy(sunDir);

const sun = new THREE.DirectionalLight(0xfff2dd, 3.2);
sun.position.copy(sunDir).multiplyScalar(180);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
sun.shadow.camera.top = 140; sun.shadow.camera.bottom = -120;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 450;
sun.shadow.bias = -0.0004;
sun.target.position.set(0, 0, 80);
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x8a8070, 0.9));

// 임시 바닥 (Task 4에서 street.js로 대체)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(400, 400),
  new THREE.MeshStandardMaterial({ color: 0x555555 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

overlay.addEventListener('click', () => overlay.classList.add('hidden'));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => renderer.render(scene, camera));
```

WebGL 미지원 시 `WebGLRenderer` 생성자가 throw 하므로, 생성을 try/catch로 감싸 `#webgl-warn`을 표시한다:

```js
// renderer 생성부를 다음으로 교체
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  document.getElementById('webgl-warn').style.display = 'block';
  throw e;
}
```

- [ ] **Step 5: 서빙 + 브라우저 검증**

```powershell
powershell -File serve.ps1   # 백그라운드 실행
```

`http://localhost:8000` 스크린샷: 하늘 그라데이션 + 회색 바닥 + 오버레이 문구가 보이고 콘솔 에러 없어야 함.

- [ ] **Step 6: 커밋**

```bash
git add vendor serve.ps1 index.html src/main.js
git commit -m "Scaffold Three.js scene with sky, sun light, and static server script"
```

---

### Task 2: 영상에서 텍스처 추출

**Files:**
- Create: `assets/textures/sign-academy.jpg`, `sign-maemae.jpg`, `facade-daycare.jpg`, `tile-checker.jpg`, `banner-rent.jpg`

- [ ] **Step 1: ffmpeg 크롭 추출 (좌표는 1920x1080 기준 초기 추정치)**

```bash
FF=/tmp/ffmpeg-dl/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe
V="video/Screenshot 2026-06-10 at 22.00.03.webm"
mkdir -p assets/textures
"$FF" -ss 3  -i "$V" -frames:v 1 -vf "crop=330:100:1070:390" -q:v 2 assets/textures/sign-academy.jpg -y
"$FF" -ss 3  -i "$V" -frames:v 1 -vf "crop=230:120:1690:160" -q:v 2 assets/textures/sign-maemae.jpg -y
"$FF" -ss 19 -i "$V" -frames:v 1 -vf "crop=400:300:840:110"  -q:v 2 assets/textures/facade-daycare.jpg -y
"$FF" -ss 23 -i "$V" -frames:v 1 -vf "crop=740:260:1000:780" -q:v 2 assets/textures/tile-checker.jpg -y
"$FF" -ss 23 -i "$V" -frames:v 1 -vf "crop=180:112:976:224"  -q:v 2 assets/textures/banner-rent.jpg -y
```

- [ ] **Step 2: 추출 결과를 Read 도구로 확인하고 어긋난 크롭은 좌표 조정 후 재추출**

각 jpg를 열어 대상(간판 글자/타일 패턴)이 프레임에 꽉 차는지 확인. 필요시 `-ss` 시각과 crop `w:h:x:y` 조정. 체크 타일은 가능한 한 정면에 가까운 프레임을 골라 기울기를 최소화한다.

- [ ] **Step 3: 커밋**

```bash
git add assets/textures
git commit -m "Extract signage and tile textures from reference video"
```

---

### Task 3: 프로시저럴 텍스처 생성기 (textures.js)

**Files:**
- Create: `src/textures.js`
- Modify: `src/main.js` (임시 바닥에 아스팔트 적용해 동작 확인)

- [ ] **Step 1: textures.js 작성**

```js
// src/textures.js — 캔버스 기반 프로시저럴 텍스처
import * as THREE from 'three';

function make(w, h, draw, { repeat = [1, 1] } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function noise(ctx, w, h, alpha, n = 4000) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

// 아스팔트: 짙은 회색 + 골재 노이즈 + 미세 균열
export function asphalt(repeat = [8, 40]) {
  return make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#4a4a4c'; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.12, 9000);
    ctx.strokeStyle = 'rgba(20,20,20,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      let x = Math.random() * w, y = Math.random() * h;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 90; y += (Math.random() - 0.5) * 90; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  }, { repeat });
}

// 화강암 석축: 어긋난 큰 블록 + 줄눈
export function graniteWall(repeat = [10, 1]) {
  return make(512, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9a958c'; ctx.fillRect(0, 0, w, h);
    const rows = 3, cols = 5;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (w / cols / 2);
      for (let c = -1; c < cols; c++) {
        const x = c * (w / cols) + off, y = r * (h / rows);
        const g = 140 + Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgb(${g},${g - 4},${g - 12})`;
        ctx.fillRect(x + 3, y + 3, w / cols - 6, h / rows - 6);
        noise(ctx, w, h, 0.05, 300);
      }
    }
  }, { repeat });
}

// 시멘트 스타코 담장/벽
export function stucco(base = '#d8d4cb', repeat = [4, 1]) {
  return make(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.06, 5000);
    ctx.fillStyle = 'rgba(120,115,105,0.15)';
    for (let i = 0; i < 12; i++) ctx.fillRect(Math.random() * w, Math.random() * h, 30, 3);
  }, { repeat });
}

// 적벽돌
export function brick(repeat = [6, 3]) {
  return make(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b5a89b'; ctx.fillRect(0, 0, w, h);  // 줄눈
    const bh = 16, bw = 52;
    for (let y = 0; y < h; y += bh) {
      const off = ((y / bh) % 2) * (bw / 2);
      for (let x = -bw; x < w; x += bw) {
        const r = 145 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${r},${Math.floor(r * 0.45)},${Math.floor(r * 0.35)})`;
        ctx.fillRect(x + off + 2, y + 2, bw - 4, bh - 4);
      }
    }
  }, { repeat });
}

// 녹색 철망 펜스 (alphaMap 겸용 — transparent 사용)
export function fenceMesh(repeat = [30, 1]) {
  const t = make(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#2f7d32'; ctx.lineWidth = 5;
    for (let i = -h; i < w + h; i += 24) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke();
    }
  }, { repeat });
  t.premultiplyAlpha = false;
  return t;
}

// 건물 외벽: 벽 색 + 창문 그리드 (+ 1층 상가 유리)
export function facade({ floors = 3, cols = 4, wall = '#e3ded2', storefront = false } = {}) {
  return make(256, 128 * floors, (ctx, w, h) => {
    ctx.fillStyle = wall; ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 0.04, 2500);
    const fh = h / floors;
    for (let f = 0; f < floors; f++) {
      const y = h - (f + 1) * fh;            // f=0 이 1층
      if (f === 0 && storefront) {
        ctx.fillStyle = '#27313d'; ctx.fillRect(8, y + fh * 0.25, w - 16, fh * 0.7);
        ctx.fillStyle = 'rgba(160,190,220,0.35)'; ctx.fillRect(12, y + fh * 0.3, w - 24, fh * 0.25);
        continue;
      }
      for (let c = 0; c < cols; c++) {
        const x = (c + 0.18) * (w / cols), ww = (w / cols) * 0.64, wh = fh * 0.5;
        ctx.fillStyle = '#3a4a5a'; ctx.fillRect(x, y + fh * 0.22, ww, wh);
        ctx.fillStyle = 'rgba(190,215,235,0.5)'; ctx.fillRect(x + 2, y + fh * 0.24, ww - 4, wh * 0.4);
        ctx.strokeStyle = '#cfc9bd'; ctx.lineWidth = 3; ctx.strokeRect(x, y + fh * 0.22, ww, wh);
        ctx.beginPath(); ctx.moveTo(x + ww / 2, y + fh * 0.22); ctx.lineTo(x + ww / 2, y + fh * 0.22 + wh); ctx.stroke();
      }
    }
  });
}

// 도로 텍스트/기호 데칼 (흰 페인트, 투명 배경)
export function roadText(text, { color = '#e8e8e4', size = 150 } = {}) {
  const t = make(256, 512, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const chars = [...text];
    chars.forEach((ch, i) => ctx.fillText(ch, w / 2, (i + 0.5) * (h / chars.length)));
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 표지판 보드 (어린이보호구역 / 좌회전금지)
export function signBoard(kind) {
  const t = make(256, 256, (ctx, w, h) => {
    if (kind === 'school-zone') {
      ctx.fillStyle = '#1e63c8'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(w * 0.42, h * 0.3, 16, 0, Math.PI * 2); ctx.fill();   // 머리
      ctx.fillRect(w * 0.36, h * 0.36, 18, 60);                                       // 몸
      ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('어린이', w / 2, h * 0.75);
      ctx.fillText('보호구역', w / 2, h * 0.9);
    } else { // no-left-turn
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 120, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#c62828'; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 105, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 16;
      ctx.beginPath(); ctx.moveTo(w * 0.7, h * 0.62); ctx.lineTo(w * 0.4, h * 0.62); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w * 0.46, h * 0.5); ctx.lineTo(w * 0.34, h * 0.62); ctx.lineTo(w * 0.46, h * 0.74); ctx.stroke();
      ctx.strokeStyle = '#c62828'; ctx.lineWidth = 18;
      ctx.beginPath(); ctx.moveTo(w * 0.28, h * 0.28); ctx.lineTo(w * 0.72, h * 0.72); ctx.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 영상 추출 텍스처 로더 — 실패 시 단색 폴백
export function fromAsset(file, fallbackColor = 0x888888) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  new THREE.TextureLoader().load(
    `assets/textures/${file}`,
    (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; mat.map = t; mat.needsUpdate = true; },
    undefined,
    () => { mat.color.set(fallbackColor); }
  );
  return mat;
}
```

- [ ] **Step 2: main.js 임시 바닥에 아스팔트 텍스처 적용해 확인**

```js
import { asphalt } from './textures.js';
// ground material 교체:
new THREE.MeshStandardMaterial({ map: asphalt([40, 40]), roughness: 0.95 })
```

- [ ] **Step 3: 서빙 + 스크린샷 검증** — 바닥에 아스팔트 질감, 콘솔 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/textures.js src/main.js
git commit -m "Add procedural canvas texture generators"
```

---

### Task 4: 도로·보도 (kit/street.js)

**Files:**
- Create: `src/kit/street.js`
- Modify: `src/main.js` (임시 바닥 제거, street 추가)

- [ ] **Step 1: street.js 작성**

```js
// src/kit/street.js — 도로, 보도, 경계석, 노면 표시
import * as THREE from 'three';
import { asphalt, stucco, roadText } from '../textures.js';

export function createStreet({ length = 160, roadWidth = 6, sidewalk = 1.6 }) {
  const g = new THREE.Group();
  const zc = length / 2;

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, length),
    new THREE.MeshStandardMaterial({ map: asphalt([3, 40]), roughness: 0.95 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, zc);
  road.receiveShadow = true;
  g.add(road);

  // 양측 보도 + 경계석
  for (const side of [1, -1]) {
    const sw = new THREE.Mesh(
      new THREE.BoxGeometry(sidewalk, 0.12, length),
      new THREE.MeshStandardMaterial({ map: stucco('#b9b4aa', [2, 60]), roughness: 0.9 })
    );
    sw.position.set(side * (roadWidth / 2 + sidewalk / 2), 0.06, zc);
    sw.receiveShadow = true;
    g.add(sw);
    const curb = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.14, length),
      new THREE.MeshStandardMaterial({ color: 0xc9c4ba, roughness: 0.85 })
    );
    curb.position.set(side * (roadWidth / 2 + 0.075), 0.07, zc);
    g.add(curb);
  }

  // 노란 가장자리 차선 (양측)
  for (const side of [1, -1]) {
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(0.12, length),
      new THREE.MeshStandardMaterial({ color: 0xd8b428, roughness: 0.8 })
    );
    line.rotation.x = -Math.PI / 2;
    line.position.set(side * (roadWidth / 2 - 0.35), 0.012, zc);
    g.add(line);
  }
  return g;
}

// 세로쓰기 도로 문구 ("천천히", "학교앞")
export function createRoadText(text, z, { x = 0 } = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 4.2),
    new THREE.MeshStandardMaterial({ map: roadText(text), transparent: true, roughness: 0.8 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.013, z);
  return m;
}

// 횡단보도
export function createCrosswalk(z, { width = 6 } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xdedad2, roughness: 0.8 });
  for (let i = 0; i < Math.floor(width / 0.9); i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), mat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(-width / 2 + 0.45 + i * 0.9, 0.013, z);
    g.add(s);
  }
  return g;
}
```

- [ ] **Step 2: main.js에서 임시 바닥을 street + 주변 지면으로 교체**

```js
import { createStreet, createRoadText, createCrosswalk } from './kit/street.js';

// 임시 ground Mesh 제거하고 아래로 교체:
const dirt = new THREE.Mesh(
  new THREE.PlaneGeometry(500, 500),
  new THREE.MeshStandardMaterial({ color: 0x8a8275, roughness: 1 })
);
dirt.rotation.x = -Math.PI / 2;
dirt.position.y = -0.02;
dirt.receiveShadow = true;
scene.add(dirt);

scene.add(createStreet({ length: 160 }));
scene.add(createCrosswalk(6));
scene.add(createRoadText('천천히', 14));
scene.add(createRoadText('학교앞', 24));
scene.add(createRoadText('천천히', 70));
```

- [ ] **Step 3: 서빙 + 스크린샷 검증** — 아스팔트 도로, 보도, 노란 선, "천천히" 문구 확인

- [ ] **Step 4: 커밋**

```bash
git add src/kit/street.js src/main.js
git commit -m "Add street kit with road, sidewalks, and painted markings"
```

---

### Task 5: 1인칭 플레이어 (player.js)

**Files:**
- Create: `src/player.js`
- Modify: `src/main.js`

- [ ] **Step 1: player.js 작성**

```js
// src/player.js — PointerLock 1인칭 이동 + AABB 충돌
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const EYE = 1.6, RADIUS = 0.4, WALK = 4, RUN = 7;

export class Player {
  constructor(camera, dom, overlay) {
    this.controls = new PointerLockControls(camera, dom);
    this.camera = camera;
    this.keys = {};
    this.vel = new THREE.Vector3();
    this.colliders = [];          // THREE.Box3 목록 (main에서 채움)

    overlay.addEventListener('click', () => this.controls.lock());
    this.controls.addEventListener('lock', () => overlay.classList.add('hidden'));
    this.controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));
    document.addEventListener('keydown', (e) => (this.keys[e.code] = true));
    document.addEventListener('keyup', (e) => (this.keys[e.code] = false));
  }

  addCollider(box3) { this.colliders.push(box3); }

  #hits(p) {
    for (const b of this.colliders) {
      if (p.x > b.min.x - RADIUS && p.x < b.max.x + RADIUS &&
          p.z > b.min.z - RADIUS && p.z < b.max.z + RADIUS &&
          EYE > b.min.y && b.max.y > 0.3) return true;   // 낮은 턱은 통과
    }
    return false;
  }

  update(dt) {
    if (!this.controls.isLocked) return;
    const speed = this.keys['ShiftLeft'] ? RUN : WALK;
    const f = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const r = (this.keys['KeyD'] ? 1 : 0) - (this.keys['KeyA'] ? 1 : 0);

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
    const move = dir.multiplyScalar(f).add(right.multiplyScalar(r));
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed * dt);

    const p = this.camera.position;
    // 축 분리 이동 — 벽에 비비며 슬라이드 가능
    const tryX = p.clone(); tryX.x += move.x;
    if (!this.#hits(tryX)) p.x = tryX.x;
    const tryZ = p.clone(); tryZ.z += move.z;
    if (!this.#hits(tryZ)) p.z = tryZ.z;
    p.y = EYE;
  }
}
```

- [ ] **Step 2: main.js 통합**

```js
import { Player } from './player.js';

const player = new Player(camera, renderer.domElement, overlay);
// overlay의 기존 click 리스너(classList.add('hidden'))는 제거 — Player가 lock/unlock으로 처리

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  player.update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
});
```

- [ ] **Step 3: 검증** — 클릭 → 포인터 락, WASD 이동, Shift 달리기, ESC 시 오버레이 복귀

- [ ] **Step 4: 커밋**

```bash
git add src/player.js src/main.js
git commit -m "Add first-person player with pointer lock and AABB collision"
```

---

### Task 6: 범용 건물 생성기 (kit/buildings.js)

**Files:**
- Create: `src/kit/buildings.js`

- [ ] **Step 1: buildings.js 작성**

```js
// src/kit/buildings.js — 파라미터 건물 + 간판
import * as THREE from 'three';
import { facade, stucco, brick, fromAsset } from '../textures.js';

const FLOOR_H = 2.9;

// opts: { w, d, floors, wall, cols, storefront, kind: 'stucco'|'brick'|'facade', signs: [{file|color,text?, w, h, y, x}] }
export function createBuilding(opts) {
  const { w, d, floors = 3, wall = '#e3ded2', cols = 4, storefront = false, kind = 'facade', signs = [] } = opts;
  const g = new THREE.Group();
  const h = floors * FLOOR_H;

  let front;
  if (kind === 'brick') front = new THREE.MeshStandardMaterial({ map: brick([w / 4, floors]), roughness: 0.9 });
  else if (kind === 'stucco') front = new THREE.MeshStandardMaterial({ map: stucco(wall, [w / 6, 1]), roughness: 0.9 });
  else front = new THREE.MeshStandardMaterial({ map: facade({ floors, cols, wall, storefront }), roughness: 0.85 });
  const side = new THREE.MeshStandardMaterial({ map: stucco(wall, [d / 6, 1]), roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, side, side, front, side]);
  // BoxGeometry 면 순서: +x,-x,+y,-y,+z,-z — 정면(+z)이 도로를 향하도록 배치 시 회전으로 맞춤
  body.position.y = h / 2;
  body.castShadow = body.receiveShadow = true;
  g.add(body);

  // 옥상 파라펫 + 물탱크
  const parapet = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.15, 0.5, d + 0.15),
    new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.9 })
  );
  parapet.position.y = h + 0.25;
  g.add(parapet);
  if (floors >= 3) {
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xd9b94e, roughness: 0.6 })
    );
    tank.position.set(w * 0.25, h + 1.1, -d * 0.2);
    tank.castShadow = true;
    g.add(tank);
  }

  // 간판: file(추출 텍스처) 또는 color+text(캔버스)
  for (const s of signs) {
    const mat = s.file
      ? fromAsset(s.file, 0x2255aa)
      : new THREE.MeshStandardMaterial({ color: s.color ?? 0x2255aa, roughness: 0.7 });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, 0.12), mat);
    sign.position.set(s.x ?? 0, s.y, d / 2 + 0.08);
    sign.castShadow = true;
    g.add(sign);
  }
  return g;   // 호출측에서 position/rotation 설정 후, Box3는 main에서 setFromObject로 생성
}
```

- [ ] **Step 2: main.js에 시험 건물 1동 배치해 확인 후 제거** (배치는 Task 9 layout에서)

```js
import { createBuilding } from './kit/buildings.js';
const test = createBuilding({ w: 8, d: 10, floors: 3, storefront: true,
  signs: [{ file: 'sign-academy.jpg', w: 6, h: 1.1, y: 3.4 }] });
test.position.set(-9, 0, 40);
scene.add(test);
```

- [ ] **Step 3: 서빙 + 스크린샷 검증** — 창문 그리드, 1층 상가 유리, 수학학원 간판 텍스처 확인. 확인 후 시험 배치 코드는 남겨둬도 무방 (Task 9에서 layout 기반으로 교체)

- [ ] **Step 4: 커밋**

```bash
git add src/kit/buildings.js src/main.js
git commit -m "Add parametric building factory with signage support"
```

---

### Task 7: 학교 쪽 (kit/school.js)

**Files:**
- Create: `src/kit/school.js`

- [ ] **Step 1: school.js 작성**

```js
// src/kit/school.js — 좌측(x>0): 석축 옹벽 + 녹색 펜스 + 소나무 + 학교 건물
import * as THREE from 'three';
import { graniteWall, fenceMesh, facade } from '../textures.js';

function pine(scale = 1) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 2.2 * scale, 8),
    new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 1 })
  );
  trunk.position.y = 1.1 * scale;
  trunk.castShadow = true;
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2d5a2d, roughness: 1 });
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry((1.3 - i * 0.3) * scale, 1.3 * scale, 9), leaf);
    cone.position.y = (2 + i * 0.85) * scale;
    cone.castShadow = true;
    g.add(cone);
  }
  return g;
}

// 옹벽+펜스 한 구간. x0 = 옹벽 앞면 x 좌표, z0~z1 구간
export function createSchoolWall({ x0 = 5, z0 = 0, z1 = 160, wallH = 1.6 }) {
  const g = new THREE.Group();
  const len = z1 - z0, zc = (z0 + z1) / 2;

  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, wallH, len),
    new THREE.MeshStandardMaterial({ map: graniteWall([len / 8, 1]), roughness: 0.95 })
  );
  wall.position.set(x0 + 0.4, wallH / 2, zc);
  wall.castShadow = wall.receiveShadow = true;
  g.add(wall);

  const fence = new THREE.Mesh(
    new THREE.PlaneGeometry(len, 1.8),
    new THREE.MeshStandardMaterial({
      map: fenceMesh([len / 2, 1]), transparent: true, alphaTest: 0.3,
      side: THREE.DoubleSide, roughness: 0.7,
    })
  );
  fence.rotation.y = Math.PI / 2;
  fence.position.set(x0 + 0.4, wallH + 0.9, zc);
  g.add(fence);

  // 소나무 — 8m 간격, 펜스 안쪽
  for (let z = z0 + 4; z < z1; z += 8) {
    const p = pine(0.9 + Math.random() * 0.5);
    p.position.set(x0 + 2.2, wallH, z);
    g.add(p);
  }
  return g;
}

// 학교 건물 (크림색, 창문 많은 긴 박스) — 펜스 너머
export function createSchoolBuilding({ x = 18, z, len = 45, floors = 4 }) {
  const mat = new THREE.MeshStandardMaterial({ map: facade({ floors, cols: 12, wall: '#ece5d3' }), roughness: 0.85 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xe0d9c8, roughness: 0.9 });
  const h = floors * 3.1;
  const m = new THREE.Mesh(new THREE.BoxGeometry(12, h, len), [sideMat, sideMat, sideMat, sideMat, sideMat, sideMat]);
  m.material[1] = mat;            // -x 면이 도로(−x 방향)를 향함
  m.position.set(x, h / 2 + 1.6, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}
```

- [ ] **Step 2: main.js에 학교 쪽 추가**

```js
import { createSchoolWall, createSchoolBuilding } from './kit/school.js';
scene.add(createSchoolWall({ x0: 5, z0: 0, z1: 160 }));
scene.add(createSchoolBuilding({ x: 18, z: 45, len: 50, floors: 4 }));
scene.add(createSchoolBuilding({ x: 20, z: 110, len: 40, floors: 3 }));
```

- [ ] **Step 3: 서빙 + 스크린샷 검증** — 석축 위 녹색 철망 펜스(투과), 소나무 열, 뒤편 크림색 학교 건물

- [ ] **Step 4: 커밋**

```bash
git add src/kit/school.js src/main.js
git commit -m "Add school-side kit: granite retaining wall, mesh fence, pines, school buildings"
```

---

### Task 8: 소품 (kit/props.js)

**Files:**
- Create: `src/kit/props.js`

- [ ] **Step 1: props.js 작성**

```js
// src/kit/props.js — 전봇대/전선, 차량, 표지판, 굴착기, 흙더미, 공사 펜스
import * as THREE from 'three';
import { signBoard } from '../textures.js';

const gray = (c, r = 0.8) => new THREE.MeshStandardMaterial({ color: c, roughness: r });

export function createUtilityPole({ transformer = false } = {}) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 9, 10), gray(0x9a9a96, 0.95));
  pole.position.y = 4.5;
  pole.castShadow = true;
  g.add(pole);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.08), gray(0x777));
  arm.position.y = 8.2;
  g.add(arm);
  if (transformer) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 10), gray(0x55585c));
    t.position.set(0.35, 7.2, 0);
    g.add(t);
  }
  return g;
}

// 두 전봇대 사이 늘어진 전선 3가닥
export function createWires(a, b) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (let i = -1; i <= 1; i++) {
    const p0 = a.clone().add(new THREE.Vector3(i * 0.5, 8.2, 0));
    const p1 = b.clone().add(new THREE.Vector3(i * 0.5, 8.2, 0));
    const mid = p0.clone().lerp(p1, 0.5); mid.y -= 0.8;   // 처짐
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p1);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.02, 4), mat));
  }
  return g;
}

// 저폴리 차량: body+cabin+바퀴. type: 'sedan'|'suv'|'taxi'|'truck'
export function createCar({ color = 0xeeeeee, type = 'sedan' } = {}) {
  const g = new THREE.Group();
  const dims = { sedan: [1.75, 0.55, 4.4], suv: [1.85, 0.8, 4.5], taxi: [1.75, 0.55, 4.4], truck: [1.9, 0.9, 5.2] }[type];
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.5 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(...dims), bodyMat);
  body.position.y = 0.3 + dims[1] / 2;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(dims[0] * 0.86, 0.5, dims[2] * (type === 'truck' ? 0.3 : 0.5)),
    new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.2, metalness: 0.3 })
  );
  cabin.position.set(0, 0.3 + dims[1] + 0.25, type === 'truck' ? dims[2] * 0.28 : -dims[2] * 0.05);
  cabin.castShadow = true;
  g.add(cabin);
  if (type === 'taxi') {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.3), gray(0xffc928, 0.4));
    cap.position.y = 0.3 + dims[1] + 0.58;
    g.add(cap);
  }
  const wheel = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 });
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12), wheel);
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * dims[0] / 2, 0.32, sz * dims[2] * 0.32);
    g.add(w);
  }
  return g;
}

export function createRoadSign(kind) {   // 'school-zone' | 'no-left-turn'
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3, 8), gray(0x888));
  pole.position.y = 1.5;
  g.add(pole);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.85),
    new THREE.MeshStandardMaterial({ map: signBoard(kind), side: THREE.DoubleSide, roughness: 0.5 })
  );
  board.position.y = 2.7;
  g.add(board);
  return g;
}

export function createExcavator() {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8a216, roughness: 0.5 });
  const dark = gray(0x333);
  const tracks = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 3.4), dark);
  tracks.position.y = 0.35; tracks.castShadow = true; g.add(tracks);
  const bodyM = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.8), yellow);
  bodyM.position.y = 1.25; bodyM.castShadow = true; g.add(bodyM);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1, 1.1, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.2 }));
  cab.position.set(-0.55, 2.2, -0.6); cab.castShadow = true; g.add(cab);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 2.6), yellow);
  boom.position.set(0.4, 2.1, 2.0); boom.rotation.x = -0.5; boom.castShadow = true; g.add(boom);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 2.0), yellow);
  arm.position.set(0.4, 1.5, 3.6); arm.rotation.x = 0.7; arm.castShadow = true; g.add(arm);
  const bucket = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6), dark);
  bucket.position.set(0.4, 0.6, 4.3); g.add(bucket);
  return g;
}

export function createDirtPile({ r = 2.5, h = 1.4 } = {}) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a5f3c, roughness: 1 })
  );
  m.scale.y = h / r;
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function createConstructionFence(len) {
  const g = new THREE.Group();
  const mats = [gray(0xf5f5f0, 0.6), gray(0xe87820, 0.6)];
  const n = Math.ceil(len / 2);
  for (let i = 0; i < n; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2, 1.9, 0.06), mats[i % 2]);
    p.position.set(0, 0.95, i * 2 - len / 2 + 1);
    p.castShadow = true;
    g.add(p);
  }
  return g;
}
```

- [ ] **Step 2: main.js에 시험 배치 (전봇대 2개+전선, 차 1대, 굴착기)로 동작 확인**

```js
import { createUtilityPole, createWires, createCar, createExcavator } from './kit/props.js';
const p1 = new THREE.Vector3(-4.2, 0, 20), p2 = new THREE.Vector3(-4.2, 0, 45);
for (const p of [p1, p2]) { const pole = createUtilityPole({ transformer: true }); pole.position.copy(p); scene.add(pole); }
scene.add(createWires(p1, p2));
const car = createCar({ type: 'taxi', color: 0xf5f5f0 }); car.position.set(2, 0, 30); scene.add(car);
const ex = createExcavator(); ex.position.set(-6, 0, 60); scene.add(ex);
```

- [ ] **Step 3: 서빙 + 스크린샷 검증** — 전선 처짐, 택시 갓등, 굴착기 형태 확인

- [ ] **Step 4: 커밋**

```bash
git add src/kit/props.js src/main.js
git commit -m "Add props kit: poles, wires, cars, signs, excavator, construction items"
```

---

### Task 9: 배치 데이터 + 전체 조립 (layout.js)

**Files:**
- Create: `src/layout.js`
- Modify: `src/main.js` (시험 배치 전부 제거, layout 기반 조립으로 교체)

- [ ] **Step 1: layout.js 작성 — 구간별 배치 데이터 (스펙의 4개 구간)**

```js
// src/layout.js — 순수 배치 데이터. 우측(상가/주택) = x<0, 좌측(학교) = x>0
export const ALLEY = { length: 160, roadWidth: 6 };

// 우측 건물열 — z 순서대로. rotY 는 정면이 도로(+x 방향)를 향하게 main에서 일괄 적용
export const BUILDINGS = [
  // 구간2: 상가 골목 (30–80m)
  { z: 34, x: -10, w: 9, d: 10, floors: 3, storefront: true, wall: '#ddd6c8',
    signs: [{ file: 'sign-academy.jpg', w: 7, h: 1.2, y: 3.5 }] },
  { z: 45, x: -10, w: 9, d: 9, floors: 4, kind: 'brick',
    signs: [{ file: 'sign-maemae.jpg', w: 2, h: 4, y: 6, x: 3 }] },
  { z: 56, x: -9.5, w: 9, d: 8, floors: 2, storefront: true, wall: '#cfc8bb',
    signs: [{ color: 0x1e63c8, w: 6, h: 1, y: 2.9 }] },
  { z: 66, x: -10, w: 9, d: 9, floors: 3, wall: '#e8e2d4' },
  // 구간3: 주택 골목 (80–120m)
  { z: 84, x: -9, w: 8, d: 8, floors: 2, kind: 'stucco', wall: '#e5dfd2' },
  { z: 94, x: -9, w: 8, d: 8, floors: 2, kind: 'stucco', wall: '#d8d2c5' },
  { z: 104, x: -9.5, w: 9, d: 9, floors: 3, kind: 'brick' },
  { z: 114, x: -9, w: 8, d: 8, floors: 2, kind: 'stucco', wall: '#ddd8cc' },
  // 구간4: 종점 (120–160m)
  { z: 132, x: -10, w: 10, d: 11, floors: 4, wall: '#f0e9da',
    signs: [{ file: 'facade-daycare.jpg', w: 8, h: 5, y: 8 }, { file: 'banner-rent.jpg', w: 2.4, h: 1.5, y: 4.5, x: -3 }] },
  { z: 150, x: -10, w: 11, d: 12, floors: 4, wall: '#e8ddd0', storefront: true,
    signs: [{ color: 0xa03050, w: 7, h: 1.4, y: 4.2 }] },   // 모텔 — 체크 타일 입구는 main에서 별도
];

// 주차 차량 — side: 1=좌측 갓길, -1=우측 갓길
export const CARS = [
  { z: 36, side: 1, type: 'taxi', color: 0xf5f5f0 },
  { z: 42, side: 1, type: 'sedan', color: 0xffffff },
  { z: 58, side: -1, type: 'truck', color: 0x3a62b0 },
  { z: 86, side: 1, type: 'sedan', color: 0xe8e8e8 },
  { z: 92, side: 1, type: 'sedan', color: 0xc62828 },
  { z: 98, side: -1, type: 'suv', color: 0x556270 },
  { z: 118, side: 1, type: 'suv', color: 0x2f4f3f },
  { z: 124, side: 1, type: 'sedan', color: 0xc62828 },
];

export const POLES = [12, 34, 56, 78, 100, 122, 144].map((z) => ({ z, x: -4.2 }));

export const SIGNS = [
  { z: 8, x: 4.2, kind: 'school-zone' },
  { z: 100, x: 4.2, kind: 'no-left-turn' },
];

export const CONSTRUCTION = { z0: 138, z1: 148, x: -8 };   // 공사장 영역(우측)
```

- [ ] **Step 2: main.js 전면 조립 — 시험 배치 제거 후 다음으로 교체**

```js
import { ALLEY, BUILDINGS, CARS, POLES, SIGNS, CONSTRUCTION } from './layout.js';
import { createBuilding } from './kit/buildings.js';
import { createSchoolWall, createSchoolBuilding } from './kit/school.js';
import {
  createUtilityPole, createWires, createCar, createRoadSign,
  createExcavator, createDirtPile, createConstructionFence,
} from './kit/props.js';
import { fromAsset } from './textures.js';

// 충돌 등록 헬퍼
function addWithCollider(obj) {
  scene.add(obj);
  obj.updateMatrixWorld(true);
  player.addCollider(new THREE.Box3().setFromObject(obj));
}

// 우측 건물열 (정면 +x 방향 = 도로 쪽이 되도록 90도 회전)
for (const b of BUILDINGS) {
  const m = createBuilding(b);
  m.rotation.y = Math.PI / 2;
  m.position.set(b.x, 0, b.z);
  addWithCollider(m);
}

// 좌측 학교
addWithCollider(createSchoolWall({ x0: 5, z0: 0, z1: ALLEY.length }));
scene.add(createSchoolBuilding({ x: 18, z: 45, len: 50, floors: 4 }));
scene.add(createSchoolBuilding({ x: 20, z: 110, len: 40, floors: 3 }));

// 차량
for (const c of CARS) {
  const car = createCar(c);
  car.position.set(c.side * (ALLEY.roadWidth / 2 - 1.1), 0, c.z);
  addWithCollider(car);
}

// 전봇대 + 전선 (이웃끼리 연결)
const polePts = [];
for (const p of POLES) {
  const pole = createUtilityPole({ transformer: Math.random() > 0.5 });
  pole.position.set(p.x, 0, p.z);
  scene.add(pole);
  polePts.push(new THREE.Vector3(p.x, 0, p.z));
}
for (let i = 0; i + 1 < polePts.length; i++) scene.add(createWires(polePts[i], polePts[i + 1]));

// 표지판
for (const s of SIGNS) {
  const sign = createRoadSign(s.kind);
  sign.position.set(s.x, 0, s.z);
  sign.rotation.y = -Math.PI / 2 * Math.sign(s.x);
  scene.add(sign);
}

// 공사장 (구간4 우측)
{
  const { z0, z1, x } = CONSTRUCTION;
  const ex = createExcavator();
  ex.position.set(x, 0, (z0 + z1) / 2);
  ex.rotation.y = 0.6;
  addWithCollider(ex);
  const dirt1 = createDirtPile({ r: 2.5 }); dirt1.position.set(x - 3, 0, z0 + 2); addWithCollider(dirt1);
  const dirt2 = createDirtPile({ r: 1.8, h: 1 }); dirt2.position.set(x + 1, 0, z1 - 1); addWithCollider(dirt2);
  const cf = createConstructionFence(z1 - z0 + 4);
  cf.position.set(x + 4, 0, (z0 + z1) / 2);
  addWithCollider(cf);
}

// 모텔 체크 타일 입구 (마지막 건물 앞 바닥)
{
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), fromAsset('tile-checker.jpg', 0x886655));
  tile.rotation.x = -Math.PI / 2;
  tile.position.set(-6.5, 0.015, 150);
  tile.receiveShadow = true;
  scene.add(tile);
}

// 골목 경계(보이지 않는 벽): 도로 양끝
player.addCollider(new THREE.Box3(new THREE.Vector3(-20, 0, -1), new THREE.Vector3(20, 5, 0)));
player.addCollider(new THREE.Box3(new THREE.Vector3(-20, 0, ALLEY.length), new THREE.Vector3(20, 5, ALLEY.length + 1)));
```

- [ ] **Step 3: 서빙 + 전 구간 도보 검증**

시작점→종점까지 걸어서: ① 4개 구간 모두 도달 ② 건물·차량 통과 불가(충돌) ③ 간판 텍스처 표시 ④ 콘솔 에러 없음 ⑤ 프레임 드랍 없는지 확인. 스크린샷 4장(구간별).

- [ ] **Step 4: 커밋**

```bash
git add src/layout.js src/main.js
git commit -m "Assemble full alley from layout data with collisions"
```

---

### Task 10: 마감 — 분위기 튜닝 + README + 최종 검증

**Files:**
- Modify: `src/main.js` (필요시 조명/노출 튜닝)
- Create: `README.md`

- [ ] **Step 1: 참조 영상 프레임과 스크린샷 비교 후 톤 튜닝**

비교 항목: 햇빛 각도/그림자 선명도(`sun.position`, `shadow.mapSize`), 노출(`toneMappingExposure` 0.7~0.9), 안개 거리. 영상은 한낮의 강한 직사광 — 그림자 대비가 뚜렷해야 함.

- [ ] **Step 2: README.md 작성**

```markdown
# 거제동 골목길 산책 (Geoje-dong Alley Walk)

부산 연제구 거제동 여고로14번길 거리뷰 영상을 참조해 Three.js로 재현한
1인칭 걷기 씬입니다. 학교 옹벽 골목을 직접 걸어볼 수 있습니다.

## 실행 방법

ES 모듈을 사용하므로 로컬 서버로 실행하세요.

```powershell
powershell -File serve.ps1        # http://localhost:8000
```

python/node가 있다면 `python -m http.server 8000` / `npx serve .` 도 가능합니다.

## 조작법

| 키 | 동작 |
|---|---|
| `W` `A` `S` `D` | 이동 |
| 마우스 | 시점 회전 |
| `Shift` | 달리기 |
| `ESC` | 일시정지 |

## 구간

1. 학교 모퉁이 — 횡단보도, 어린이보호구역
2. 상가 골목 — 수학학원·부동산 간판
3. 주택 골목 — 석축 담장과 주차 차량
4. 종점 — 공사장 굴착기, 어린이집, 체크 타일 입구

## 기술

- Three.js r160 (vendor 동봉, 빌드 도구 없음)
- 프로시저럴 캔버스 텍스처 + 참조 영상에서 추출한 간판 텍스처
- 참조 영상: `video/Screenshot 2026-06-10 at 22.00.03.webm`
```

- [ ] **Step 3: 최종 전 구간 검증 (Task 9 Step 3와 동일 항목) + 시험 배치 잔재 제거 확인**

- [ ] **Step 4: 커밋**

```bash
git add README.md src/main.js
git commit -m "Tune lighting to match reference video and add README"
```

---

## Self-Review 체크 결과

- **스펙 커버리지:** 4개 구간(T9 layout), 혼합 텍스처(T2+T3), 1인칭+충돌(T5), 조명/Sky(T1, T10), 오류 처리(WebGL T1, 텍스처 폴백 T3 `fromAsset`, PointerLock 해제 시 오버레이 T5), 검증(각 태스크 + T10) — 누락 없음
- **플레이스홀더:** 없음 — 모든 코드 스텝에 실제 코드 포함
- **타입/시그니처 일관성:** `fromAsset(file, fallback)` T3 정의 → T6/T9 사용 일치. `createBuilding(opts)` T6 → T9 BUILDINGS 필드 일치. `Player.addCollider(Box3)` T5 → T9 사용 일치. `createWires(Vector3, Vector3)` T8 → T9 일치
