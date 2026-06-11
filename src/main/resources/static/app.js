/* JPA Lab 프론트엔드 */

const state = {
    scenarios: [],
    schema: [],
    current: null, // 'intro' | 'scratchpad' | scenarioId
    padType: 'jpql',
    padQueries: { jpql: '', sql: '' }, // 탭별로 작성 중인 쿼리 보존
};

const nav = document.getElementById('nav');
const content = document.getElementById('content');
document.getElementById('brand').onclick = () => select('intro');

init();

async function init() {
    const [scenarios, schema] = await Promise.all([
        fetch('/api/scenarios').then(r => r.json()),
        fetch('/api/schema').then(r => r.json()),
    ]);
    state.scenarios = scenarios;
    state.schema = schema;
    renderNav();
    select(location.hash ? location.hash.substring(1) : 'intro');
}

window.addEventListener('hashchange', () => {
    const id = location.hash.substring(1);
    if (id && id !== state.current) select(id);
});

/* ---------------- 네비게이션 ---------------- */

function renderNav() {
    let html = '';
    html += navItem('intro', '🏠 시작하기');
    html += navItem('scratchpad', '🧪 스크래치 패드');

    const categories = [...new Set(state.scenarios.map(s => s.category))];
    for (const cat of categories) {
        html += `<div class="nav-category">${esc(cat)}</div>`;
        for (const s of state.scenarios.filter(x => x.category === cat)) {
            html += navItem(s.id, esc(s.title));
        }
    }
    nav.innerHTML = html;
    nav.querySelectorAll('.nav-item').forEach(el => {
        el.onclick = () => select(el.dataset.id);
    });
}

function navItem(id, label) {
    return `<a class="nav-item" data-id="${id}">${label}</a>`;
}

function select(id) {
    state.current = id;
    location.hash = id;
    nav.querySelectorAll('.nav-item').forEach(el =>
        el.classList.toggle('active', el.dataset.id === id));
    if (id === 'intro') renderIntro();
    else if (id === 'scratchpad') renderScratchpad();
    else renderScenario(id);
    window.scrollTo(0, 0);
}

/* ---------------- 시작하기 ---------------- */

function renderIntro() {
    const entityRows = state.schema.map(e =>
        `<div class="schema-entity"><div class="schema-entity-name">${esc(e.name)}</div>` +
        e.attributes.map(a =>
            `<div class="schema-attr ${a.kind !== '필드' ? 'assoc' : ''}">` +
            `<span>${esc(a.name)}</span><span class="attr-type">${esc(a.type)}${a.kind !== '필드' ? ' · ' + a.kind : ''}</span></div>`
        ).join('') + '</div>').join('');

    content.innerHTML = `
        <h1 class="page-title">⚡ JPA Lab — 실행하며 배우는 JPA</h1>
        <p class="page-summary">눈으로만 읽는 학습이 아니라, 실제 JPA 코드를 실행해서
        <b>어떤 SQL이 나가는지·언제 예외가 터지는지</b>를 직접 확인하는 학습 페이지입니다.</p>

        <div class="card intro-hero">
            <div class="feature-grid">
                <div class="feature"><b>📖 공식 개념 설명</b>JPA 명세와 Hibernate 동작 기준의 정확한 개념 정리</div>
                <div class="feature"><b>💡 실무 팁</b>현업에서 부딪히는 함정과 베스트 프랙티스</div>
                <div class="feature"><b>🏭 운영 활용</b>운영 환경에서 실제로 자주 쓰이는 패턴과 설정</div>
                <div class="feature"><b>▶ 직접 실행</b>모든 시나리오를 버튼 한 번으로 실행 — 실행된 SQL과 예외를 그대로 표시</div>
            </div>
        </div>

        <div class="card doc">
            <p><strong>추천 학습 순서</strong></p>
            <ol>
                <li><b>영속성 컨텍스트</b> — 1차 캐시 → 변경 감지 → 플러시 → 준영속/merge</li>
                <li><b>연관관계 매핑</b> — 연관관계의 주인 → cascade/orphanRemoval → 임베디드/상속</li>
                <li><b>지연 로딩과 성능</b> — 프록시 → <span style="color:#b03434">LazyInitializationException 체험</span> → N+1 체험 → 페치 조인 → 페이징</li>
                <li><b>동시성과 락</b> — 낙관적 락 충돌 체험 → 비관적 락 타임아웃 체험</li>
                <li><b>JPQL과 벌크 연산</b> — 벌크 연산과 1차 캐시 불일치 체험</li>
            </ol>
            <p>⚠ 표시가 있는 시나리오는 <strong>일부러 예외와 잘못된 방식을 발생시키는</strong> 체험형 시나리오입니다.
            마지막에는 <strong>🧪 스크래치 패드</strong>에서 JPQL과 SQL을 자유롭게 실험해 보세요.
            시나리오는 실행할 때마다 데이터가 초기 상태로 리셋되므로 부담 없이 눌러봐도 됩니다.</p>
        </div>

        <div class="card">
            <p style="font-weight:800; margin-bottom:12px">📦 학습용 도메인 모델</p>
            <div class="erd-wrap">${domainErd()}</div>
            <div class="pad-grid" style="grid-template-columns: 1fr 1fr 1fr; margin-top: 16px">
                ${entityRows}
            </div>
        </div>`;
}

