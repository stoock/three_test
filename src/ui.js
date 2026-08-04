import { CAR_COLORS } from './carmodel.js';
import { LANE_COUNT } from './track.js';

const $ = (id) => document.getElementById(id);

// 세그먼트 버튼 그룹 바인딩
function bindSeg(el, onChange) {
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    el.querySelectorAll('button').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    onChange(btn.dataset.v);
  });
}

export class UI {
  constructor(track, callbacks) {
    this.cb = callbacks;
    this.els = {
      setup: $('setupPanel'), hud: $('hud'), hudGapStat: $('hudGapStat'),
      progressWrap: $('progressWrap'),
      progressBar: $('progressBar'), camBar: $('camBar'), countdown: $('countdown'),
      toast: $('toast'), results: $('resultsPanel'), replayBar: $('replayBar'),
      loading: $('loading'),
    };

    // 레인 버튼 (클래식은 레인별 실측 길이, 로드는 도로상의 출발 위치)
    this.track = track;
    const laneSeg = $('laneSeg');
    for (let i = 0; i < LANE_COUNT; i++) {
      const b = document.createElement('button');
      b.dataset.v = String(i);
      if (i === 1) b.classList.add('on');
      laneSeg.appendChild(b);
    }
    this.setLaneMode('classic');

    // 색상 스와치
    const colorSeg = $('colorSeg');
    CAR_COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.style.background = '#' + c.toString(16).padStart(6, '0');
      b.dataset.c = String(c);
      if (i === 0) b.classList.add('on');
      b.addEventListener('click', () => {
        colorSeg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        callbacks.onConfig('color', c);
      });
      colorSeg.appendChild(b);
    });

    bindSeg($('weatherSeg'), (v) => callbacks.onConfig('weather', v));
    bindSeg($('styleSeg'), (v) => callbacks.onConfig('style', v));
    bindSeg($('modeSeg'), (v) => callbacks.onConfig('mode', v));
    bindSeg($('ghostSeg'), (v) => callbacks.onConfig('ghost', v));
    bindSeg($('rivalPresetSeg'), (v) => callbacks.onConfig('rivalPreset', v));
    bindSeg(laneSeg, (v) => callbacks.onConfig('lane', parseInt(v, 10)));
    bindSeg($('wheelSeg'), (v) => callbacks.onConfig('wheel', v));
    bindSeg($('distSeg'), (v) => callbacks.onConfig('dist', v));
    bindSeg($('bodySeg'), (v) => callbacks.onConfig('body', v));
    bindSeg($('liverySeg'), (v) => callbacks.onConfig('livery', v));

    const ws = $('weightSlider');
    ws.addEventListener('input', () => {
      $('weightVal').textContent = ws.value + ' g';
      callbacks.onConfig('massG', parseInt(ws.value, 10));
    });

    $('startBtn').addEventListener('click', () => callbacks.onStart());
    $('replayBtn').addEventListener('click', () => callbacks.onEnterReplay());
    $('backToSetupBtn').addEventListener('click', () => callbacks.onBackToSetup());
    $('exitReplayBtn').addEventListener('click', () => callbacks.onExitReplay());
    $('rankBtn').addEventListener('click', () => callbacks.onShowRankings());
    $('resRankBtn').addEventListener('click', () => callbacks.onShowRankings());
    $('rankCloseBtn').addEventListener('click', () => $('rankPanel').classList.add('hidden'));
    $('rankClearBtn').addEventListener('click', () => callbacks.onClearRankings());

    // 카메라 버튼 (사운드 토글은 별도 처리)
    $('camBar').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn || btn.id === 'soundBtn' || !btn.dataset.v) return;
      $('camBar').querySelectorAll('button[data-v]').forEach((b) => b.classList.remove('on'));
      btn.classList.add('on');
      callbacks.onCamera(btn.dataset.v);
    });
    $('soundBtn').addEventListener('click', () => callbacks.onToggleSound());
    document.addEventListener('keydown', (e) => {
      const map = { 1: 'broadcast', 2: 'chase', 3: 'onboard', 4: 'free' };
      if (map[e.key]) {
        callbacks.onCamera(map[e.key]);
        this.setCamButton(map[e.key]);
      }
      if (e.key === ' ' && !this.els.replayBar.classList.contains('hidden')) {
        e.preventDefault();
        callbacks.onPlayPause();
      }
    });

    // 리플레이 컨트롤
    $('playPauseBtn').addEventListener('click', () => callbacks.onPlayPause());
    bindSeg($('speedSeg'), (v) => callbacks.onReplaySpeed(parseFloat(v)));
    const tl = $('timeline');
    tl.addEventListener('input', () => callbacks.onScrub(parseFloat(tl.value) / 1000));
  }

  hideLoading() { this.els.loading.style.display = 'none'; }

  // 저장된 설정을 컨트롤 상태에 반영
  applyConfig(cfg) {
    const setSeg = (id, val) => {
      document.querySelectorAll(`#${id} button`).forEach((b) =>
        b.classList.toggle('on', b.dataset.v === String(val)));
    };
    setSeg('weatherSeg', cfg.weather);
    setSeg('styleSeg', cfg.style);
    setSeg('modeSeg', cfg.mode);
    setSeg('ghostSeg', cfg.ghost);
    setSeg('rivalPresetSeg', cfg.rivalPreset);
    setSeg('laneSeg', cfg.lane);
    setSeg('wheelSeg', cfg.wheel);
    setSeg('distSeg', cfg.dist);
    setSeg('bodySeg', cfg.body);
    setSeg('liverySeg', cfg.livery);
    const ws = $('weightSlider');
    ws.value = String(cfg.massG);
    $('weightVal').textContent = cfg.massG + ' g';
    document.querySelectorAll('#colorSeg button').forEach((b) =>
      b.classList.toggle('on', b.dataset.c === String(cfg.color)));
  }

  // 트랙 스타일에 따라 레인 버튼의 의미가 달라진다
  setLaneMode(style) {
    const road = style === 'road';
    const roadLabels = ['왼쪽 끝', '왼쪽 안', '오른쪽 안', '오른쪽 끝'];
    document.querySelectorAll('#laneSeg button').forEach((b, i) => {
      b.innerHTML = road
        ? `${i + 1}번 위치<small>${roadLabels[i]}</small>`
        : `${i + 1}레인<small>${this.track.lanes[i].total.toFixed(2)}m</small>`;
    });
    $('laneTitle').textContent = road ? '출발 위치 (도로 위 좌우 위치)' : '출발 레인 (레인별 실측 길이·곡률)';
    $('laneHint').textContent = road
      ? '로드 코스는 칸막이가 없어 레인이 곧 경로가 아닙니다. 출발 위치만 다를 뿐, 코너에서는 '
        + '모두 바깥으로 밀려 같은 라인으로 몰리고 서로 부딪힙니다. 이동 거리는 실제로 그린 라인이 결정합니다.'
      : '디바이더가 레인을 갈라놓기 때문에 레인별 실제 길이와 곡률 차이가 그대로 기록 차이가 됩니다.';
  }

  setRivalGroupVisible(on) {
    $('rivalGroup').classList.toggle('hidden', !on);
  }

  setRivalHint(cfg) {
    const el = $('rivalHint');
    if (!cfg) { el.textContent = ''; return; }
    el.textContent = `라이벌은 ${cfg.lane + 1}레인에서 ${cfg.massG}g으로 출발합니다. `
      + '같은 물리·같은 날씨, 세팅만 다릅니다.';
  }

  setGhostHint(data) {
    const el = $('ghostHint');
    if (!data) {
      el.textContent = '이 트랙 스타일의 최고 기록이 없습니다. 완주하면 자동 저장됩니다.';
      return;
    }
    const d = new Date(data.date);
    el.textContent = `저장된 최고 기록 ${data.time.toFixed(3)}s `
      + `(${data.cfg.massG}g · ${d.getMonth() + 1}/${d.getDate()}) — 반투명 고스트로 함께 달립니다.`;
  }

  setGapVisible(on) {
    this.els.hudGapStat.classList.toggle('hidden', !on);
  }

  // gap > 0 이면 내가 앞섬 (m)
  setGap(gap, label) {
    const el = $('hudGap');
    const sign = gap >= 0 ? '+' : '−';
    el.innerHTML = `<span class="${gap >= 0 ? 'ahead' : 'behind'}">${sign}${Math.abs(gap).toFixed(2)}</span>`;
    $('hudGapLabel').textContent = `${label} 대비 (m)`;
  }

  setMarkerVisible(rival, ghost) {
    $('progressRival').classList.toggle('hidden', !rival);
    $('progressGhost').classList.toggle('hidden', !ghost);
  }

  setMarker(which, frac01) {
    if (which === 'self') { return; } // 자기 진행은 progressBar가 표시
    const el = which === 'rival' ? $('progressRival') : $('progressGhost');
    el.style.left = `calc(${Math.max(0, Math.min(1, frac01)) * 100}% - 1.5px)`;
  }

  showRankings(list, currentDate) {
    const panel = $('rankPanel');
    panel.classList.remove('hidden');
    const ol = $('rankList');
    if (!list.length) {
      ol.innerHTML = '<div class="empty">아직 완주 기록이 없습니다. 첫 레이스를 달려보세요!</div>';
      return;
    }
    ol.innerHTML = '';
    list.slice(0, 10).forEach((r, i) => {
      const li = document.createElement('li');
      if (r.date === currentDate) li.classList.add('current');
      const d = new Date(r.date);
      li.innerHTML = `<span class="pos">${i + 1}</span>`
        + `<span class="time">${r.t.toFixed(3)}s</span>`
        + `<span class="cfg">${r.cfg}</span>`
        + `<span class="date">${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</span>`;
      ol.appendChild(li);
    });
  }

  setCamButton(v) {
    this.els.camBar.querySelectorAll('button[data-v]').forEach((b) =>
      b.classList.toggle('on', b.dataset.v === v));
  }

  setSoundButton(on) {
    const b = $('soundBtn');
    b.textContent = on ? '🔊 소리 켬' : '🔇 소리 끔';
    b.classList.toggle('on', on);
  }

  showSetup() {
    this.els.setup.classList.remove('hidden');
    this.els.hud.classList.add('hidden');
    this.els.progressWrap.classList.add('hidden');
    this.els.results.classList.add('hidden');
    this.els.replayBar.classList.add('hidden');
    this.els.camBar.classList.remove('hidden');
  }

  showRace() {
    this.els.setup.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    this.els.progressWrap.classList.remove('hidden');
    this.els.results.classList.add('hidden');
    this.els.replayBar.classList.add('hidden');
    this.els.camBar.classList.remove('hidden');
  }

  setCountdown(text) {
    const el = this.els.countdown;
    if (text == null) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = text;
  }

  updateHUD(t, v, s, total) {
    $('hudTime').textContent = t.toFixed(2);
    $('hudSpeed').textContent = (v * 3.6).toFixed(1);
    $('hudScale').textContent = `1:64 환산 ${(v * 3.6 * 64).toFixed(0)} km/h`;
    $('hudDist').textContent = s.toFixed(1);
    this.els.progressBar.style.width = Math.min(100, (s / total) * 100) + '%';
  }

  toast(msg) {
    const el = this.els.toast;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  showResults(res) {
    this.els.results.classList.remove('hidden');
    $('resTitle').textContent = res.incident
      ? (res.incident === 'vault' || res.incident === 'launched' ? '🚀 코스 이탈 (DNF)' : '💥 크래시 (DNF)')
      : res.dnf ? '💤 완주 실패 (DNF)' : '🏆 FINISH!';
    $('resSub').textContent = res.sub;
    // 사고 리포트 — 무엇이 왜 일어났는지
    const inc = $('resIncident');
    if (res.incident) {
      inc.classList.remove('hidden');
      inc.innerHTML = `<b>${res.incidentLabel}</b>`
        + `<div class="why">정적전복한계 SSF ${res.ssf.toFixed(2)}`
        + ` (윤거 절반 ÷ 무게중심 높이 — 높을수록 안 넘어짐)<br>`
        + '무게 배분을 <b>중앙</b>으로 옮기거나 <b>와이드 바디</b>로 윤거를 넓히면 넘어가지 않습니다.'
        + ' 그립이 높은 <b>순정 휠</b>은 덜 미끄러져 사고가 적습니다 (대신 느립니다).'
        + ' 디바이더가 있는 클래식 트랙에서는 전복이 일어나지 않습니다.</div>';
    } else inc.classList.add('hidden');

    $('resRank').textContent = res.dnf || !res.rank ? ''
      : (res.rank === 1 ? '🥇 신기록! ' : '') + `전체 랭킹 ${res.rank}위 / ${res.rankTotal}개 기록`
        + (res.ghostUpdated ? ' · 👻 고스트 갱신' : '');

    // 대결 결과 (2대 대결 / 고스트)
    const vs = $('resVersus');
    vs.innerHTML = (res.versus || []).map((v) => {
      const icon = v.kind === 'ghost' ? '👻' : '🚙';
      let verdictHtml;
      if (v.verdict === 'win') verdictHtml = `<span class="win">WIN +${Math.abs(v.diff ?? 0).toFixed(3)}s</span>`;
      else if (v.verdict === 'lose') verdictHtml = `<span class="lose">LOSE −${Math.abs(v.diff ?? 0).toFixed(3)}s</span>`;
      else verdictHtml = '<span>무승부</span>';
      if (v.myTime == null) verdictHtml = '<span class="lose">LOSE (내 차 DNF)</span>';
      else if (v.otherTime == null) verdictHtml = '<span class="win">WIN (상대 DNF)</span>';
      const times = `<b>${v.myTime != null ? v.myTime.toFixed(3) + 's' : 'DNF'}</b>`
        + ` vs <b>${v.otherTime != null ? v.otherTime.toFixed(3) + 's' : 'DNF'}</b>`;
      return `<div class="row"><span>${icon} ${verdictHtml}</span><span>${times}</span></div>`
        + `<div class="who">상대: ${v.label}</div>`;
    }).join('');
    $('resTime').textContent = res.dnf ? '–' : res.time.toFixed(3) + ' s';
    $('resTop').innerHTML = `${(res.topV * 3.6).toFixed(1)} km/h <small>(1:64 환산 ${(res.topV * 3.6 * 64).toFixed(0)})</small>`;
    $('resAvg').textContent = res.dnf ? '–' : (res.avgV * 3.6).toFixed(1) + ' km/h';
    $('resJump').textContent = res.jumpDist > 0.15 ? res.jumpDist.toFixed(2) + ' m' : '없음';
    $('splits').innerHTML = (res.splits.length
      ? '구간기록 — ' + res.splits.map((s, i) => `CP${i + 1} <b>${s.toFixed(2)}s</b>`).join(' · ')
      : '')
      + (res.contacts ? `<br>💥 차대차 접촉 <b id="resContacts">${res.contacts}</b>회` : '');
  }

  showReplay(duration, highlights) {
    this.els.results.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    this.els.progressWrap.classList.add('hidden');
    this.els.replayBar.classList.remove('hidden');
    $('timeline').max = String(Math.round(duration * 1000));
    const chips = $('highlightChips');
    chips.innerHTML = '';
    highlights.forEach((h) => {
      const b = document.createElement('button');
      b.textContent = h.label;
      b.addEventListener('click', () => this.cb.onHighlight(h));
      chips.appendChild(b);
    });
  }

  updateReplay(t, duration, playing) {
    $('timeline').value = String(Math.round(t * 1000));
    $('replayTime').textContent = `${t.toFixed(2)} / ${duration.toFixed(2)}`;
    $('playPauseBtn').textContent = playing ? '⏸' : '▶';
  }

  setReplaySpeedButton(v) {
    document.querySelectorAll('#speedSeg button').forEach((b) =>
      b.classList.toggle('on', parseFloat(b.dataset.v) === v));
  }
}
