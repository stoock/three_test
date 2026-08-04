// 물리 프레임 기록 → 보간 재생 + 하이라이트 자동 추출
// 다차량 대응: Recorder는 트랙(=차량)별 프레임 배열을 갖는다.
export const REC_HZ = 120;

export class Recorder {
  constructor(trackCount = 1) {
    this.tracks = Array.from({ length: trackCount }, () => []);
    this.meta = Array.from({ length: trackCount }, () => ({}));
  }
  clear(trackCount = this.tracks.length) {
    this.tracks = Array.from({ length: trackCount }, () => []);
    this.meta = Array.from({ length: trackCount }, () => ({}));
  }
  get count() { return this.tracks.length; }
  // 하위 호환: 단일 차량 접근
  get frames() { return this.tracks[0]; }

  // 프레임: [t, s, v, alt, scrub, airborne, impact, vy, lat, latV, wallContact, roll, crashed]
  // crashed: 0=정상, 1=전복, 2=코스 이탈
  push(t, car, trackIdx = 0) {
    this.tracks[trackIdx].push([t, car.s, car.v, car.alt, car.scrub,
      car.airborne ? 1 : 0, car.landedImpact, car.airborne ? car.vy : 0,
      car.lat, car.latV, car.wallContact, car.roll,
      car.off ? 2 : car.rolled ? 1 : 0]);
  }
  get duration() {
    let d = 0;
    for (const f of this.tracks) if (f.length) d = Math.max(d, f[f.length - 1][0]);
    return d;
  }

  // 고스트 저장용 직렬화 (프레임을 4프레임마다 솎아 용량 절감)
  serializeTrack(trackIdx = 0, stride = 4) {
    const F = this.tracks[trackIdx];
    const out = [];
    for (let i = 0; i < F.length; i += stride) {
      out.push(F[i].map((x) => Math.round(x * 1e4) / 1e4));
    }
    if (F.length && (F.length - 1) % stride !== 0) out.push(F[F.length - 1]);
    return out;
  }
  static fromFrames(frames) {
    const r = new Recorder(1);
    r.tracks[0] = frames;
    return r;
  }

  // 하이라이트 자동 추출 (기준 차량 = trackIdx)
  // overtakeUntil: 이 시각 이후(=선두가 이미 피니시한 뒤 런아웃)의 순위 변동은 무시
  analyze(finishTime, trackIdx = 0, overtakeUntil = Infinity) {
    const F = this.tracks[trackIdx];
    if (!F.length) return [];
    const hl = [{ t: 0, label: '🚦 출발', slow: false }];

    // 최고 속도
    let topI = 0;
    for (let i = 1; i < F.length; i++) if (F[i][2] > F[topI][2]) topI = i;
    hl.push({ t: F[topI][0], label: `💨 최고속도 ${(F[topI][2] * 3.6).toFixed(1)}km/h`, slow: true });

    // 점프 (비행 구간들)
    let airStart = -1;
    for (let i = 0; i < F.length; i++) {
      if (F[i][5] && airStart < 0) airStart = i;
      if (!F[i][5] && airStart >= 0) {
        const dist = F[i][1] - F[airStart][1];
        if (dist > 0.15) {
          hl.push({ t: F[airStart][0], label: `🛫 점프 ${dist.toFixed(2)}m 비행`, slow: true });
        }
        airStart = -1;
      }
    }

    // 코너 최대 공방 (스크럽 피크, 국소 최대 상위 2개)
    const peaks = [];
    for (let i = 2; i < F.length - 2; i++) {
      const sc = F[i][4];
      if (sc > 1.2 && sc >= F[i - 1][4] && sc >= F[i + 1][4]) peaks.push(i);
    }
    peaks.sort((a, b) => F[b][4] - F[a][4]);
    const used = [];
    for (const p of peaks) {
      if (used.some((u) => Math.abs(F[u][0] - F[p][0]) < 1.2)) continue;
      used.push(p);
      if (used.length >= 2) break;
    }
    used.sort((a, b) => a - b);
    used.forEach((p, k) => hl.push({ t: F[p][0], label: `🔥 코너 공방 ${k + 1}`, slow: true }));

    // 2대 이상: 순위 역전 순간 — 레인 길이가 다르므로 진행률(s/finishS)로 비교
    if (this.tracks.length > 1) {
      const G = this.tracks[1];
      const n = Math.min(F.length, G.length);
      const fA = this.meta[trackIdx]?.finishS || 1;
      const fB = this.meta[1]?.finishS || 1;
      let prevLead = null;
      for (let i = 0; i < n; i++) {
        if (F[i][0] > overtakeUntil) break;
        const gap = F[i][1] / fA - G[i][1] / fB;
        if (Math.abs(gap) < 0.002) continue;
        const lead = gap > 0 ? 0 : 1;
        if (prevLead !== null && lead !== prevLead) {
          const last = hl.find((h) => h.overtake && Math.abs(h.t - F[i][0]) < 1.0);
          if (!last) {
            hl.push({
              t: F[i][0], overtake: true, slow: true,
              label: lead === 0 ? '⚡ 역전 (내 차)' : '⚡ 역전 (상대)',
            });
          }
        }
        prevLead = lead;
      }
    }

    // 사고 순간 (전복·코스 이탈)
    for (let i = 1; i < F.length; i++) {
      if ((F[i - 1][12] ?? 0) === 0 && (F[i][12] ?? 0) > 0) {
        hl.push({
          t: Math.max(0, F[i][0] - 0.5), slow: true, incident: true,
          label: (F[i][12] === 2) ? '🚀 코스 이탈' : '💥 전복 순간',
        });
        break;
      }
    }

    if (finishTime != null) hl.push({ t: finishTime, label: '🏁 피니시', slow: true });
    hl.sort((a, b) => a.t - b.t);
    return hl;
  }
}