/** 도메인 모델 ERD (SVG) */
function domainErd() {
    const entity = (x, y, w, title, fields, sub = false) => {
        const h = 30 + fields.length * 16;
        return `<rect class="erd-box ${sub ? 'sub' : ''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
            <text class="erd-title" x="${x + 12}" y="${y + 20}">${title}</text>
            <line x1="${x + 8}" y1="${y + 28}" x2="${x + w - 8}" y2="${y + 28}" style="stroke:#dfe4f3;stroke-width:1"/>` +
            fields.map((f, i) =>
                `<text class="erd-field ${f.startsWith('*') ? 'key' : ''}" x="${x + 12}" y="${y + 44 + i * 16}">${f.replace(/^\*/, '')}</text>`
            ).join('');
    };
    const label = (x, y, t) => `<text class="erd-label" x="${x}" y="${y}" text-anchor="middle">${t}</text>`;
    const line = (points) => `<polyline class="erd-line" points="${points}"/>`;

    return `<svg viewBox="0 0 780 390" width="780">
        ${entity(40, 62, 150, 'Team', ['*id (PK)', 'name', 'members ⇄ 양방향'])}
        ${entity(300, 42, 195, 'Member', ['*id (PK)', 'name · age', 'city/street/zipcode', '└ Address 임베디드', '*team_id (FK)'])}
        ${entity(588, 42, 165, 'Item ◁ Book/Album', ['*dtype (구분 컬럼)', 'id · name · price', 'author·isbn (Book)', 'artist (Album)', 'SINGLE_TABLE 상속'])}
        ${entity(70, 255, 175, 'Order (orders)', ['*id (PK)', '*member_id (FK)', 'status · orderDate', 'cascade ALL+고아제거'])}
        ${entity(330, 255, 185, 'OrderItem', ['*id (PK)', '*order_id (FK)', '*product_id (FK)', 'orderPrice · count'])}
        ${entity(588, 255, 165, 'Product', ['*id (PK)', 'name · price', 'stockQuantity', '*version (@Version)'])}
        ${line('190,100 300,100')} ${label(245, 92, '1 ─ N')}
        ${line('370,162 370,210 157,210 157,255')} ${label(263, 203, '1 ─ N 주문')}
        ${line('245,305 330,305')} ${label(287, 297, '1 ─ N')}
        ${line('515,305 588,305')} ${label(551, 297, 'N ─ 1')}
    </svg>`;
}

/* ---------------- 시나리오 페이지 ---------------- */

