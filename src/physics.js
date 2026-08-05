import { mulberry32 } from './rng.js';

export const G = 9.81;
const RHO = 1.225; // 공기 밀도 kg/m³

// 휠/액슬 등급 — Crr(구름저항계수), bearing(질량 무관 상수 마찰력 N)
// muLatMul: 횡그립 배율. 구름저항이 낮은 휠은 트레드가 단단하고 매끄러운 컴파운드라
//           옆으로도 잘 미끄러진다. 빠른 대신 코너에서 더 밀려 벽을 세게 긁고 전복
//           위험이 커진다 — 공짜 업그레이드가 아니라 트레이드오프다.
export const WHEEL_TYPES = {
  stock: { label: '순정',        crr: 0.018, bearing: 0.0035, muLatMul: 1.00 },
  fte:   { label: 'FTE 휠',      crr: 0.011, bearing: 0.0022, muLatMul: 0.84 },
  race:  { label: '폴리싱+윤활', crr: 0.007, bearing: 0.0012, muLatMul: 0.70 },
};

// 액슬 굽힘 한계 — 다이캐스트 액슬은 지름 1mm 남짓의 강선이다. 무게를 계속 실으면
// 액슬이 휘어 휠이 차체에 쓸리기 시작한다. 이 지점을 넘어서면 무게를 더해도 오히려 느려진다.
export const AXLE_LOAD_G = 78;   // 이 무게(g)를 넘으면 굽힘이 시작된다
export const AXLE_BIND = 0.55;   // 최대 하중에서의 구름저항 증가율

// 차체 형상 — CdA(항력면적 m²), bottoming(착지 시 바닥이 닿아 잃는 속도 배율)
// 폭의 이점은 윤거(전복 저항)로 이미 반영되므로 벽 마찰에 별도 보정을 주지 않는다.
// (넓다고 벽 마찰계수가 낮아지지는 않는다 — 이중 계산이었다)
// 대신 넓은 차는 벽까지 여유가 줄어 더 자주·더 오래 긁고, 낮고 좁은 차는 여유가 크지만
// 바닥이 낮아 착지에서 하부를 찧는다.
// halfW: 차폭 절반. 넓을수록 윤거가 넓어 전복에 강하지만 벽까지 여유가 줄고 항력이 커진다.
export const BODY_TYPES = {
  streamline: { label: '스트림라인', cda: 0.00046, bottoming: 1.85, halfW: 0.0135 },
  standard:   { label: '스탠다드',   cda: 0.00062, bottoming: 1.0,  halfW: 0.0150 },
  wide:       { label: '와이드+윙',  cda: 0.00078, bottoming: 0.80, halfW: 0.0170 },
};

// 무게 배분 — 핀우드 더비에서 가장 유명한 튜닝 포인트.
// cgLong: 무게중심의 앞뒤 위치(m, +가 앞). 중력 가속은 무게중심이 있는 지점의 경사로
//   결정되므로, 무게중심이 뒤에 있으면 출발 램프에서 더 높은 곳에 있다가 더 오래 떨어진다
//   = 낙차(위치에너지)를 더 쓴다 → 빠르다. 실제 더비 정설과 같다.
// 대신 뒤가 무거우면 미끄러질 때 뒷부분이 크게 흘러(오버스티어) 벽을 비스듬히 때린다
//   → 트립 전복 위험이 크게 오른다. 빠르지만 위험한 세팅.
// scrub: 벽 마찰 손실 배율 / yawGain: 미끄러질 때 차체가 돌아가는 정도.
// landing: 착지 손실 배율. 이 코스의 착지 구간은 급한 내리막이라 기수가 내려간 자세가
//   지면과 맞아떨어진다. 앞쏠림은 노즈다운으로 날아 착지가 깔끔하고, 뒤쏠림은 꼬리부터
//   떨어져 크게 잃는다. (반대로 뒤쏠림은 출발 램프에서 무게중심이 높아 초반이 빠르다)
export const WEIGHT_DIST = {
  front:  { label: '앞쏠림', yawGain: 0.92, cgLong:  0.018, landing: 0.78 },
  center: { label: '중앙',   yawGain: 0.86, cgLong:  0,     landing: 1.00 },
  rear:   { label: '뒤쏠림', yawGain: 1.26, cgLong: -0.018, landing: 1.34 },
};

