import { mulberry32 } from './rng.js';

export const G = 9.81;
const RHO = 1.225; // 공기 밀도 kg/m³

// 휠/액슬 등급 — Crr(구름저항계수), bearing(질량 무관 상수 마찰력 N)
export const WHEEL_TYPES = {
  stock: { label: '순정',        crr: 0.018, bearing: 0.0035 },
  fte:   { label: 'FTE 휠',      crr: 0.011, bearing: 0.0022 },
  race:  { label: '폴리싱+윤활', crr: 0.007, bearing: 0.0012 },
};

// 차체 형상 — CdA(항력면적 m²), stability(코너 스크럽 배율: 낮을수록 안정)
export const BODY_TYPES = {
  streamline: { label: '스트림라인', cda: 0.00046, stability: 1.05 },
  standard:   { label: '스탠다드',   cda: 0.00062, stability: 1.0 },
  wide:       { label: '와이드+윙',  cda: 0.00078, stability: 0.82 },
};

// 무게 배분 — 코너 안정성 (중앙·낮게가 최적: 실제 다이캐스트 튜닝 정설)
export const WEIGHT_DIST = {
  front:  { label: '앞쏠림', scrub: 1.18 },
  center: { label: '중앙',   scrub: 0.88 },
  rear:   { label: '뒤쏠림', scrub: 1.06 },
};

// 날씨 — 물리 계수 (시각효과가 아니라 실제 동역학에 반영)
export const WEATHERS = {
  clear: { label: '맑음', crrMul: 1.0, bearingMul: 1.0, wallMu: 0.20, muLat: 0.55, dragMul: 1.0,  jitter: 0.03 },
  rain:  { label: '비',   crrMul: 1.6, bearingMul: 1.0, wallMu: 0.15, muLat: 0.32, dragMul: 1.05, jitter: 0.12 },
  snow:  { label: '눈',   crrMul: 2.6, bearingMul: 1.1, wallMu: 0.22, muLat: 0.25, dragMul: 1.08, jitter: 0.25 },
};

export const PHYS_DT = 1 / 240; // 고정 스텝 (결정론)

// 1차원 트랙 구속 종방향 동역학 + 크레스트 탄도 비행.
// 실제 다이캐스트 트랙은 측벽이 차를 가두므로 이 모델이 물리적으로 옳다.
export class CarSim {
  constructor(track, cfg) {
    this.track = track;
    this.cfg = cfg;
    this.wheel = WHEEL_TYPES[cfg.wheel];
    this.body = BODY_TYPES[cfg.body];
    this.dist = WEIGHT_DIST[cfg.dist];
    this.weather = WEATHERS[cfg.weather];
    this.mass = cfg.massG / 1000;
    // 휠 회전 관성 → 유효질량 (작지만 실존하는 항)
    this.massEff = this.mass + 0.0024;
    // 차폭 절반 (와이드 바디는 더 넓음) → 벽까지 남는 횡방향 여유 결정
    this.halfCarW = cfg.body === 'wide' ? 0.017 : 0.015;
    this.latLimit = track.lateralLimit
      ? track.lateralLimit(cfg.lane, this.halfCarW)
      : { min: -0.0055, max: 0.0055 };
    this.reset();
  }