function renderScenario(id) {
    const s = state.scenarios.find(x => x.id === id);
    if (!s) { renderIntro(); return; }

    content.innerHTML = `
        <h1 class="page-title">${esc(s.title)}</h1>
        <p class="page-summary">${esc(s.summary)}</p>

        <div class="tabs">
            <div class="tab active" data-tab="concept">📖 개념 설명</div>
            <div class="tab" data-tab="tips">💡 실무 팁</div>
            <div class="tab" data-tab="production">🏭 운영 활용</div>
            <div class="tab" data-tab="code">💻 실행 코드</div>
        </div>
        <div id="tab-body"></div>

        <div class="run-bar">
            <button class="btn" id="run-btn">▶ 실행하기</button>
            <span class="run-hint">실행하면 데이터가 초기화된 후 시나리오가 단계별로 수행되고,
            실제 실행된 SQL과 예외가 아래에 표시됩니다.</span>
        </div>
        <div id="run-output"></div>`;

    const tabBody = document.getElementById('tab-body');
    const renderTab = (tab) => {
        if (tab === 'code') {
            tabBody.innerHTML = `<pre class="code-block">${esc(s.code.trim())}</pre>`;
        } else if (tab === 'concept') {
            const dia = (typeof DIAGRAMS !== 'undefined' && DIAGRAMS[s.id]) || '';
            tabBody.innerHTML = dia + `<div class="card doc">${md(s[tab])}</div>`;
        } else {
            tabBody.innerHTML = `<div class="card doc">${md(s[tab])}</div>`;
        }
    };
    renderTab('concept');

    content.querySelectorAll('.tab').forEach(el => {
        el.onclick = () => {
            content.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            el.classList.add('active');
            renderTab(el.dataset.tab);
        };
    });

    document.getElementById('run-btn').onclick = () => runScenario(s.id);
}