// 날씨 — 물리 계수 (시각효과가 아니라 실제 동역학에 반영)
export const WEATHERS = {
  clear: { label: '맑음', crrMul: 1.0, bearingMul: 1.0, wallMu: 0.20, muLat: 0.55, dragMul: 1.0,  jitter: 0.03 },
  rain:  { label: '비',   crrMul: 1.6, bearingMul: 1.0, wallMu: 0.15, muLat: 0.32, dragMul: 1.05, jitter: 0.12 },
  snow:  { label: '눈',   crrMul: 2.6, bearingMul: 1.1, wallMu: 0.22, muLat: 0.25, dragMul: 1.08, jitter: 0.25 },
};

export const PHYS_DT = 1 / 240; // 고정 스텝 (결정론)

// 롤 축 회전반경² — 68×30×15mm 차체의 k² ≈ (w²+h²)/12
const KK2 = 9.4e-5;
// 벽에 모서리가 걸릴 때 횡방향 운동량 중 실제로 "넘기는 힘"으로 바뀌는 비율.
// 벽면은 무게중심 높이를 밀어 지렛대가 없지만, 요각이 붙으면 앞 모서리와 바퀴가
// 바닥 높이에서 걸리며 트립이 된다.
const TRIP_EFF = 1.15;

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
    // 차폭 절반 → 벽까지 남는 횡방향 여유와 윤거(전복 저항)를 함께 결정한다
    this.halfCarW = this.body.halfW;
    this.latLimit = track.lateralLimit
      ? track.lateralLimit(cfg.lane, this.halfCarW)
      : { min: -0.0055, max: 0.0055 };

    // 전복 판정용 제원 — 무게중심 높이 hCG와 윤거 절반 tHalf.
    // 정적 전복 한계 SSF = tHalf / hCG (횡가속 몇 g까지 버티는지). 실제 차와 같은 지표다.
    this.tHalf = this.halfCarW - 0.0012;
    this.hCG = cfg.body === 'wide' ? 0.0068
      : cfg.body === 'streamline' ? 0.0072 : 0.0082;
    // 웨이트를 가운데 낮게 깔면 무게중심이 조금 더 내려간다 (앞뒤 쏠림은 높이보다
    // 요 안정성에 작용하므로 dist의 높이 효과는 작게 잡는다)
    this.hCG *= cfg.dist === 'center' ? 0.93 : 1.0;
    // 웨이트를 많이 실을수록 바닥 쪽 질량 비중이 커져 무게중심이 더 내려간다
    this.hCG *= 1 - Math.min(0.22, Math.max(0, (cfg.massG - 30) / 90) * 0.22);
    this.ssf = this.tHalf / this.hCG;
    this.cgLong = this.dist.cgLong;
    // 횡그립 — 잘 구르는 휠일수록 옆으로도 잘 미끄러진다
    this.muLat = this.weather.muLat * this.wheel.muLatMul;
    // 액슬 굽힘 — 한계 하중을 넘으면 휠이 쓸리며 구름저항이 늘어난다
    const over = Math.max(0, cfg.massG - AXLE_LOAD_G) / (120 - AXLE_LOAD_G);
    this.crrEff = this.wheel.crr * (1 + over * AXLE_BIND);
    // 노면 크라운 계수 — h(lat) = −crown·lat². 도로 폭 끝에서 약 2mm 낮아지는 배수 구배.
    // 칸막이가 없는 로드 코스에만 존재한다 (플라스틱 트랙은 평평하다).
    this.crown = track.style === 'road' ? 0.32 : 0;
    // 뱅크는 로드 코스에만 (플라스틱 4레인 트랙은 평평하다)
    this.bankOn = track.style === 'road';
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
    // 전복/이탈 상태
    this.roll = 0;        // 차체 기울기 (rad, + = 오른쪽으로 넘어감)
    this.rollV = 0;
    this.rolled = false;  // 옆으로 넘어져 미끄러지는 중
    this.off = false;     // 벽을 넘어 코스 이탈
    this.offVy = 0;
    this.incident = null; // 'rollover' | 'vault' | 'crash-landing' | 'launched'
    this.finished = false;
    this.stopped = false;
    this.hint = { idx: 0 };
    this.hintCG = { idx: 0 };
    this.rng = mulberry32(this.cfg.seed >>> 0);
    this.landedImpact = 0;
    // 휠 얼라인먼트 편향 — 액슬이 완벽히 직각인 다이캐스트는 없다. 개체마다 한쪽으로
    // 미세하게 쏠리며, 이것이 직선에서 차가 벽에 붙거나 떨어지는 실제 이유다.
    // 폴리싱·윤활을 한 액슬일수록 정렬이 잘 맞는다.
    const align = this.wheel.crr > 0.015 ? 0.70 : this.wheel.crr > 0.009 ? 0.52 : 0.36;
    this.alignBias = (this.rng() - 0.5) * 2 * align;

    // 출발 편차 — 차를 손으로 슬롯에 놓는 순간부터 완벽히 같을 수 없다.
    // 게이트 바가 쓸고 지나가며 주는 미세한 옆 힘까지 더해져, 매번 조금씩 다른 위치·자세로
    // 출발한다. 실제 대회에서 같은 차를 같은 레인에 놓아도 기록이 흔들리는 첫 번째 이유다.
    const room = (this.latLimit.max - this.latLimit.min) * 0.5;
    const place = Math.min(0.004, room * 0.45);
    this.lat += (this.rng() - 0.5) * 2 * place;
    this.latV = (this.rng() - 0.5) * 2 * 0.03;

    // 휠 불균형 — 다이캐스트 휠은 완벽한 원판이 아니다. 회전하며 수직하중을 주기적으로
    // 흔들어 그립을 변조한다. 매 주행마다 휠이 멈춰 있던 위상이 달라 같은 코너에서도
    // 미끄러지기 시작하는 순간이 달라진다.
    this.imbAmp = 0.02 + this.rng() * 0.05;
    this.imbPhase = this.rng() * Math.PI * 2;
  }

  // 사고 발생 — 한 번만 기록한다
  _trigger(kind) {
    if (this.incident) return;
    this.incident = kind;
  }

  step(dt) {
    const t = this.track, lane = this.cfg.lane;
    this.landedImpact = 0;
    const smp = t.laneSample(lane, this.s, this.hint);
    // 중력은 무게중심이 놓인 지점의 경사로 결정된다. 무게중심이 뒤에 있으면 출발 램프에서
    // 더 높은 곳에 머물다 더 오래 떨어지므로 총 낙차를 더 쓴다 (핀우드 더비의 정설).
    const smpCG = this.cgLong
      ? t.laneSample(lane, Math.max(0, this.s + this.cgLong), this.hintCG)
      : smp;
    const dyds = smp.dyds;
    const cos = Math.sqrt(Math.max(0.05, 1 - dyds * dyds));

    // 코스 이탈: 벽을 넘어간 뒤엔 트랙 구속이 사라지고 그대로 떨어진다
    if (this.off) {
      this.offVy -= G * dt;
      this.alt += this.offVy * dt;
      this.lat += this.latV * dt;
      this.s += this.v * dt * 0.35;
      this.v = Math.max(0, this.v - 2.2 * dt);
      this.roll += this.rollV * dt;
      this.scrub = 0; this.wallContact = 0; this.wallHit = 0;
      return;
    }

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
      let N = G * cos * Math.max(0.05, Math.min(2.5, nFactor)); // per-mass 수직하중
      // 휠 회전에 동기된 하중 변동 (불균형에 의한 홉)
      if (this.v > 0.5) {
        const wheelAng = this.s / 0.0045;              // 휠 반지름으로 나눈 누적 회전각
        N *= 1 + this.imbAmp * Math.sin(wheelAng + this.imbPhase);
      }

      let a = -G * smpCG.dyds; // 중력 사면 성분 (무게중심 위치 기준)
      // 저항 (v>0일 때만)
      let res = 0;
      if (this.v > 1e-4) {
        // 넘어진 차는 바퀴가 아니라 차체로 미끄러진다 → 구름저항이 폭발적으로 커진다
        const crr = this.rolled ? 0.42 : this.crrEff;
        res += crr * this.weather.crrMul * N;                                // 구름저항
        if (!this.rolled) res += (this.wheel.bearing * this.weather.bearingMul) / this.mass;
        res += (0.5 * RHO * this.body.cda * this.weather.dragMul * this.v * this.v) / this.mass; // 항력
        res += this._lateral(smp, N, dt);                                    // 벽 스크럽 (횡방향 동역학)
        this._rollDynamics(smp, N, cos, dt);                                 // 전복 판정
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
      // 뜨는 순간의 기울기는 공중에서 그대로 유지된다 (되돌릴 접지력이 없다)
      this.roll += this.rollV * dt;
      this.scrub = 0; this.wallContact = 0; this.wallHit = 0;
      if (this.alt <= 0 && this.vy < 0) {
        // 착지: 수직 충격에 비례한 손실 + 전진속도 재구성
        const cos2 = Math.sqrt(Math.max(0.05, 1 - smp2.dyds * smp2.dyds));
        const vNew = this.vh / cos2;
        const trackVy = vNew * smp2.dyds;
        const impact = Math.abs(this.vy - trackVy);
        this.landedImpact = impact;
        // 무거운 차는 착지 에너지가 크고, 낮은 차는 하부를 찧어 더 잃는다
        const lossK = 0.040 * this.body.bottoming * this.dist.landing
          * (1 + Math.max(0, this.cfg.massG - 55) / 120);
        this.v = Math.max(0.2, vNew * Math.max(0.62, 1 - lossK * impact));
        this.alt = 0; this.vy = 0;
        this.airborne = false;
        this._checkLanding(impact);
      }
    }
  }

  // 횡방향 동역학 — 조향이 없는 다이캐스트 카의 실제 거동.
  // 코너에서 원심력이 타이어 횡그립을 넘으면 차는 바깥으로 미끄러져 벽(또는 레인 디바이더)에
  // 붙고, 그때부터 벽이 부족한 구심력을 대신 받쳐준다. 그 수직항력에 비례한 마찰이
  // 종방향 감속(스크럽)이 된다 → 벽에 닿아 있을 때만 스크럽이 발생한다.
  // 반환값: 종방향 감속량 (per-mass, m/s²)
  _lateral(smp, N, dt) {
    // 뱅크(캔트)가 있는 노면 위의 힘 평형.
    //   필요 구심가속 a_c = v²·κ
    //   경사면 기준 타이어가 실제로 내야 하는 횡력  = a_c·cosφ − g·sinφ
    //   경사면에 수직한 하중                        = g·cosφ + a_c·sinφ
    // 뱅크가 구심력을 대신 받쳐주므로, 설계속도 부근에서는 타이어 부담이 0에 가까워진다.
    // 이때 차는 벽에 눌리지 않고 노면 어디에도 머물 수 있는 *중립* 상태가 되어,
    // 아주 작은 속도차가 위로 흐를지 아래로 흐를지를 가른다 — 발산 지점이다.
    const phi = this.bankOn ? Math.abs(smp.bank) : 0;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const aC = this.v * this.v * Math.abs(smp.kh);
    const outward = -Math.sign(smp.kh || 1);   // 원심력이 미는 방향 (뱅크의 높은 쪽)

    const needTire = aC * cosP - G * sinP;     // + 바깥(위)으로, − 안쪽(아래)으로
    const Nb = N * cosP + aC * sinP;           // 노면 수직하중
    const grip = this.muLat * Nb;
    const lim = this.latLimit;

    // 타이어가 감당하고 남는 몫만큼 차체가 미끄러진다 (위로든 아래로든)
    this.latDemand = Math.max(0, Math.abs(needTire) - grip);
    const slipDir = (needTire >= 0 ? 1 : -1) * outward;
    this.latOutward = slipDir;
    this.latV += this.latDemand * slipDir * dt;
    // 그립 범위 안이면 횡속도는 마찰로 잦아든다
    if (this.latDemand <= 0) this.latV *= Math.exp(-8 * dt);

    // 노면 크라운 — 실제 도로는 배수를 위해 가운데가 볼록하다. 중앙선 부근은
    // *불안정 평형*이어서, 어느 쪽으로 조금이라도 벗어나면 그쪽으로 계속 흘러내린다.
    if (this.crown > 0) {
      this.latV += G * (2 * this.crown * this.lat) * dt;
    }
    // 얼라인먼트 편향 + 노면 요철에 의한 횡방향 흔들림 (속도가 붙을수록 커진다)
    if (this.v > 0.3) {
      const rough = (this.rng() - 0.5) * 2 * (0.85 + this.weather.jitter * 8);
      this.latV += (this.alignBias * Math.min(1, this.v / 3) + rough) * dt;
    }
    this.lat += this.latV * dt;

    this.wallHit = 0;
    let wallN = 0;
    if (this.lat >= lim.max || this.lat <= lim.min) {
      const atMax = this.lat >= lim.max;
      this.lat = atMax ? lim.max : lim.min;
      if ((atMax && this.latV > 0) || (!atMax && this.latV < 0)) {
        this.wallHit = Math.abs(this.latV);
        this.latV = -this.latV * 0.18;
      }
      const pushingIntoWall = (atMax && slipDir > 0) || (!atMax && slipDir < 0);
      if (pushingIntoWall) wallN = this.latDemand;
    }

    this.wallContact = wallN;
    // 벽 마찰 + 옆차와 비비는 마찰 (후자는 접촉 해석에서 주입된다)
    this.scrub = (wallN > 0
      ? this.weather.wallMu * wallN
      : 0) + this.rubScrub;
    this.rubScrub = 0;
    return this.scrub;
  }

  // 전복 동역학 — 실제 차량과 같은 기준으로 판정한다.
  //
  //  ① 타이어만으로 버틸 때: 횡가속 a_lat 가 정적전복한계(SSF = tHalf/hCG)를 넘으면
  //     안쪽 바퀴가 뜨기 시작한다. 다이캐스트는 그립이 낮아 보통 미끄러짐이 먼저 오지만,
  //     그립이 살아있는 맑은 날 고속 코너에서는 여기까지 간다.
  //  ② 벽에 걸려 넘어지는 "트립 오버": 미끄러지던 차가 벽에 옆구리를 부딪히면 바퀴 아래가
  //     붙잡히고 관성은 계속 나아가 차를 넘긴다. 실제 사고의 대부분이 이쪽이다.
  //     벽 접촉점이 무게중심보다 낮으므로 지렛대가 되어 전복 토크가 커진다.
  //  ③ 넘어진 상태에서 벽에 계속 밀리면 벽을 타고 올라 코스 밖으로 튀어나간다.
  _rollDynamics(smp, N, cos, dt) {
    // ① 순수 코너링 전복: 횡가속이 정적전복한계(SSF·g)를 넘어야 한다. 다이캐스트는
    //    μ_lat(0.25~0.55)이 SSF(≈1.6~3.5)보다 훨씬 작아 항상 미끄러짐이 먼저 온다.
    //    그래서 코너를 돈다고 넘어지는 일은 없다 — 실제와 같다.
    const phi = this.bankOn ? Math.abs(smp.bank) : 0;
    const aTire = Math.min(this.muLat * N, Math.abs(
      this.v * this.v * Math.abs(smp.kh) * Math.cos(phi) - G * Math.sin(phi)));
    const dir = this.latOutward;
    const crit = Math.atan2(this.tHalf, this.hCG);     // 무게중심이 바깥 바퀴를 넘는 각도

    if (!this.rolled) {
      // 차는 바깥 바퀴 접지선을 축으로 하는 역진자다.
      // 넘기려는 모멘트 = 횡가속 × 무게중심 높이, 버티는 모멘트 = 중력 × 윤거 절반.
      // 기울수록 버티는 쪽이 약해지고, 임계각을 넘으면 되돌아오지 못한다.
      const th = Math.min(Math.abs(this.roll), crit);
      const overturn = aTire * this.hCG * Math.cos(th);
      const restore = G * (this.tHalf * Math.cos(th) - this.hCG * Math.sin(th));
      const rs = this.roll === 0 ? dir : Math.sign(this.roll);
      this.rollV += ((overturn * dir) - rs * Math.max(0, restore)) / KK2 * dt;

      // ② 트립 오버 — 옆으로 미끄러지던 차가 벽에 앞 모서리를 걸며 넘어가는, 실제 사고의
      //    대표형. 벽면은 무게중심과 비슷한 높이를 밀어 지렛대가 거의 없지만, 요각이 붙으면
      //    바닥 높이에서 걸리며 횡방향 운동량이 그대로 넘김 각운동량으로 바뀐다.
      //    살짝 스치는 접촉은 트립이 되지 않는다 (벽을 긁으며 도는 정상 주행).
      if (this.wallHit > 0.15) {
        // 요각은 반발 이후가 아니라 부딪히기 직전의 횡속도로 따져야 한다
        // (wallHit 자체가 충돌 직전 |latV| 이다)
        const sinYaw = Math.min(1, this.dist.yawGain * this.wallHit
          / Math.hypot(this.wallHit, Math.max(0.5, this.v)));
        const dvTrip = this.wallHit * sinYaw * TRIP_EFF;
        this.rollV += dir * (dvTrip * this.hCG) / KK2;
      }

      this.roll += this.rollV * dt;

      // 들렸던 바퀴가 다시 바닥을 때리면 그 충격으로 회전 에너지를 잃는다
      if (this.roll * (rs || 1) < 0) { this.roll = 0; this.rollV *= -0.25; }
    } else {
      this.roll += this.rollV * dt;
    }

    if (!this.rolled && Math.abs(this.roll) > crit) {
      this.rolled = true;
      this._trigger(this.wallContact > 0 ? 'rollover' : 'rollover');
      this.v *= 0.72;                                  // 넘어지며 속도를 크게 잃는다
    }
    if (this.rolled) {
      // 넘어진 뒤에는 옆면이 바닥에 닿을 때까지 돌아간다
      const rest = Math.sign(this.roll || 1) * (Math.PI / 2);
      this.roll += (rest - this.roll) * Math.min(1, 6 * dt);
      this.rollV *= Math.exp(-5 * dt);

      // 넘어진 채 벽에 계속 밀리면 벽을 타고 넘어간다 = 코스 이탈
      if (this.wallContact > 0.9 && this.v > 1.6) {
        this.off = true;
        this._trigger('vault');
        this.offVy = 0.35 + Math.min(1.2, this.v * 0.09);
        this.latV = this.latOutward * (0.35 + this.v * 0.07);
        this.rollV = this.latOutward * 5.5;
      }
    }
  }

  // 외부(옆차와의 접촉 등)에서 가해지는 트립 — 벽 트립과 같은 기준으로 처리한다.
  // 실제 레이싱에서 두 차의 바퀴가 맞물리면 한쪽이 그대로 튕겨 날아가는 그 장면이다.
  tripBy(dvLateral, dir, kind = 'launched') {
    if (this.rolled || this.off) return false;
    this.rollV += dir * (dvLateral * this.hCG) / KK2;
    const dh = Math.hypot(this.tHalf, this.hCG) - this.hCG;
    const dvCrit = Math.sqrt(2 * G * dh * KK2) / this.hCG;
    if (dvLateral > dvCrit) {
      this.rolled = true;
      this._trigger(kind);
      this.v *= 0.8;
      return true;
    }
    return false;
  }

  // 착지 실패 — 옆으로 흐르거나 기울어진 자세로 떨어지면 접지 순간 그대로 넘어간다.
  // 트립 오버와 같은 에너지 기준을 쓰되, 수직 충격이 기울기와 곱해져 넘김을 돕는다.
  _checkLanding(impact) {
    if (this.rolled || this.off) return;
    const dh = Math.hypot(this.tHalf, this.hCG) - this.hCG;
    const dvCrit = Math.sqrt(2 * G * dh * KK2) / this.hCG;
    // 착지 순간 횡속도는 접지와 함께 급정지 = 트립. 기울어져 있으면 충격이 한쪽 바퀴에 몰린다.
    // 살짝 기운 채 착지하면 한쪽 바퀴부터 닿고 튕길 뿐이다. 크게 기울어야 넘어간다.
    const tilt = Math.max(0, Math.abs(this.roll) - 0.25);
    const dvEff = Math.abs(this.latV) + impact * Math.min(0.6, tilt) * 1.6;
    if (dvEff > dvCrit) {
      this.rolled = true;
      this._trigger('crash-landing');
      this.rollV = Math.sign(this.latV || this.latOutward) * 4.5;
      this.v *= 0.62;
    }
  }

  get airDistance() { return this.airborne ? this.s - this.airStartS : 0; }
}