export class Player {
  constructor(recorder) {
    this.rec = recorder;
    this.t = 0;
    this.speed = 1;
    this.playing = true;
  }
  seek(t) { this.t = Math.max(0, Math.min(this.rec.duration, t)); }
  tick(dt) {
    if (this.playing) {
      this.t += dt * this.speed;
      if (this.t >= this.rec.duration) { this.t = this.rec.duration; this.playing = false; }
    }
    return this.sample(this.t);
  }
  // t → 보간된 차량 상태 (기본: 0번 차량)
  sample(t, trackIdx = 0) {
    const F = this.rec.tracks[trackIdx];
    if (!F || !F.length) return null;
    if (t <= F[0][0]) return this._mk(F[0], F[0], 0);
    if (t >= F[F.length - 1][0]) { const f = F[F.length - 1]; return this._mk(f, f, 0); }
    let i = Math.min(F.length - 2, Math.max(0, Math.floor(t * REC_HZ)));
    while (i > 0 && F[i][0] > t) i--;
    while (i < F.length - 2 && F[i + 1][0] < t) i++;
    const a = F[i], b = F[i + 1];
    const f = (t - a[0]) / Math.max(1e-9, b[0] - a[0]);
    return this._mk(a, b, f);
  }
  sampleAll(t) {
    return this.rec.tracks.map((_, i) => this.sample(t, i));
  }
  _mk(a, b, f) {
    const lerp = (x, y) => x + (y - x) * f;
    return {
      s: lerp(a[1], b[1]), v: lerp(a[2], b[2]), alt: lerp(a[3], b[3]),
      scrub: lerp(a[4], b[4]), airborne: a[5] > 0 || b[5] > 0,
      vy: lerp(a[7] ?? 0, b[7] ?? 0),
      lat: lerp(a[8] ?? 0, b[8] ?? 0), latV: lerp(a[9] ?? 0, b[9] ?? 0),
      wallContact: lerp(a[10] ?? 0, b[10] ?? 0),
      roll: lerp(a[11] ?? 0, b[11] ?? 0),
      rolled: (a[12] ?? 0) >= 1, off: (a[12] ?? 0) >= 2,
      impact: Math.max(a[6] ?? 0, b[6] ?? 0),
    };
  }
}