async function runScenario(id) {
    const btn = document.getElementById('run-btn');
    const out = document.getElementById('run-output');
    btn.disabled = true;
    btn.textContent = '실행 중...';
    out.innerHTML = '';
    try {
        const res = await fetch(`/api/scenarios/${id}/run`, { method: 'POST' });
        const data = await res.json();
        out.innerHTML = data.steps.map(renderStep).join('');
    } catch (e) {
        out.innerHTML = `<div class="error-block"><div class="error-title">실행 요청 실패</div>
            <div class="error-chain">${esc(String(e))}</div></div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '▶ 다시 실행하기';
    }
}

function renderStep(step) {
    const badge = step.error
        ? '<span class="badge fail">예외 발생</span>'
        : '<span class="badge ok">성공</span>';
    const logs = step.logs.map(l =>
        l === '' ? '<div class="log-line empty"></div>'
                 : `<div class="log-line">${esc(l)}</div>`).join('');
    const sql = step.sql.length
        ? `<div class="sql-label">실행된 SQL (${step.sql.length}건)</div>` +
          step.sql.map(q => `<div class="sql-block">${esc(formatSql(q))}</div>`).join('')
        : '<div class="no-sql">이 단계에서 실행된 SQL 없음</div>';
    const error = step.error ? `
        <div class="error-block">
            <div class="error-title">💥 ${esc(step.error.exceptionType)}</div>
            <div class="error-chain">${step.error.causeChain.map(esc).join('<br>&nbsp;&nbsp;↳ ')}</div>
        </div>` : '';
    return `<div class="step">
        <div class="step-header">${esc(step.name)} ${badge}</div>
        <div class="step-body">${logs}${sql}${error}</div>
    </div>`;
}

/* ---------------- 스크래치 패드 ---------------- */

const EXAMPLES = {
    jpql: [
        { label: '전체 회원 조회', q: 'select m from Member m' },
        { label: '30세 이상 이름/나이', q: "select m.name, m.age from Member m where m.age >= 30" },
        { label: '팀별 인원 통계', q: 'select t.name, count(m) from Team t left join t.members m group by t.name' },
        { label: '회원+팀 fetch join', q: 'select m from Member m join fetch m.team' },
        { label: '주문 상세 (다중 조인)', q: 'select o.id, m.name, p.name, oi.count from Order o join o.member m join o.orderItems oi join oi.product p' },
        { label: '벌크 UPDATE (나이 +1)', q: 'update Member m set m.age = m.age + 1' },
        { label: '❌ 없는 필드 참조', q: "select m from Member m where m.username = 'x'", danger: true },
        { label: '❌ 엔티티명 대소문자 오류', q: 'select m from member m', danger: true },
        { label: '❌ cascade 무시하는 벌크 삭제 (FK 위반)', q: 'delete from Order', danger: true },
        { label: '❌ getSingleResult용 다건 (직접 limit 없이)', q: 'select m from Member m where m.age > 200', danger: true },
    ],
    sql: [
        { label: '회원 테이블 전체', q: 'select * from member' },
        { label: '임베디드 타입 → 컬럼 확인', q: 'select id, name, city, street, zipcode from member' },
        { label: '팀별 인원 (조인)', q: 'select t.name, count(*) from team t join member m on m.team_id = t.id group by t.name' },
        { label: '상속 매핑 테이블 (dtype 확인)', q: 'select dtype, id, name, price, author, artist from item' },
        { label: '상품 version 컬럼 확인', q: 'select id, name, price, stock_quantity, version from product' },
        { label: '❌ 예약어 테이블명', q: 'select * from order', danger: true },
        { label: '❌ 없는 컬럼', q: 'select username from member', danger: true },
    ],
};

function renderScratchpad() {
    const schemaHtml = state.schema.map(e =>
        `<div class="schema-entity"><div class="schema-entity-name">${esc(e.name)}</div>` +
        e.attributes.map(a =>
            `<div class="schema-attr ${a.kind !== '필드' ? 'assoc' : ''}">` +
            `<span>${esc(a.name)}</span><span class="attr-type">${esc(a.type)}${a.kind !== '필드' ? ' · ' + a.kind : ''}</span></div>`
        ).join('') + '</div>').join('');

    content.innerHTML = `
        <h1 class="page-title">🧪 스크래치 패드</h1>
        <p class="page-summary">JPQL 또는 네이티브 SQL을 직접 실행해 보세요. 결과·실제 실행된 SQL·예외가 그대로 표시됩니다.
        잘못된 쿼리도 마음껏 실행해 보세요 — <b>데이터 초기화</b> 버튼으로 언제든 처음 상태로 돌아갑니다.</p>

        <div class="pad-grid">
            <div class="pad-main">
                <textarea id="pad-query" spellcheck="false" placeholder="select m from Member m"></textarea>
                <div class="pad-controls">
                    <div class="type-toggle">
                        <button id="type-jpql">JPQL</button>
                        <button id="type-sql">네이티브 SQL</button>
                    </div>
                    <button class="btn" id="pad-run">▶ 실행 (Ctrl+Enter)</button>
                    <button class="btn secondary" id="pad-reset">🔄 데이터 초기화</button>
                </div>
                <div class="examples" id="pad-examples"></div>
                <div id="pad-output"></div>
            </div>
            <div class="card schema-panel">
                <p style="font-weight:800; margin-bottom:10px">📦 엔티티 레퍼런스</p>
                ${schemaHtml}
                <p class="notice">JPQL은 <b>엔티티명/필드명</b>(대소문자 구분), 네이티브 SQL은 <b>테이블/컬럼명</b>을 사용합니다.
                Order 테이블은 예약어 문제로 <code>orders</code> 입니다.</p>
            </div>
        </div>`;

    const textarea = document.getElementById('pad-query');
    textarea.value = state.padQueries[state.padType]; // 페이지를 떠났다 와도 유지
    textarea.addEventListener('input', () => {
        state.padQueries[state.padType] = textarea.value;
    });

    const renderTypeButtons = () => {
        document.getElementById('type-jpql').classList.toggle('active', state.padType === 'jpql');
        document.getElementById('type-sql').classList.toggle('active', state.padType === 'sql');
        textarea.placeholder = state.padType === 'jpql' ? 'select m from Member m' : 'select * from member';
        renderExamples();
    };
    // 탭(JPQL/SQL)별로 작성 중인 쿼리를 각각 보존하고, 전환 시 해당 탭의 쿼리를 복원한다
    const switchType = (type) => {
        if (state.padType === type) return;
        state.padQueries[state.padType] = textarea.value;
        state.padType = type;
        textarea.value = state.padQueries[type];
        renderTypeButtons();
    };
    document.getElementById('type-jpql').onclick = () => switchType('jpql');
    document.getElementById('type-sql').onclick = () => switchType('sql');

    function renderExamples() {
        const list = EXAMPLES[state.padType];
        document.getElementById('pad-examples').innerHTML =
            '<h4>예제 (클릭하면 입력됩니다 — ❌는 예외 체험)</h4>' +
            list.map((ex, i) =>
                `<span class="example-chip ${ex.danger ? 'danger' : ''}" data-i="${i}">${esc(ex.label)}</span>`).join('');
        document.querySelectorAll('.example-chip').forEach(el => {
            el.onclick = () => {
                textarea.value = list[el.dataset.i].q;
                state.padQueries[state.padType] = textarea.value;
                textarea.focus();
            };
        });
    }

    renderTypeButtons();

    document.getElementById('pad-run').onclick = runPad;
    textarea.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') runPad();
    });
    document.getElementById('pad-reset').onclick = async () => {
        const res = await fetch('/api/scratchpad/reset', { method: 'POST' }).then(r => r.json());
        document.getElementById('pad-output').innerHTML =
            `<div class="card"><span class="success-msg">✅ ${esc(res.message)}</span></div>`;
    };
}

async function runPad() {
    const query = document.getElementById('pad-query').value;
    const out = document.getElementById('pad-output');
    out.innerHTML = '<div class="notice">실행 중...</div>';
    const data = await fetch('/api/scratchpad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: state.padType, query }),
    }).then(r => r.json());

    let html = '<div class="card">';
    if (data.error) {
        html += `<div class="error-block" style="margin-top:0">
            <div class="error-title">💥 ${esc(data.error.exceptionType)}</div>
            <div class="error-chain">${data.error.causeChain.map(esc).join('<br>&nbsp;&nbsp;↳ ')}</div>
        </div>
        <p class="notice">예외가 발생해 트랜잭션은 롤백되었습니다. 예외 체인을 읽는 것도 중요한 학습입니다 —
        맨 아래 원인(root cause)부터 보세요.</p>`;
    } else if (data.resultType === 'rows') {
        html += `<p class="success-msg">✅ 조회 성공 — ${data.rowCount}행</p>`;
        if (data.rows.length) {
            const colCount = Math.max(...data.rows.map(r => r.length));
            html += '<table class="result-table"><thead><tr>' +
                Array.from({ length: colCount }, (_, i) => `<th>col${i + 1}</th>`).join('') +
                '</tr></thead><tbody>' +
                data.rows.map(r => '<tr>' + r.map(c => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') +
                '</tbody></table>';
        }
        if (data.notice) html += `<p class="notice">${esc(data.notice)}</p>`;
    } else if (data.resultType === 'update') {
        html += `<p class="success-msg">✅ 실행 성공 — ${data.affectedRows}행 변경 (커밋됨)</p>
            <p class="notice">변경을 되돌리려면 <b>데이터 초기화</b>를 누르세요.</p>`;
    }
    if (data.executedSql && data.executedSql.length) {
        html += `<div class="sql-label">실제 실행된 SQL (${data.executedSql.length}건)</div>` +
            data.executedSql.map(q => `<div class="sql-block">${esc(formatSql(q))}</div>`).join('');
    }
    html += '</div>';
    out.innerHTML = html;
}

/* ---------------- 유틸 ---------------- */

function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 한 줄짜리 SQL을 읽기 좋게 줄바꿈 */
function formatSql(sql) {
    return sql
        .replace(/\s+(from|where|left join|inner join|join fetch|join|group by|order by|having|values|set|offset|fetch first|limit|for update)\s+/gi,
            (m, kw) => '\n' + kw.toLowerCase() + ' ')
        .replace(/,\s*(?![^(]*\))/g, ',\n    ');
}

/** 시나리오 문서용 미니 마크다운 렌더러 (문단, 목록, 번호목록, **굵게**, `코드`) */
function md(text) {
    const inline = (s) => esc(s)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');

    const lines = text.split('\n');
    let html = '', listType = null, paragraph = [];

    const flushParagraph = () => {
        if (paragraph.length) { html += `<p>${inline(paragraph.join(' '))}</p>`; paragraph = []; }
    };
    const closeList = () => {
        if (listType) { html += `</${listType}>`; listType = null; }
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) { flushParagraph(); closeList(); continue; }
        const bullet = line.match(/^- (.*)/);
        const numbered = line.match(/^\d+\. (.*)/);
        if (bullet || numbered) {
            flushParagraph();
            const want = bullet ? 'ul' : 'ol';
            if (listType !== want) { closeList(); html += `<${want}>`; listType = want; }
            html += `<li>${inline((bullet || numbered)[1])}</li>`;
        } else if (listType && (raw.startsWith('  ') || raw.startsWith('\t'))) {
            // 목록 항목의 연속 줄
            html = html.replace(/<\/li>$/, ' ' + inline(line) + '</li>');
        } else {
            closeList();
            paragraph.push(line);
        }
    }
    flushParagraph();
    closeList();
    return html;
}