  reset() {
    this.s = 0.12;        // 게이트 뒤 출발 위치
    this.v = 0;
    this.alt = 0;         // 트랙면 위 높이 (비행 중 > 0)
    this.vy = 0;          // 비행 중 수직 속도
    this.airborne = false;
    this.airStartS = 0;
    this.scrub = 0;       // 이번 스텝 벽 스크럽 감속량 (하이라이트/사운드용)
    // 횡방향 상태 — 핸들이 없으므로 코너에서 원심력에 밀려 벽 쪽으로 이동한다
    // 로드 코스에서는 출발 위치(도로를 가로지르는 좌우 위치)가 곧 초기 lat이 된다.
    this.lat = this.cfg.startLat || 0;   // 기준선 대비 횡 오프셋 (m, +는 진행방향 오른쪽)
    this.latV = 0;        // 횡 속도 (m/s)
    this.wallContact = 0; // 이번 스텝 벽 접촉 세기 (0이면 비접촉)
    this.wallHit = 0;     // 이번 스텝 벽에 새로 부딪힌 충격 (사운드용)
    this.latDemand = 0;   // 타이어 그립을 넘어 벽·옆차로 전달되는 횡력 (per-mass)
    this.latOutward = 1;  // 원심력이 미는 방향 (+1 = 오른쪽)
    this.rubScrub = 0;    // 옆차와 비비며 생기는 추가 감속 (외부에서 주입)
    this.finished = false;
    this.stopped = false;
    this.hint = { idx: 0 };
    this.rng = mulberry32(this.cfg.seed >>> 0);
    this.landedImpact = 0;
  }

  step(dt) {
    const t = this.track, lane = this.cfg.lane;
    this.landedImpact = 0;
    const smp = t.laneSample(lane, this.s, this.hint);
    const dyds = smp.dyds;
    const cos = Math.sqrt(Math.max(0.05, 1 - dyds * dyds));

    if (!this.airborne) {
      // 수직하중: 밸리(kv>0)에서 압축↑, 크레스트(kv<0)에서 ↓
      const nFactor = 1 + (this.v * this.v * smp.kv) / (G * cos);
      if (smp.kv < -1e-4 && nFactor <= 0.02 && this.v > 0.3) {
        // 접지력 상실 → 탄도 비행 개시
        this.airborne = true;
        this.airStartS = this.s;
        this.vy = this.v * dyds;
        this.vh = this.v * cos;
        this.scrub = 0;
        return;
      }
      const N = G * cos * Math.max(0.05, Math.min(2.5, nFactor)); // per-mass 수직하중

      let a = -G * dyds; // 중력 사면 성분
      // 저항 (v>0일 때만)
      let res = 0;
      if (this.v > 1e-4) {
        res += this.wheel.crr * this.weather.crrMul * N;                     // 구름저항
        res += (this.wheel.bearing * this.weather.bearingMul) / this.mass;   // 베어링(질량 무관 힘)
        res += (0.5 * RHO * this.body.cda * this.weather.dragMul * this.v * this.v) / this.mass; // 항력
        res += this._lateral(smp, N, dt);                                    // 벽 스크럽 (횡방향 동역학)
      } else {
        this.scrub = 0; this.wallContact = 0; this.wallHit = 0;
        this.latV *= Math.exp(-6 * dt);
      }

      // 노면 요철/돌풍 노이즈 (시드 결정론)
      const jit = (this.rng() - 0.5) * 2 * this.weather.jitter;

      this.v += (a - res + (this.v > 0.05 ? jit : 0)) * (this.mass / this.massEff) * dt;
      if (this.v < 0) this.v = 0;
      // 코너 안쪽 라인은 짧고 바깥 라인은 길다. 차가 실제로 그린 라인만큼만 기준선 진도가
      // 나가도록 보정한다 (kh>0이면 곡률 중심이 오른쪽 → +lat이 안쪽 = 짧은 경로).
      this.s += this.v * dt * (1 - this.lat * smp.kh);
      this.alt = 0;
    } else {
      // 탄도 비행: 중력 + 공기저항만 (구름저항 없음 → 점프가 빠른 이유)
      const dragA = (0.5 * RHO * this.body.cda * this.weather.dragMul * this.vh * this.vh) / this.mass;
      this.vh = Math.max(0.1, this.vh - dragA * dt);
      this.vy -= G * dt;
      // 수평 속도 유지한 채 트랙 호 길이 기준으로 전진
      const dsArc = (this.vh / cos) * dt * (1 - this.lat * smp.kh);
      this.s += dsArc;
      const smp2 = t.laneSample(lane, this.s, this.hint);
      // 상대 고도 = (월드 수직 이동) − (트랙면 수직 변화)
      this.alt += this.vy * dt - smp2.dyds * dsArc;
      // 공중에서는 횡방향으로도 관성대로 계속 날아간다 (그립 없음)
      this.lat = Math.max(this.latLimit.min, Math.min(this.latLimit.max, this.lat + this.latV * dt));
      this.scrub = 0; this.wallContact = 0; this.wallHit = 0;
      if (this.alt <= 0 && this.vy < 0) {
        // 착지: 수직 충격에 비례한 손실 + 전진속도 재구성
        const cos2 = Math.sqrt(Math.max(0.05, 1 - smp2.dyds * smp2.dyds));
        const vNew = this.vh / cos2;
        const trackVy = vNew * smp2.dyds;
        const impact = Math.abs(this.vy - trackVy);
        this.landedImpact = impact;
        this.v = Math.max(0.2, vNew * Math.max(0.78, 1 - 0.045 * impact));
        this.alt = 0; this.vy = 0;
        this.airborne = false;
      }
    }
  }

