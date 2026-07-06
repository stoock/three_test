import { DISPOSITIONS, getDisposition } from '../engine/dispositions';
import { eraAt, techThreshold } from '../engine/eras';
import type { DispositionId, LogEntry, LogKind, SimState } from '../engine/types';
import { formatNum, formatYear } from './format';

export interface HudCallbacks {
  onCreate(name: string, dispositionId: DispositionId): void;
  onSpeed(mult: number): void;
  onSave(): void;
  onReset(): void;
}

const SPEEDS = [0, 1, 10, 100, 1000] as const;
const STAT_LABELS: [keyof SimState['stats'], string][] = [
  ['knowledge', '📖 지식'],
  ['vigor', '💪 체력'],
  ['creativity', '💡 창의'],
  ['spirit', '🔮 정신'],
  ['charisma', '🗣️ 매력'],
];
const FILTERS: { key: LogKind | 'all'; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'era', label: '시대' },
  { key: 'milestone', label: '이정표' },
  { key: 'event', label: '사건' },
];

/** DOM 기반 HUD — 생성 화면 / 상태 패널 / 시간 제어 / 연대기 */
export class Hud {
  private root: HTMLElement;
  private creationEl: HTMLElement | null = null;
  private statusEl!: HTMLElement;
  private entriesEl!: HTMLElement;
  private timeButtons: HTMLButtonElement[] = [];
  private toastEl!: HTMLElement;
  private filter: LogKind | 'all' = 'all';
  private renderedIds = new Set<number>();
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    root: HTMLElement,
    private cb: HudCallbacks,
  ) {
    this.root = root;
    this.buildGameHud();
  }

  // ── 캐릭터 생성 ────────────────────────────────
  showCreation(): void {
    this.hideCreation();
    const overlay = document.createElement('div');
    overlay.className = 'creation-overlay';
    overlay.innerHTML = `
      <div class="panel creation">
        <h1>영원의 행성 <span style="color:var(--text-dim);font-size:15px">Aeterna</span></h1>
        <p class="sub">불멸자의 이름을 짓고 성향을 고르세요. 그의 행성이 함께 태어납니다.</p>
        <input type="text" maxlength="24" placeholder="불멸자의 이름" />
        <div class="disp-grid"></div>
        <button class="primary" disabled>행성에 강림하기</button>
      </div>`;
    const input = overlay.querySelector('input')!;
    const grid = overlay.querySelector('.disp-grid')!;
    const startBtn = overlay.querySelector('button.primary') as HTMLButtonElement;
    let selected: DispositionId | null = null;

    for (const d of DISPOSITIONS) {
      const card = document.createElement('div');
      card.className = 'disp-card';
      card.innerHTML = `<div class="emoji">${d.emoji}</div><div class="name">${d.name}</div><div class="desc">${d.desc}</div>`;
      card.addEventListener('click', () => {
        selected = d.id;
        grid.querySelectorAll('.disp-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        refresh();
      });
      grid.appendChild(card);
    }
    const refresh = () => {
      startBtn.disabled = !(input.value.trim() && selected);
    };
    input.addEventListener('input', refresh);
    startBtn.addEventListener('click', () => {
      if (input.value.trim() && selected) this.cb.onCreate(input.value.trim(), selected);
    });

    this.root.appendChild(overlay);
    this.creationEl = overlay;
    input.focus();
  }

  hideCreation(): void {
    this.creationEl?.remove();
    this.creationEl = null;
  }

  // ── 게임 HUD ────────────────────────────────
  private buildGameHud(): void {
    this.statusEl = document.createElement('div');
    this.statusEl.className = 'panel status';
    this.root.appendChild(this.statusEl);

    const chronicle = document.createElement('div');
    chronicle.className = 'panel chronicle';
    chronicle.innerHTML = `<h2>📚 연대기</h2><div class="filters"></div><div class="entries"></div>`;
    const filters = chronicle.querySelector('.filters')!;
    for (const f of FILTERS) {
      const b = document.createElement('button');
      b.textContent = f.label;
      if (f.key === this.filter) b.classList.add('active');
      b.addEventListener('click', () => {
        this.filter = f.key;
        filters.querySelectorAll('button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.entriesEl.innerHTML = '';
        this.renderedIds.clear();
      });
      filters.appendChild(b);
    }
    this.entriesEl = chronicle.querySelector('.entries') as HTMLElement;
    this.root.appendChild(chronicle);

    const timebar = document.createElement('div');
    timebar.className = 'panel timebar';
    for (const s of SPEEDS) {
      const b = document.createElement('button');
      b.textContent = s === 0 ? '⏸' : `${s}×`;
      if (s === 1) b.classList.add('active');
      b.addEventListener('click', () => {
        this.timeButtons.forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.cb.onSpeed(s);
      });
      this.timeButtons.push(b);
      timebar.appendChild(b);
    }
    const spacer = document.createElement('div');
    spacer.className = 'spacer';
    timebar.appendChild(spacer);
    const saveBtn = document.createElement('button');
    saveBtn.className = 'ghost';
    saveBtn.textContent = '💾 저장';
    saveBtn.addEventListener('click', () => this.cb.onSave());
    timebar.appendChild(saveBtn);
    const resetBtn = document.createElement('button');
    resetBtn.className = 'ghost';
    resetBtn.textContent = '🔄 새 불멸자';
    resetBtn.addEventListener('click', () => {
      if (confirm('현재 연대기를 지우고 새 불멸자로 시작할까요?')) this.cb.onReset();
    });
    timebar.appendChild(resetBtn);
    this.root.appendChild(timebar);

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'toast';
    this.root.appendChild(this.toastEl);
  }

  setGameVisible(visible: boolean): void {
    const d = visible ? '' : 'none';
    this.statusEl.style.display = d;
    (this.root.querySelector('.chronicle') as HTMLElement).style.display = d;
    (this.root.querySelector('.timebar') as HTMLElement).style.display = visible ? 'flex' : 'none';
  }

  updateStatus(state: SimState): void {
    const disp = getDisposition(state.character.dispositionId);
    const era = eraAt(state.eraIndex);
    const techPct = Math.min(100, (state.tech / techThreshold(state.eraIndex)) * 100);
    const rows = STAT_LABELS.map(
      ([k, label]) => `<div class="stat-row"><span>${label}</span><b>${formatNum(state.stats[k])}</b></div>`,
    ).join('');
    this.statusEl.innerHTML = `
      <div class="who"><span class="nm">${escapeHtml(state.character.name)}</span><span class="dp">${disp.emoji} ${disp.name}</span></div>
      <div class="age">나이 ${formatYear(state.year)} · 불멸</div>
      <div class="era">${era.emoji} ${era.name}</div>
      <div class="bar"><i style="width:${techPct}%"></i></div>
      <div class="label">능력치</div>
      ${rows}
      <div class="label">운명 (카오스)</div>
      <div class="bar fate"><i style="width:${(state.fate * 100).toFixed(1)}%"></i></div>
      <div class="stat-row"><span>🏙️ 문명 규모</span><b>${formatNum(state.civ)}</b></div>`;
  }

  /** 로그 전체를 필터에 맞춰 증분 렌더 */
  updateLog(state: SimState): void {
    const visible = state.log.filter((e) => this.filter === 'all' || e.kind === this.filter);
    for (const entry of visible) {
      if (this.renderedIds.has(entry.id)) continue;
      this.renderedIds.add(entry.id);
      this.entriesEl.prepend(this.renderEntry(entry));
    }
    while (this.entriesEl.children.length > 120) this.entriesEl.lastElementChild?.remove();
  }

  resetLog(): void {
    this.entriesEl.innerHTML = '';
    this.renderedIds.clear();
  }

  private renderEntry(entry: LogEntry): HTMLElement {
    const el = document.createElement('div');
    el.className = `entry ${entry.kind}`;
    el.innerHTML = `
      <div class="meta">${formatYear(entry.year)} · ${entry.eraName}</div>
      <div class="title">${escapeHtml(entry.title)}</div>
      <div class="body">${escapeHtml(entry.body)}</div>`;
    if (entry.snapshot) {
      const img = document.createElement('img');
      img.src = entry.snapshot;
      img.alt = entry.title;
      img.addEventListener('click', () => this.openPhoto(entry));
      el.appendChild(img);
    }
    return el;
  }

  private openPhoto(entry: LogEntry): void {
    if (!entry.snapshot) return;
    const modal = document.createElement('div');
    modal.className = 'photo-modal';
    modal.innerHTML = `<img src="${entry.snapshot}" alt=""><div class="cap">${formatYear(entry.year)} · ${escapeHtml(entry.title)}</div>`;
    modal.addEventListener('click', () => modal.remove());
    this.root.appendChild(modal);
  }

  toast(msg: string): void {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}
