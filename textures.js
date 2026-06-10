import * as THREE from 'three';

// ---------------------------------------------------------------------------
// 캔버스 기반 프로시저럴 텍스처 모음.
// 외부 이미지 없이 잔디/포장/나무껍질/창문/물 노멀맵 등을 생성한다.
// ---------------------------------------------------------------------------

function canvasTexture(size, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// 여러 옥타브의 사각형 노이즈를 겹쳐 칠한다
function paintNoise(ctx, size, base, colors, octaves = [8, 24, 64], alpha = 0.3) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (const cells of octaves) {
    const cell = size / cells;
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
        ctx.globalAlpha = Math.random() * alpha;
        ctx.fillRect(x * cell, y * cell, cell + 1, cell + 1);
      }
    }
  }
  ctx.globalAlpha = 1;
}

// 짧은 선 스트로크 (풀잎, 자갈 알갱이 등)
function paintStrokes(ctx, size, count, colors, len, width = 1) {
  for (let i = 0; i < count; i++) {
    ctx.strokeStyle = colors[(Math.random() * colors.length) | 0];
    ctx.globalAlpha = 0.25 + Math.random() * 0.4;
    ctx.lineWidth = width;
    const x = Math.random() * size, y = Math.random() * size;
    const a = Math.random() * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function makeGrass(size = 512) {
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#3f6129', ['#33511f', '#4c7334', '#587e3c', '#3a5c2c', '#6c8842'], [6, 16, 48, 128], 0.35);
    // 잔디 잎 결
    paintStrokes(ctx, size, 5000, ['#507a36', '#2e4a20', '#648c44', '#42662e'], 4, 1);
    // 마른 풀 패치
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = '#7a8048';
      ctx.globalAlpha = 0.05 + Math.random() * 0.1;
      ctx.beginPath();
      ctx.ellipse(Math.random() * size, Math.random() * size, 20 + Math.random() * 50, 14 + Math.random() * 30, Math.random() * 3, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

export function makeGravelPath(size = 512) {
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#b3a78c', ['#a3957a', '#c2b69b', '#998c72', '#cfc3a8'], [8, 24, 64], 0.4);
    // 자갈 알갱이
    for (let i = 0; i < 2600; i++) {
      const g = 140 + Math.random() * 80;
      ctx.fillStyle = `rgb(${g},${g - 12},${g - 32})`;
      ctx.globalAlpha = 0.4 + Math.random() * 0.4;
      const r = 0.8 + Math.random() * 1.6;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

export function makePavers(size = 512) {
  // 2x2 보도블록 (타일 1장 = 4m x 4m)
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#98928a', ['#8a847c', '#a6a098', '#918b83'], [16, 64], 0.3);
    const half = size / 2;
    for (let ty = 0; ty < 2; ty++) {
      for (let tx = 0; tx < 2; tx++) {
        // 블록별 명암 차이
        ctx.fillStyle = Math.random() < 0.5 ? '#ffffff' : '#000000';
        ctx.globalAlpha = Math.random() * 0.07;
        ctx.fillRect(tx * half, ty * half, half, half);
      }
    }
    ctx.globalAlpha = 1;
    // 줄눈
    ctx.strokeStyle = '#6e6962';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, size, size);
    ctx.beginPath();
    ctx.moveTo(half, 0); ctx.lineTo(half, size);
    ctx.moveTo(0, half); ctx.lineTo(size, half);
    ctx.stroke();
    // 얼룩
    paintStrokes(ctx, size, 300, ['#7c766e', '#aaa49c'], 8, 1);
  });
}

export function makeAsphalt(size = 512) {
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#46474b', ['#3c3d41', '#515257', '#404145'], [8, 32], 0.35);
    for (let i = 0; i < 3000; i++) {
      const g = 90 + Math.random() * 70;
      ctx.fillStyle = `rgb(${g},${g},${g + 4})`;
      ctx.globalAlpha = 0.25 + Math.random() * 0.3;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  });
}

export function makeBikeTrack(size = 512) {
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#8c4136', ['#7c382e', '#9c4c3e', '#84443a', '#6f332a'], [8, 32, 96], 0.35);
    // 우레탄 트랙 알갱이
    for (let i = 0; i < 2400; i++) {
      const r = 150 + Math.random() * 60;
      ctx.fillStyle = `rgb(${r},${70 + Math.random() * 30},${56 + Math.random() * 20})`;
      ctx.globalAlpha = 0.2 + Math.random() * 0.3;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  });
}

export function makeBark(size = 256) {
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#5d4830', ['#4c3a26', '#6e563a', '#544028'], [8, 32], 0.4);
    // 세로 결
    for (let i = 0; i < 120; i++) {
      ctx.strokeStyle = Math.random() < 0.5 ? '#3c2d1c' : '#7a6244';
      ctx.globalAlpha = 0.25 + Math.random() * 0.35;
      ctx.lineWidth = 1 + Math.random() * 3;
      const x = Math.random() * size;
      ctx.beginPath();
      ctx.moveTo(x, -4);
      ctx.bezierCurveTo(x + (Math.random() - 0.5) * 14, size * 0.33, x + (Math.random() - 0.5) * 14, size * 0.66, x + (Math.random() - 0.5) * 10, size + 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

export function makeLeafDetail(size = 256) {
  // 그레이스케일 디테일 — 인스턴스 컬러가 실제 녹색을 입힌다
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#a8a8a8', ['#787878', '#d0d0d0', '#909090', '#5e5e5e'], [6, 16, 48], 0.55);
    // 잎 덩어리 명암
    for (let i = 0; i < 700; i++) {
      const g = 110 + Math.random() * 120;
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.globalAlpha = 0.3 + Math.random() * 0.4;
      const r = 2 + Math.random() * 5;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

export function makeBlossomDetail(size = 256) {
  // 벚꽃 수관용 — 밝고 부드러운 디테일
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#dcdcdc', ['#c2c2c2', '#f2f2f2', '#cecece'], [8, 24], 0.4);
    for (let i = 0; i < 500; i++) {
      const g = 190 + Math.random() * 60;
      ctx.fillStyle = `rgb(${g},${g - 8},${g - 2})`;
      ctx.globalAlpha = 0.3 + Math.random() * 0.4;
      const r = 2 + Math.random() * 4;
      ctx.beginPath();
      ctx.arc(Math.random() * size, Math.random() * size, r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
}

export function makeConcrete(size = 256) {
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#8e8b86', ['#827f7a', '#9a9792', '#767370'], [8, 32, 96], 0.3);
    paintStrokes(ctx, size, 200, ['#6e6b66', '#a4a19c'], 6, 1);
  });
}

export function makeWindows(size = 256, { lit = 0.12, tint = [126, 150, 173] } = {}) {
  // 빌딩 외벽 한 타일: 창문 4열 x 5층
  return canvasTexture(size, (ctx) => {
    paintNoise(ctx, size, '#787a7e', ['#6c6e72', '#84868a'], [16, 64], 0.25);
    const cols = 4, rows = 5;
    const cw = size / cols, ch = size / rows;
    const mx = cw * 0.18, my = ch * 0.24;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + mx, y = r * ch + my;
        const w = cw - mx * 2, h = ch - my * 2;
        if (Math.random() < lit) {
          ctx.fillStyle = `rgb(${225 + Math.random() * 20},${205 + Math.random() * 20},${150 + Math.random() * 30})`;
        } else {
          const b = 0.55 + Math.random() * 0.75;
          ctx.fillStyle = `rgb(${tint[0] * b | 0},${tint[1] * b | 0},${tint[2] * b | 0})`;
        }
        ctx.fillRect(x, y, w, h);
        // 유리 반사 하이라이트
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.1 + Math.random() * 0.15;
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.lineTo(x + w * 0.45, y);
        ctx.lineTo(x + w * 0.75, y);
        ctx.lineTo(x + w * 0.3, y + h);
        ctx.fill();
        ctx.globalAlpha = 1;
        // 창틀
        ctx.strokeStyle = '#54565a';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
      }
    }
  });
}

export function makeWaterNormals(size = 256) {
  // 정수 주파수 사인파 합성 → 타일링 가능한 노멀맵
  const waves = [];
  for (let i = 0; i < 16; i++) {
    const f = 1 + ((Math.random() * 6) | 0);
    waves.push({
      fx: (Math.random() < 0.5 ? -1 : 1) * f,
      fy: 1 + ((Math.random() * 6) | 0),
      phase: Math.random() * Math.PI * 2,
      amp: 1 / (1 + f),
    });
  }
  const h = (x, y) => {
    let v = 0;
    for (const w of waves) v += w.amp * Math.sin(2 * Math.PI * (w.fx * x + w.fy * y) + w.phase);
    return v;
  };

  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const strength = 1.2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, e = 1 / size;
      const dx = (h(u + e, v) - h(u - e, v)) * strength;
      const dy = (h(u, v + e) - h(u, v - e)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// 텍스처를 복제해 반복 횟수만 바꾼다 (이미지는 공유)
export function withRepeat(tex, rx, ry) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
