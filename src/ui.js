import { CAR_COLORS } from './carmodel.js';

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
      setup: $('setupPanel'), hud: $('hud'), progressWrap: $('progressWrap'),
      progressBar: $('progressBar'), camBar: $('camBar'), countdown: $('countdown'),
      toast: $('toast'), results: $('resultsPanel'), replayBar: $('replayBar'),
      loading: $('loading'),
    };

    // 레인 버튼 (레인별 실측 길이 표시)
    const laneSeg = $('laneSeg');
    track.lanes.forEach((lane, i) => {
      const b = document.createElement('button');
      b.dataset.v = String(i);
      b.innerHTML = `${i + 1}레인<small>${lane.total.toFixed(2)}m</small>`;
      if (i === 1) b.classList.add('on');
      laneSeg.appendChild(b);
    });

    // 색상 스와치
    const colorSeg = $('colorSeg');
    CAR_COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.style.background = '#' + c.toString(16).padStart(6, '0');
      if (i === 0) b.classList.add('on');
      b.addEventListener('click', () => {
        colorSeg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        callbacks.onConfig('color', c);
      });
      colorSeg.appendChild(b);
    });

    bindSeg($('weatherSeg'), (v) => callbacks.onConfig('weather', v));
    bindSeg(laneSeg, (v) => callbacks.onConfig('lane', parseInt(v, 10)));
    bindSeg($('wheelSeg'), (v) => callbacks.onConfig('wheel', v));
    bindSeg($('distSeg'), (v) => callbacks.onConfig('dist', v));
    bindSeg($('bodySeg'), (v) => callbacks.onConfig('body', v));

    const ws = $('weightSlider');
    ws.addEventListener('input', () => {
      $('weightVal').textContent = ws.value + ' g';
      callbacks.onConfig('massG', parseInt(ws.value, 10));
    });

    $('startBtn').addEventListener('click', () => callbacks.onStart());
    $('replayBtn').addEventListener('click', () => callbacks.onEnterReplay());
    $('backToSetupBtn').addEventListener('click', () => callbacks.onBackToSetup());
    $('exitReplayBtn').addEventListener('click', () => callbacks.onExitReplay());

    bindSeg($('camBar'), (v) => callbacks.onCamera(v));
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

  setCamButton(v) {
    this.els.camBar.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('on', b.dataset.v === v));
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
    $('resTitle').textContent = res.dnf ? '💤 완주 실패 (DNF)' : '🏆 FINISH!';
    $('resSub').textContent = res.sub;
    $('resTime').textContent = res.dnf ? '–' : res.time.toFixed(3) + ' s';
    $('resTop').innerHTML = `${(res.topV * 3.6).toFixed(1)} km/h <small>(1:64 환산 ${(res.topV * 3.6 * 64).toFixed(0)})</small>`;
    $('resAvg').textContent = res.dnf ? '–' : (res.avgV * 3.6).toFixed(1) + ' km/h';
    $('resJump').textContent = res.jumpDist > 0.15 ? res.jumpDist.toFixed(2) + ' m' : '없음';
    $('splits').innerHTML = res.splits.length
      ? '구간기록 — ' + res.splits.map((s, i) => `CP${i + 1} <b>${s.toFixed(2)}s</b>`).join(' · ')
      : '';
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
