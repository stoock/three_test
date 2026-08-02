// 물리 프레임 기록 → 보간 재생 + 하이라이트 자동 추출
export const REC_HZ = 120;

export class Recorder {
  constructor() { this.frames = []; }
  clear() { this.frames = []; }
  // 프레임: [t, s, v, alt, scrub, airborne(0/1), impact, vy(월드 수직속도)]
  push(t, car) {
    this.frames.push([t, car.s, car.v, car.alt, car.scrub, car.airborne ? 1 : 0,
      car.landedImpact, car.airborne ? car.vy : 0]);
  }
  get duration() { return this.frames.length ? this.frames[this.frames.length - 1][0] : 0; }

  // 하이라이트 자동 추출
  analyze(finishTime) {
    const F = this.frames;
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

    // 코너 최대 공방 (스크럽 피크, 1초 윈도우 국소 최대 상위 2개)
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
  // t → 보간된 차량 상태
  sample(t) {
    const F = this.rec.frames;
    if (!F.length) return null;
    if (t <= F[0][0]) return this._mk(F[0], F[0], 0);
    if (t >= F[F.length - 1][0]) { const f = F[F.length - 1]; return this._mk(f, f, 0); }
    // 균일 간격이므로 인덱스 직산
    let i = Math.min(F.length - 2, Math.max(0, Math.floor(t * REC_HZ)));
    while (i > 0 && F[i][0] > t) i--;
    while (i < F.length - 2 && F[i + 1][0] < t) i++;
    const a = F[i], b = F[i + 1];
    const f = (t - a[0]) / Math.max(1e-9, b[0] - a[0]);
    return this._mk(a, b, f);
  }
  _mk(a, b, f) {
    const lerp = (x, y) => x + (y - x) * f;
    return {
      s: lerp(a[1], b[1]), v: lerp(a[2], b[2]), alt: lerp(a[3], b[3]),
      scrub: lerp(a[4], b[4]), airborne: a[5] > 0 || b[5] > 0,
      vy: lerp(a[7] ?? 0, b[7] ?? 0),
    };
  }
}
