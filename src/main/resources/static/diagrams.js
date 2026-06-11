/* 시나리오별 다이어그램 — 순수 HTML/CSS 로 그린다.
 * DIAGRAMS[시나리오 id] 가 개념 설명 탭 상단에 렌더링된다. */

const box = (label, sub = '', cls = '') =>
    `<div class="d-box ${cls}">${label}${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

const arrow = (label = '', symbol = '→') =>
    `<div class="d-arrow"><span class="line">${symbol}</span>${label ? `<span>${label}</span>` : ''}</div>`;

const flow = (...items) => `<div class="d-flow">${items.join('')}</div>`;

const group = (label, inner, cls = '') =>
    `<div class="d-group ${cls}"><div class="d-group-label">${label}</div>${inner}</div>`;

const diagram = (title, inner) =>
    `<div class="diagram"><div class="diagram-title">🔍 ${title}</div>${inner}</div>`;

/** 여러 참여자의 시간순 이벤트. rows: [ [cellA, cellB], ... ], cell = {t, cls} 또는 null */
const timeline = (laneTitles, rows) =>
    `<div class="d-timeline" style="grid-template-columns:repeat(${laneTitles.length},1fr)">` +
    laneTitles.map(t => `<div class="d-lane-title">${t}</div>`).join('') +
    rows.map(r => r.map(c => c
        ? `<div class="d-event ${c.cls || ''}">${c.t}</div>`
        : '<div></div>').join('')).join('') +
    '</div>';

const DIAGRAMS = {

    'persistence-context': diagram('엔티티 생명주기와 1차 캐시',
        flow(
            box('비영속', 'new Member()', 'ghost'),
            arrow('persist()'),
            box('영속', '영속성 컨텍스트가 관리<br>1차 캐시 · 변경 감지 · 동일성 보장', 'ok'),
            arrow('detach() / clear() / close()'),
            box('준영속', '관리 중단<br>변경해도 반영 X', 'ghost')
        ) +
        '<div class="d-divider"></div>' +
        flow(
            box('em.find(1)', '같은 트랜잭션에서 재조회'),
            arrow('① 먼저 확인'),
            group('1차 캐시', flow(box('@Id=1 → Member', '스냅샷과 함께 보관', 'mini'))),
            arrow('② 없을 때만 SELECT'),
            box('DB', '', 'db')
        )),

    'dirty-checking': diagram('변경 감지 동작 원리',
        flow(
            box('① 조회', 'find / JPQL'),
            arrow(''),
            group('영속성 컨텍스트', flow(
                box('엔티티', 'age=<b>30</b>', 'mini'),
                box('스냅샷', 'age=29<br><span class="dim">조회 시점 복사본</span>', 'mini ghost')
            )),
            arrow('③ 커밋(flush) 시 비교'),
            box('다르면<br>UPDATE 자동 생성', 'update() 호출 불필요', 'ok'),
            arrow(''),
            box('DB', '', 'db')
        ) +
        `<div class="d-caption">② setAge(30) — 값만 변경. 스냅샷과 달라진 엔티티가 플러시 시점에 감지된다</div>`),

    'flush-write-behind': diagram('쓰기 지연과 플러시',
        flow(
            box('persist() ×3', 'SQL 즉시 전송 안 함'),
            arrow('쌓아두기'),
            group('쓰기 지연 SQL 저장소', flow(
                box('INSERT A', '', 'mini'), box('INSERT B', '', 'mini'), box('INSERT C', '', 'mini')
            )),
            arrow('flush'),
            box('DB', '', 'db')
        ) +
        flow(
            box('flush가 일어나는 때', '① 커밋 직전 &nbsp;② JPQL 실행 직전 &nbsp;③ em.flush()', 'wide'),
            box('flush ≠ commit', '롤백되면 전송한 SQL도 취소<br>1차 캐시도 비워지지 않음 (clear가 비움)', 'wide warn')
        )),

    'detached-merge': diagram('준영속과 merge()의 동작',
        flow(
            box('영속', 'em1에서 조회', 'ok'),
            arrow('em1 종료'),
            box('준영속', 'setAge(99)<br><span class="dim">→ 아무 일도 없음</span>', 'ghost'),
            arrow('em2.merge(member)'),
            group('merge 내부', flow(
                box('① SELECT', 'ID로 다시 조회', 'mini'),
                box('② 모든 필드 복사', '비어있던 필드는<br><b>null로 덮어씀!</b>', 'mini warn'),
                box('③ UPDATE', '커밋 시', 'mini')
            ))
        ) +
        `<div class="d-caption">⚠ 반환값(merged)이 영속 객체. 파라미터로 넘긴 원본은 여전히 준영속이다</div>`),

    'relationship-mapping': diagram('객체의 참조 vs 테이블의 FK — 연관관계의 주인',
        `<div class="d-compare">` +
        group('객체 세계 — 참조 2개 (양방향)', flow(
            box('Member', 'team <span class="dim">@ManyToOne</span>', 'mini'),
            arrow('참조', '⇄'),
            box('Team', 'members <span class="dim">@OneToMany(mappedBy)</span>', 'mini')
        )) +
        group('테이블 세계 — FK 1개', flow(
            box('MEMBER', '<b>team_id (FK)</b>', 'mini ok'),
            arrow('FK'),
            box('TEAM', 'id (PK)', 'mini')
        )) +
        `</div>` +
        flow(
            box('연관관계의 주인 = FK가 있는 쪽 (@ManyToOne, mappedBy 없는 쪽)',
                '주인에 값을 넣어야 FK 저장 · mappedBy 쪽은 읽기 전용 거울 → 그래서 양쪽 다 넣는 편의 메서드가 정석', 'wide')
        )),

    'cascade-orphan': diagram('영속성 전이와 고아 객체 제거',
        `<div class="d-compare">` +
        group('cascade = ALL', flow(
            box('em.persist(order)', '부모만 저장', 'ok'),
            arrow('전이'),
            `<div class="d-vert">${box('OrderItem ①', 'INSERT 자동', 'mini')}${box('OrderItem ②', 'INSERT 자동', 'mini')}</div>`
        )) +
        group('orphanRemoval = true', flow(
            box('orderItems.remove(0)', '컬렉션에서 제거만', 'warn'),
            arrow('고아 감지'),
            box('DELETE 자동 실행', 'em.remove() 호출 없이', 'mini danger')
        )) +
        `</div>` +
        flow(box('적용 기준', '소유자가 부모 하나뿐 + 생명주기가 같을 때만 (Order→OrderItem ⭕ / Order→Product ❌)', 'wide'))),

    'embedded-inheritance': diagram('임베디드 타입의 평탄화 · SINGLE_TABLE 상속',
        `<div class="d-compare">` +
        group('임베디드 — 객체는 묶고, 컬럼은 펼친다', flow(
            box('Member', 'address: <b>Address</b><br><span class="dim">(city, street, zipcode)</span>', 'mini'),
            arrow('평탄화'),
            box('MEMBER 테이블', 'id · name · age<br><b>city · street · zipcode</b>', 'mini ok')
        )) +
        group('상속 — 한 테이블 + dtype', flow(
            `<div class="d-vert">${box('Book', 'author, isbn', 'mini')}${box('Album', 'artist', 'mini')}</div>`,
            arrow('extends Item'),
            box('ITEM 테이블', '<b>dtype</b> · id · name · price<br>author · isbn · artist <span class="dim">(전부 nullable)</span>', 'mini ok')
        )) +
        `</div>`),

    'proxy-lazy-loading': diagram('프록시 초기화 과정',
        flow(
            box('member.getTeam()', 'SELECT 없음'),
            arrow('반환'),
            box('Team 프록시', 'Team을 상속한 가짜 객체<br>target = <b>null</b> · id만 보유', 'ghost'),
            arrow('getName() 호출 순간'),
            group('초기화', flow(
                box('① 영속성 컨텍스트에<br>조회 요청', '', 'mini'),
                box('② SELECT 실행', '', 'mini'),
                box('③ target 채움', '이후엔 위임만', 'mini ok')
            ))
        ) +
        `<div class="d-caption">getId()는 이미 아는 값이라 초기화 없이 반환 · 컨텍스트가 닫힌 뒤 초기화 시도 → LazyInitializationException</div>`),

    'lazy-initialization-exception': diagram('예외가 발생하는 시점',
        timeline(['🕐 트랜잭션 안', '🕓 트랜잭션 종료 후'], [
            [{ t: 'member 조회 (team은 LAZY 프록시)' }, null],
            [{ t: '커밋 → 영속성 컨텍스트 닫힘', cls: 'warn' }, null],
            [null, { t: 'member.getTeam().getName()<br>→ 초기화할 컨텍스트가 없음', cls: '' }],
            [null, { t: '💥 LazyInitializationException', cls: 'danger' }],
        ]) +
        flow(
            box('✅ 해결', '트랜잭션 안에서 fetch join / DTO 프로젝션으로<br>필요한 데이터를 모두 로딩해 두고 나간다', 'wide ok')
        )),

    'nplus1-problem': diagram('쿼리 1번이 1+N번이 되는 과정',
        flow(
            box('select t from Team t', '쿼리 ①', 'ok'),
            arrow('결과 N건'),
            `<div class="d-vert">
                ${box('팀A.getMembers()', 'SELECT … where team_id=A &nbsp;②', 'mini danger')}
                ${box('팀B.getMembers()', 'SELECT … where team_id=B &nbsp;③', 'mini danger')}
                ${box('팀C.getMembers()', 'SELECT … where team_id=C &nbsp;④', 'mini danger')}
            </div>`,
            arrow(''),
            box('팀 100개라면?', '<b>총 101번</b> 쿼리 실행', 'danger')
        )),

    'fetch-join': diagram('N+1 vs 페치 조인',
        `<div class="d-compare">` +
        group('❌ 지연 로딩에 맡기기', flow(
            box('SELECT teams', '1번', 'mini'),
            arrow('+'),
            box('SELECT members ×N', '팀마다 1번씩', 'mini danger')
        ) + `<div class="d-caption">총 1 + N 번</div>`) +
        group('✅ join fetch / EntityGraph', flow(
            box('SELECT t.*, m.*<br>FROM team JOIN member', '한 번에 모두 로딩', 'mini ok')
        ) + `<div class="d-caption">총 1번</div>`) +
        `</div>` +
        flow(box('⚠ 컬렉션 페치 조인 + 페이징 금지', '일대다 조인은 행이 뻥튀기 → LIMIT 불가 → 전체를 메모리에 올려 자름 (OOM 위험)<br>컬렉션은 LAZY + batch_size로, 페이징은 xToOne fetch join까지만', 'wide warn'))),

    'paging': diagram('offset 페이징의 동작',
        flow(
            box('전체 결과', '정렬: order by age desc<b>, id desc</b><br><span class="dim">동점자 순서 고정용 유니크 키 필수</span>'),
            arrow('offset 3'),
            box('1페이지 건너뜀', '3행 읽고 버림', 'ghost'),
            arrow('fetch 3'),
            box('2페이지 반환', '3행', 'ok')
        ) +
        flow(
            box('깊은 페이지의 비용', 'offset 100000 → 10만 행을 읽고 버린다<br>운영 무한스크롤은 <b>커서 페이징</b>: where id &lt; :lastId limit 20', 'wide warn')
        )),

    'optimistic-lock': diagram('낙관적 락 — 버전 충돌 감지',
        timeline(['👤 사용자 A', '👤 사용자 B'], [
            [{ t: '① 조회 — version=<b>0</b>' }, { t: '② 조회 — version=<b>0</b>' }],
            [{ t: '③ 커밋: UPDATE … set version=1<br><b>where version=0</b> → 1행 성공', cls: 'ok' }, null],
            [null, { t: '④ 커밋: UPDATE … <b>where version=0</b><br>→ 이미 version=1이라 <b>0행</b>' }],
            [null, { t: '💥 OptimisticLockException → 롤백', cls: 'danger' }],
        ]) +
        `<div class="d-caption">먼저 커밋한 쪽이 승리 — 두 번째 갱신이 첫 번째를 조용히 덮어쓰는 사고(lost update)를 차단</div>`),

    'pessimistic-lock': diagram('비관적 락 — DB 행 잠금과 대기',
        timeline(['👤 트랜잭션 A', '👤 트랜잭션 B'], [
            [{ t: '① SELECT … <b>FOR UPDATE</b><br>행 잠금 획득 🔒', cls: 'ok' }, null],
            [null, { t: '② 같은 행 FOR UPDATE 시도<br>→ 대기 ⏳ (락 해제까지)' }],
            [{ t: '③ 검증/차감 후 커밋 → 락 해제' }, { t: '타임아웃 설정 시<br>💥 LockTimeoutException', cls: 'danger' }],
        ]) +
        `<div class="d-caption">낙관적 락 = 커밋 때 충돌 감지(실패 후 재시도) · 비관적 락 = 시작 때 차단(대기 후 순차 처리)</div>`),

    'bulk-operations': diagram('벌크 연산은 영속성 컨텍스트를 우회한다',
        flow(
            group('영속성 컨텍스트', flow(box('member', 'age = <b>29</b> <span class="dim">(옛값)</span>', 'mini warn'))),
            `<div class="d-vert">
                ${box('executeUpdate()', '벌크 UPDATE', 'mini')}
                <div class="d-arrow"><span class="line">⤵ 우회 (1차 캐시 안 거침)</span></div>
            </div>`,
            box('DB', 'age = <b>39</b>', 'db')
        ) +
        flow(
            box('같은 트랜잭션 안에서 객체 ≠ DB', '벌크 직후 <b>em.clear()</b> 후 재조회가 정석<br>Spring Data: @Modifying(clearAutomatically = true)', 'wide ok')
        )),
};
