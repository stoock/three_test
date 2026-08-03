// 다이캐스트 카 사운드 — 외부 오디오 파일 없이 Web Audio API로 전부 합성한다.
//
// 실제 1:64 다이캐스트 레이싱의 소리는 엔진음이 아니라
//   ① 금속 액슬이 플라스틱/아스팔트 위를 구르는 광대역 노이즈 (속도에 따라 밝아짐)
//   ② 차체가 벽·디바이더를 긁는 금속성 마찰음
//   ③ 점프 중의 정적, 그리고 착지의 "탁" 하는 충격음
// 이 세 가지가 전부다. 그래서 노이즈 + 필터 + 짧은 임펄스로 충실히 재현할 수 있다.

const NOISE_SECONDS = 2;

export class RaceAudio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.ready = false;
    this.masterGain = null;
    this.voices = new Map();   // id → 차량 사운드 보이스
    this.weather = 'clear';
    this.style = 'classic';
    this.rate = 1;             // 리플레이 배속 (슬로우모션이면 음도 느려진다)
  }

  // 브라우저 자동재생 정책상 사용자 제스처에서 호출해야 한다
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const ctx = this.ctx;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.enabled ? 0.9 : 0;
    this.masterGain.connect(ctx.destination);

    // 트랙 전체가 울리는 가벼운 공간감 (임펄스 합성)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(0.5, 2.6);
    this.reverbGain = ctx.createGain();
    this.reverbGain.gain.value = 0.20;
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);

    this.noiseBuf = this._makeNoise();
    this._buildAmbience();
    this.ready = true;
    this.setWeather(this.weather);
  }

  _makeNoise() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * NOISE_SECONDS;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // 살짝 핑크빛으로 (완전 백색은 쇳소리가 너무 날카롭다)
      last = 0.86 * last + 0.14 * white;
      d[i] = last * 1.6 + white * 0.35;
    }
    return buf;
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noiseSource(loop = true) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = loop;
    return src;
  }

  /* ---------------- 날씨 앰비언스 ---------------- */
  _buildAmbience() {
    const ctx = this.ctx;
    this.ambSrc = this._noiseSource();
    this.ambFilter = ctx.createBiquadFilter();
    this.ambFilter.type = 'bandpass';
    this.ambFilter.frequency.value = 1200;
    this.ambFilter.Q.value = 0.5;
    this.ambGain = ctx.createGain();
    this.ambGain.gain.value = 0;
    this.ambSrc.connect(this.ambFilter);
    this.ambFilter.connect(this.ambGain);
    this.ambGain.connect(this.masterGain);
    this.ambSrc.start();
  }

  setWeather(w) {
    this.weather = w;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    // 비: 촘촘한 빗소리 / 눈: 먹먹하고 조용한 바람 / 맑음: 거의 무음
    const cfg = {
      clear: { gain: 0.012, freq: 900, q: 0.4 },
      rain:  { gain: 0.085, freq: 2600, q: 0.35 },
      snow:  { gain: 0.030, freq: 420, q: 0.5 },
    }[w] || { gain: 0.01, freq: 900, q: 0.5 };
    this.ambGain.gain.setTargetAtTime(cfg.gain, t, 0.4);
    this.ambFilter.frequency.setTargetAtTime(cfg.freq, t, 0.4);
    this.ambFilter.Q.value = cfg.q;
  }

  setStyle(s) { this.style = s; }
  setRate(r) { this.rate = Math.max(0.05, r); }

  setEnabled(on) {
    this.enabled = on;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
    }
  }

  /* ---------------- 차량 보이스 ---------------- */
  // 차량마다 구름/스크럽 두 개의 지속음 체인을 만든다
  addVoice(id, { massG = 55, wheel = 'stock', ghost = false } = {}) {
    if (!this.ready) return;
    this.removeVoice(id);
    const ctx = this.ctx;

    const out = ctx.createGain();     // 거리 감쇠
    out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { out.connect(pan); pan.connect(this.masterGain); pan.connect(this.reverb); }
    else { out.connect(this.masterGain); out.connect(this.reverb); }

    // ① 구름 소리: 노이즈 → 밴드패스(속도에 따라 이동) + 저역 성분
    const rollSrc = this._noiseSource();
    const rollBP = ctx.createBiquadFilter();
    rollBP.type = 'bandpass';
    rollBP.frequency.value = 400;
    rollBP.Q.value = 0.9;
    const rollLP = ctx.createBiquadFilter();
    rollLP.type = 'lowpass';
    rollLP.frequency.value = 3000;
    const rollGain = ctx.createGain();
    rollGain.gain.value = 0;
    rollSrc.connect(rollBP); rollBP.connect(rollLP); rollLP.connect(rollGain);
    rollGain.connect(out);
    rollSrc.start(ctx.currentTime + Math.random() * 0.1);

    // 무거운 차일수록 저역이 실린 묵직한 구름음
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'sawtooth';
    bodyOsc.frequency.value = 60;
    const bodyLP = ctx.createBiquadFilter();
    bodyLP.type = 'lowpass';
    bodyLP.frequency.value = 260;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0;
    bodyOsc.connect(bodyLP); bodyLP.connect(bodyGain); bodyGain.connect(out);
    bodyOsc.start();

    // ② 벽 스크럽: 고역 밴드패스 노이즈 (금속이 긁히는 소리)
    const scrubSrc = this._noiseSource();
    const scrubBP = ctx.createBiquadFilter();
    scrubBP.type = 'bandpass';
    scrubBP.frequency.value = 3200;
    scrubBP.Q.value = 4.5;
    const scrubHP = ctx.createBiquadFilter();
    scrubHP.type = 'highpass';
    scrubHP.frequency.value = 1500;
    const scrubGain = ctx.createGain();
    scrubGain.gain.value = 0;
    scrubSrc.connect(scrubBP); scrubBP.connect(scrubHP); scrubHP.connect(scrubGain);
    scrubGain.connect(out);
    scrubSrc.start(ctx.currentTime + Math.random() * 0.1);

    // ③ 비행 중 바람
    const windSrc = this._noiseSource();
    const windBP = ctx.createBiquadFilter();
    windBP.type = 'bandpass';
    windBP.frequency.value = 700;
    windBP.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windBP); windBP.connect(windGain); windGain.connect(out);
    windSrc.start(ctx.currentTime + Math.random() * 0.1);

    this.voices.set(id, {
      out, pan, rollBP, rollLP, rollGain, bodyOsc, bodyGain,
      scrubBP, scrubGain, windBP, windGain,
      massG, wheel, ghost,
      nodes: [rollSrc, scrubSrc, windSrc, bodyOsc],
    });
  }

  removeVoice(id) {
    const v = this.voices.get(id);
    if (!v) return;
    for (const n of v.nodes) { try { n.stop(); } catch { /* 이미 정지 */ } }
    try { v.out.disconnect(); } catch { /* 무시 */ }
    this.voices.delete(id);
  }

  clearVoices() {
    for (const id of [...this.voices.keys()]) this.removeVoice(id);
  }

  // 매 프레임 차량 상태 반영
  // st: { v, scrub, wallContact, airborne, dist(카메라까지 m), panX(-1..1) }
  updateVoice(id, st) {
    const v = this.voices.get(id);
    if (!v || !this.ready) return;
    const t = this.ctx.currentTime;
    const rate = this.rate;
    const speed = Math.max(0, st.v);

    // 거리 감쇠 (1:64 스케일이므로 수십 cm 단위에서 급격히 줄어든다)
    const d = Math.max(0.12, st.dist ?? 1);
    let dist = Math.min(1, 0.45 / d);
    if (v.ghost) dist *= 0.35;                  // 고스트는 옅게
    v.out.gain.setTargetAtTime(dist, t, 0.05);
    if (v.pan) v.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, st.panX ?? 0)), t, 0.08);

    if (st.airborne) {
      // 공중: 구름 소리가 뚝 끊기고 바람만 남는다 (실제 점프의 그 정적)
      v.rollGain.gain.setTargetAtTime(0, t, 0.03);
      v.bodyGain.gain.setTargetAtTime(0, t, 0.03);
      v.scrubGain.gain.setTargetAtTime(0, t, 0.03);
      v.windGain.gain.setTargetAtTime(Math.min(0.16, speed * 0.02), t, 0.06);
      v.windBP.frequency.setTargetAtTime((500 + speed * 90) * rate, t, 0.06);
      return;
    }
    v.windGain.gain.setTargetAtTime(0, t, 0.08);

    // 구름음: 속도에 따라 밝기·크기가 오른다. 트랙 재질에 따라 음색이 다르다.
    const road = this.style === 'road';
    const wheelBright = v.wheel === 'race' ? 1.25 : v.wheel === 'fte' ? 1.1 : 1.0;
    const base = road ? 240 : 380;              // 아스팔트는 더 낮고 거칠게
    v.rollBP.frequency.setTargetAtTime((base + speed * 210 * wheelBright) * rate, t, 0.05);
    v.rollBP.Q.value = road ? 0.5 : 1.1;        // 플라스틱 트랙은 좁고 통이 울리는 소리
    v.rollLP.frequency.setTargetAtTime((1600 + speed * 460) * rate, t, 0.06);

    // 젖은 노면은 쉭 하는 성분이 더해지고, 눈은 먹먹해진다
    const wetBoost = this.weather === 'rain' ? 1.25 : this.weather === 'snow' ? 0.8 : 1.0;
    const rollLevel = Math.min(0.5, Math.pow(speed, 1.15) * 0.055) * wetBoost;
    v.rollGain.gain.setTargetAtTime(speed > 0.05 ? rollLevel : 0, t, 0.04);

    // 저역 몸통 — 무거울수록 크고 낮게 (100g 넘는 커스텀은 "두두두" 하고 굴러간다)
    const heavy = Math.min(1, Math.max(0, (v.massG - 30) / 90));
    v.bodyOsc.frequency.setTargetAtTime(Math.max(24, (26 + speed * 7.5)) * rate, t, 0.05);
    v.bodyGain.gain.setTargetAtTime(
      speed > 0.2 ? Math.min(0.10, speed * 0.007 * (0.35 + heavy)) : 0, t, 0.05);

    // 벽 스크럽 — 접촉 세기에 비례한 금속 마찰음
    const sc = Math.max(st.scrub ?? 0, (st.wallContact ?? 0) * 0.35);
    if (sc > 0.02) {
      v.scrubGain.gain.setTargetAtTime(Math.min(0.30, 0.02 + sc * 0.030), t, 0.02);
      v.scrubBP.frequency.setTargetAtTime((2300 + Math.min(4200, sc * 220) + speed * 55) * rate, t, 0.03);
    } else {
      v.scrubGain.gain.setTargetAtTime(0, t, 0.05);
    }
  }

  /* ---------------- 원샷 효과음 ---------------- */
  _burst({ freq = 200, q = 1, gain = 0.3, dur = 0.12, type = 'bandpass', dist = 1 }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this._noiseSource(false);
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    const amp = gain * Math.min(1, 0.5 / Math.max(0.12, dist));
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.masterGain); g.connect(this.reverb);
    src.start(t); src.stop(t + dur + 0.02);
  }

  _tone({ freq = 440, dur = 0.12, gain = 0.18, type = 'sine', slideTo = null }) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.masterGain); g.connect(this.reverb);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 착지 — 다이캐스트 금속이 트랙에 떨어지는 "탁"
  landing(impact, dist = 1) {
    const k = Math.min(1, impact / 3);
    this._burst({ freq: 160 + k * 120, q: 0.8, gain: 0.18 + k * 0.42, dur: 0.10 + k * 0.09, dist });
    this._tone({ freq: 95 - k * 22, dur: 0.13 + k * 0.1, gain: 0.10 + k * 0.16, type: 'sine' });
    if (k > 0.35) this._burst({ freq: 3600, q: 3, gain: 0.10 * k, dur: 0.05, type: 'highpass', dist });
  }

  // 벽에 부딪히는 순간의 "탁" (긁힘과 별개)
  wallHit(strength, dist = 1) {
    const k = Math.min(1, strength / 1.2);
    if (k < 0.08) return;
    this._burst({ freq: 1800 + k * 1600, q: 2.2, gain: 0.06 + k * 0.26, dur: 0.045 + k * 0.05, dist });
  }

  gateRelease() {
    this._burst({ freq: 2200, q: 2, gain: 0.30, dur: 0.06 });
    this._tone({ freq: 620, slideTo: 240, dur: 0.10, gain: 0.12, type: 'square' });
  }

  countdownBeep(isGo) {
    if (isGo) {
      this._tone({ freq: 880, dur: 0.34, gain: 0.22, type: 'square' });
      this._tone({ freq: 1320, dur: 0.30, gain: 0.10, type: 'sine' });
    } else {
      this._tone({ freq: 440, dur: 0.14, gain: 0.16, type: 'square' });
    }
  }

  checkpoint() {
    this._tone({ freq: 1180, dur: 0.07, gain: 0.10, type: 'sine' });
  }

  finish(win = true) {
    const t = this.ctx?.currentTime ?? 0;
    this._tone({ freq: 660, dur: 0.14, gain: 0.16, type: 'square' });
    setTimeout(() => this._tone({ freq: win ? 990 : 520, dur: 0.30, gain: 0.16, type: 'square' }), 130);
    this._burst({ freq: 5200, q: 1.5, gain: 0.10, dur: 0.25, type: 'highpass' });
  }

  ui() { this._tone({ freq: 1500, dur: 0.03, gain: 0.05, type: 'sine' }); }
}