  // 횡방향 동역학 — 조향이 없는 다이캐스트 카의 실제 거동.
  // 코너에서 원심력이 타이어 횡그립을 넘으면 차는 바깥으로 미끄러져 벽(또는 레인 디바이더)에
  // 붙고, 그때부터 벽이 부족한 구심력을 대신 받쳐준다. 그 수직항력에 비례한 마찰이
  // 종방향 감속(스크럽)이 된다 → 벽에 닿아 있을 때만 스크럽이 발생한다.
  // 반환값: 종방향 감속량 (per-mass, m/s²)
  _lateral(smp, N, dt) {
    const v2k = this.v * this.v * smp.kh;      // 곡률에 필요한 구심 가속
    const outward = -Math.sign(smp.kh || 1);   // 원심력이 미는 방향 (+1 = 오른쪽)
    const need = Math.abs(v2k);
    const grip = this.weather.muLat * N;
    const lim = this.latLimit;

    // 타이어가 감당하고 남는 몫만큼 차체가 바깥으로 밀려난다
    this.latDemand = Math.max(0, need - grip);   // 벽·옆차로 전달되는 초과 횡력 (per-mass)
    this.latOutward = outward;
    const slipA = this.latDemand * outward;
    this.latV += slipA * dt;
    // 그립 범위 안이면 횡속도는 마찰로 잦아든다
    if (need <= grip) this.latV *= Math.exp(-8 * dt);
    this.lat += this.latV * dt;

    this.wallHit = 0;
    let wallN = 0;
    if (this.lat >= lim.max || this.lat <= lim.min) {
      const atMax = this.lat >= lim.max;
      this.lat = atMax ? lim.max : lim.min;
      // 벽에 부딪히는 순간의 충격 (사운드/연출용)
      if ((atMax && this.latV > 0) || (!atMax && this.latV < 0)) {
        this.wallHit = Math.abs(this.latV);
        this.latV = -this.latV * 0.18;         // 약한 반발 (플라스틱/금속 접촉)
      }
      // 벽이 받쳐주는 수직항력 = 타이어가 못 낸 구심력 (바깥으로 밀 때만)
      const pushingIntoWall = (atMax && outward > 0) || (!atMax && outward < 0);
      if (pushingIntoWall) wallN = Math.max(0, need - grip);
    }

    this.wallContact = wallN;
    // 벽 마찰 + 옆차와 비비는 마찰 (후자는 접촉 해석에서 주입된다)
    this.scrub = (wallN > 0
      ? this.weather.wallMu * wallN * this.body.stability * this.dist.scrub
      : 0) + this.rubScrub;
    this.rubScrub = 0;
    return this.scrub;
  }

  get airDistance() { return this.airborne ? this.s - this.airStartS : 0; }
}
