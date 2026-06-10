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
