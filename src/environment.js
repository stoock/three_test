import * as THREE from 'three';

// 날씨별 분위기 프리셋 (조명/안개/하늘)
const MOODS = {
  clear: { sky: 0x87b8e8, fogNear: 10, fogFar: 42, sun: 2.4, sunColor: 0xfff2dd, hemi: 0.9, hemiSky: 0xbfd9ff, ground: 0x6b7a5a },
  rain:  { sky: 0x8b98a6, fogNear: 6,  fogFar: 26, sun: 1.25, sunColor: 0xaab4c0, hemi: 0.95, hemiSky: 0x9aa6b4, ground: 0x525a50 },
  snow:  { sky: 0xc7d2dc, fogNear: 5,  fogFar: 22, sun: 1.4, sunColor: 0xe8eef5, hemi: 1.0, hemiSky: 0xdde6ee, ground: 0x9aa4ad },
};

export class Environment {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.weather = 'clear';

    // 트랙 근접 클램프용 샘플 (매 3번째)
    this.tSamples = [];
    for (let i = 0; i < track.center.pos.length; i += 3) {
      const p = track.center.pos[i];
      this.tSamples.push(p.x, p.y, p.z);
    }

    this._buildLights();
    this._buildTerrain();
    this._buildTrees();
    this._buildClouds();
    this._buildRain();
    this._buildSnow();
    this.setWeather('clear');
  }

  /* ------- 지형 높이 함수 (트랙 근처는 트랙 아래로 클램프) ------- */
  baseHeight(x, z) {
    let h = 2.5 * (1 - THREE.MathUtils.smoothstep(z, -1.5, 10.5));
    h += 0.32 * Math.sin(x * 1.7 + 1.3) * Math.sin(z * 0.9 + 0.5);
    h += 0.15 * Math.sin(x * 3.1 + 0.7) * Math.sin(z * 2.3 + 1.1);
    // 가장자리 산맥
    const rim = Math.max(0,
      THREE.MathUtils.smoothstep(Math.abs(x - 2.2), 4.2, 6.5) * 2.2 +
      THREE.MathUtils.smoothstep(-z, 1.0, 3.0) * 1.6);
    h += rim;
    return Math.max(0, h);
  }

  heightAt(x, z) {
    let h = this.baseHeight(x, z);
    const S = this.tSamples;
    for (let i = 0; i < S.length; i += 3) {
      const dx = x - S[i], dz = z - S[i + 2];
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.49) {
        const d = Math.sqrt(d2);
        const cap = S[i + 1] - 0.14 + Math.max(0, d - 0.28) * 1.3;
        if (h > cap) h = cap;
      }
    }
    return Math.max(0, h);
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x55604a, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
    this.sun.position.set(6, 9, -4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -8; sc.right = 8; sc.top = 12; sc.bottom = -12;
    sc.near = 1; sc.far = 30;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.sun.target.position.set(2, 0, 7);
  }

  _buildTerrain() {
    const W = 15, D = 21, SX = 110, SZ = 150;
    const geo = new THREE.PlaneGeometry(W, D, SX, SZ);
    geo.rotateX(-Math.PI / 2);
    // 중심 이동: x -4.5..10.5, z -3..18
    geo.translate(3, 0, 7.5);
    const pos = geo.attributes.position;
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const h = this.heightAt(pos.getX(i), pos.getZ(i));
      heights[i] = h;
      pos.setY(i, h);
    }
    this.terrainHeights = heights;
    geo.computeVertexNormals();

    // 버텍스 컬러 (날씨별 재채색)
    const colors = new Float32Array(pos.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.terrainGeo = geo;
    this.terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0,
    }));
    this.terrain.receiveShadow = true;
    this.scene.add(this.terrain);
    this._colorTerrain('clear');
  }

  _colorTerrain(weather) {
    const pos = this.terrainGeo.attributes.position;
    const col = this.terrainGeo.attributes.color;
    const nrm = this.terrainGeo.attributes.normal;
    const grass = new THREE.Color(0x55803f), rock = new THREE.Color(0x7d7568),
      snow = new THREE.Color(0xeef2f6), dirt = new THREE.Color(0x6d5b41);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const h = this.terrainHeights[i];
      const slope = 1 - nrm.getY(i); // 0=평지
      c.copy(grass).lerp(dirt, Math.min(1, slope * 3.2));
      c.lerp(rock, THREE.MathUtils.smoothstep(h, 1.8, 3.2));
      if (weather === 'snow') c.lerp(snow, 0.72 - Math.min(0.5, slope * 2));
      else if (h > 3.4) c.lerp(snow, 0.5);
      if (weather === 'rain') c.multiplyScalar(0.78);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  _buildTrees() {
    const count = 140;
    const coneGeo = new THREE.ConeGeometry(0.10, 0.30, 7);
    const trunkGeo = new THREE.CylinderGeometry(0.014, 0.018, 0.09, 5);
    this.coneMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.9 });
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.95 });
    const cones = new THREE.InstancedMesh(coneGeo, this.coneMat, count);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    cones.castShadow = true;
    const m = new THREE.Matrix4();
    let placed = 0, tries = 0;
    // 결정론적 배치
    let seed = 1234567;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    while (placed < count && tries < count * 30) {
      tries++;
      const x = -4 + rnd() * 14, z = -2.5 + rnd() * 20;
      // 트랙과 거리 확인
      let ok = true;
      const S = this.tSamples;
      for (let i = 0; i < S.length; i += 3) {
        const dx = x - S[i], dz = z - S[i + 2];
        if (dx * dx + dz * dz < 0.20) { ok = false; break; }
      }
      if (!ok) continue;
      const h = this.heightAt(x, z);
      const sc = 0.7 + rnd() * 0.9;
      m.makeScale(sc, sc, sc);
      m.setPosition(x, h + 0.15 * sc, z);
      cones.setMatrixAt(placed, m);
      m.makeScale(sc, sc, sc);
      m.setPosition(x, h + 0.04 * sc, z);
      trunks.setMatrixAt(placed, m);
      placed++;
    }
    cones.count = placed; trunks.count = placed;
    this.scene.add(cones, trunks);
  }

  _buildClouds() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    const grd = ctx.createRadialGradient(64, 64, 8, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    this.cloudMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false });
    this.clouds = new THREE.Group();
    let seed = 777;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Sprite(this.cloudMat);
      s.position.set(-4 + rnd() * 16, 5.2 + rnd() * 2.5, rnd() * 20 - 2);
      const sc = 2.5 + rnd() * 3.5;
      s.scale.set(sc, sc * 0.4, 1);
      s.userData.vx = 0.02 + rnd() * 0.04;
      this.clouds.add(s);
    }
    this.scene.add(this.clouds);
  }

  _buildRain() {
    const N = 1400;
    const pos = new Float32Array(N * 2 * 3);
    this.rainSeeds = new Float32Array(N * 3);
    let seed = 4242;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) {
      this.rainSeeds[i * 3] = -2 + rnd() * 12;
      this.rainSeeds[i * 3 + 1] = rnd() * 6;
      this.rainSeeds[i * 3 + 2] = -2 + rnd() * 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color: 0xaebfd4, transparent: true, opacity: 0.4,
    }));
    this.rain.visible = false;
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
    this.rainT = 0;
  }

  _buildSnow() {
    const N = 2600;
    const pos = new Float32Array(N * 3);
    this.snowSeeds = new Float32Array(N * 4);
    let seed = 9191;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) {
      this.snowSeeds[i * 4] = -2 + rnd() * 12;
      this.snowSeeds[i * 4 + 1] = rnd() * 6;
      this.snowSeeds[i * 4 + 2] = -2 + rnd() * 18;
      this.snowSeeds[i * 4 + 3] = rnd() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.snow = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffffff, size: 0.014, transparent: true, opacity: 0.9, sizeAttenuation: true,
    }));
    this.snow.visible = false;
    this.snow.frustumCulled = false;
    this.scene.add(this.snow);
    this.snowT = 0;
  }

  setWeather(w) {
    this.weather = w;
    const m = MOODS[w];
    this.scene.background = new THREE.Color(m.sky);
    this.scene.fog = new THREE.Fog(m.sky, m.fogNear, m.fogFar);
    this.sun.intensity = m.sun;
    this.sun.color.set(m.sunColor);
    this.hemi.intensity = m.hemi;
    this.hemi.color.set(m.hemiSky);
    this.hemi.groundColor.set(m.ground);
    this.rain.visible = w === 'rain';
    this.snow.visible = w === 'snow';
    this.cloudMat.opacity = w === 'clear' ? 0.85 : 1.0;
    this.cloudMat.color.set(w === 'clear' ? 0xffffff : w === 'rain' ? 0x555e68 : 0xb8c2cc);
    this.coneMat.color.set(w === 'snow' ? 0x51705c : 0x2d5a27);
    this._colorTerrain(w);
    this.track.setWet(w === 'rain');
  }

  update(dt, time) {
    for (const c of this.clouds.children) {
      c.position.x += c.userData.vx * dt;
      if (c.position.x > 13) c.position.x = -5;
    }
    if (this.rain.visible) {
      this.rainT += dt;
      const pos = this.rain.geometry.attributes.position.array;
      const fall = 6.5, drift = 0.8;
      const N = this.rainSeeds.length / 3;
      for (let i = 0; i < N; i++) {
        const x0 = this.rainSeeds[i * 3] + this.rainT * drift;
        const y = 6 - ((this.rainSeeds[i * 3 + 1] + this.rainT * fall) % 6);
        const z0 = this.rainSeeds[i * 3 + 2];
        const x = -2 + ((x0 + 2) % 12);
        const j = i * 6;
        pos[j] = x; pos[j + 1] = y; pos[j + 2] = z0;
        pos[j + 3] = x - 0.012; pos[j + 4] = y + 0.09; pos[j + 5] = z0;
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.snow.visible) {
      this.snowT += dt;
      const pos = this.snow.geometry.attributes.position.array;
      const fall = 0.55;
      const N = this.snowSeeds.length / 4;
      for (let i = 0; i < N; i++) {
        const ph = this.snowSeeds[i * 4 + 3];
        const y = 6 - ((this.snowSeeds[i * 4 + 1] + this.snowT * fall) % 6);
        pos[i * 3] = this.snowSeeds[i * 4] + Math.sin(time * 0.8 + ph) * 0.25;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = this.snowSeeds[i * 4 + 2] + Math.cos(time * 0.6 + ph) * 0.2;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
  }
}
