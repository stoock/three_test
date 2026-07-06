# MCP Gateway 구현 계획 (plan.md)

- **작성일:** 2026-07-06 (v1.3 갱신)
- **버전:** v1.3
- **개발 언어:** TypeScript (확정)
- **MCP SDK:** `@modelcontextprotocol/sdk` **v1 세대 사용 (확정)**
- **개발 방식:** Claude Code + Sonnet 4.5 agent coding
- **우선 지원 클라이언트:** Claude Code (이후 Cursor → GitHub Copilot CLI)
- **범위 제외(스펙아웃):** Cursor CLI — 향후 필요 시 재검토
- **운영 환경:** 내부망 전용

> **표기 원칙:** 본 문서의 기술 근거는 `[확인됨]`(공식 문서/스펙 근거, 출처 번호 병기), `[불확실]`(근거 미확인, 테스트로 검증 필요), `[추측]`(판단에 기반한 가정)으로 구분한다. 상세 설계는 별도 문서 `mcp-gateway-design-spec.html` 참조.

---

## 1. 목표

내부 DB 조회 MCP 서버들의 단일 진입점이 되는 게이트웨이 MCP를 구축한다.

1. 클라이언트는 게이트웨이 하나만 등록하고, OAuth 2.1 인증 상태(스코프)에 따라 upstream MCP들의 툴이 노출/차단된다 (애그리게이터 패턴)
2. 인증 유효시간 24시간 (액세스 토큰 1h + 세션/리프레시 24h)
3. 권한 단위는 MCP 서버/API 전체 (스코프 `mcp:{서버명}`)
4. 최초 접근 시 브라우저 웹 인증, 만료 후 웹 인증으로 연장

### 1.1 비목표 (Non-goals) — 구현하지 않는다

에이전트의 과잉 구현을 방지하기 위해 범위 외 항목을 명시한다.

- 툴 단위(개별 tool) 권한 제어 — 권한 단위는 MCP 서버 전체
- 토큰 즉시 회수(블랙리스트/introspection) — 액세스 토큰 1h 수명으로 갈음 (§2.2)
- RFC 8693 Token Exchange — upstream 전달은 신뢰 헤더 방식
- 게이트웨이의 AS(토큰 발급) 겸용 — 토큰 발급은 Keycloak 전담
- 비대화형(CI/스크립트) 인증 경로 — 필요 시 별도 과제로 분리
- Cursor CLI 지원 — 스펙아웃 (§ Phase 7)

### 1.2 전체 완료 정의

Phase 0~7의 모든 검수 기준(AC) 통과 + Phase 7의 클라이언트 매트릭스(Claude Code·Cursor·Copilot CLI × 최초 인증/자동 갱신/만료 후 재인증) 전체 통과를 프로젝트 완료로 정의한다.

---

## 2. 기술 스택

| 구성요소 | 선택 | 근거 / 검증 수준 |
|---|---|---|
| 언어/런타임 | TypeScript + Node.js LTS | `[확인됨]` 공식 SDK가 서버(Streamable HTTP, auth helpers)와 클라이언트(transports, OAuth helpers) 라이브러리를 모두 제공 → 게이트웨이의 이중 역할(서버+클라이언트)을 단일 SDK로 구현 가능 [7] |
| MCP SDK | `@modelcontextprotocol/sdk` | `[확인됨]` 공식 TypeScript SDK. Express/Hono/Node.js HTTP용 미들웨어 패키지 제공 [7] |
| JWT 검증 | `jose` | `[추측]` JWKS 원격 조회·캐시·검증을 지원하는 사실상 표준 라이브러리라는 판단. 채택 전 최신 문서 확인 |
| HTTP 프레임워크 | Express (SDK 미들웨어 사용) | `[확인됨]` SDK가 Express용 어댑터 패키지를 제공 [7]. Fastify 선호 시 Node HTTP 어댑터로 대체 가능 |
| Authorization Server | Keycloak | `[확인됨]` OIDC Dynamic Client Registration을 구현하며, 엔드포인트는 `/realms/<realm>/clients-registrations/openid-connect` [8] |
| 로컬 개발 환경 | docker-compose (Keycloak + 더미 upstream 2개) | — |
| 테스트 도구 | MCP Inspector → Claude Code 실기기 검증 | `[확인됨]` Inspector가 OAuth 플로우 테스트를 지원 [9] |

### 2.1 SDK 버전 — v1 세대 사용 확정

**`@modelcontextprotocol/sdk` v1 세대를 사용한다 (확정).**

- `[확인됨]` v1 세대는 `v1.x` 브랜치로 유지되며, v1 API 문서는 https://ts.sdk.modelcontextprotocol.io/ 에서 제공된다 [7]
- `[추측]` v1 채택 근거: Sonnet 4.5의 학습 데이터가 v1 API(`McpServer`, `StreamableHTTPServerTransport`)에 편중되어 있을 가능성이 높아 agent coding 정확도에 유리하다 (모델 학습 데이터의 정확한 구성은 알 수 없다)
- **package.json에 v1 최신 안정 버전을 고정(pin)** 하고, Phase 0에서 정확한 버전 번호를 npm에서 확인해 기록한다
- v1 API 문서를 `docs/vendor/`에 저장해 에이전트 컨텍스트로 제공한다
- `[불확실]` v1 브랜치의 유지보수(보안 패치) 기간은 확인하지 못했다 — 운영 전환 전 v2 마이그레이션 계획을 별도 검토

### 2.2 토큰 저장 구조 — 게이트웨이 무상태(stateless) 원칙

**게이트웨이는 인증 토큰을 저장하지 않는다.** JWT는 서명·exp·aud·스코프가 토큰 자체에 포함되어 발급 이력 없이 검증 가능하기 때문이다.

| 위치 | 저장 대상 | 비고 |
|---|---|---|
| 클라이언트 | 액세스 + 리프레시 토큰 | `[확인됨]` Claude Code·Cursor는 시스템 키체인에 저장 [4][10] |
| Keycloak | 세션·리프레시 토큰 상태 | 24h 세션 관리, 강제 종료(회수) 처리 |
| 게이트웨이 | **없음** (JWKS 공개키 캐시만) | 매 요청 로컬 검증. 수평 확장 시 상태 공유 불필요 |

게이트웨이에 저장이 필요해지는 예외 (현 설계에서는 모두 해당 없음):
1. 즉시 회수 요구 → 블랙리스트(Redis 등) 조회 필요. 현 설계는 액세스 토큰 1h로 회피
2. RFC 8693 Token Exchange 방식 전환 → 교환 토큰 캐시 필요. 현 설계는 신뢰 헤더 방식
3. 게이트웨이가 AS 겸용(OAuth 프록시) → 코드·토큰 매핑 저장 필요. 현 설계는 Keycloak 분리

**세션 상태 주의:** SDK v1의 Streamable HTTP에서 `Mcp-Session-Id` 세션을 사용하더라도, 인증은 세션 수립 시 1회가 아니라 **매 요청의 Authorization 헤더를 재검증**한다. 세션 ID만으로 인증 상태를 이어가면 세션 ID 탈취 시 권한 우회가 가능하다 — `[추측]` 일반 보안 원칙 기반 판단이며, MCP 스펙의 보안 권고 문서에 세션 하이재킹 관련 내용이 있는 것으로 알고 있으나 직접 확인하지 않았다(`[불확실]`) → Phase 2에서 스펙 보안 섹션 확인 후 반영

### 2.3 구현 계약 (Contracts) — 에이전트 임의 결정 금지 항목

신규 세션의 에이전트가 임의로 정하면 Phase 간 불일치가 생기는 값들을 여기서 고정한다. **변경이 필요하면 코드가 아니라 이 문서를 먼저 갱신한다.**

**(a) 토큰 클레임 계약**

| 용도 | JWT 클레임 | 비고 |
|---|---|---|
| 사용자 식별 (`X-User-Id` 소스) | `sub` | 불변 ID. 감사 로그에는 `preferred_username`도 병기 |
| 스코프 판정 | `scope` (공백 구분 문자열) | `[추측]` Keycloak의 일반 동작 기준. Phase 1에서 실제 토큰 디코딩으로 확정하고, 다르면 본 표를 갱신 |
| audience 검증 | `aud` == 게이트웨이 공개 URL | 아래 (d) 참조 |

**(b) 신뢰 헤더 계약 (게이트웨이 → upstream)**

| 헤더 | 값 형식 | 예시 |
|---|---|---|
| `X-User-Id` | `sub` 클레임 원문 | `f3a1...-uuid` |
| `X-User-Name` | `preferred_username` | `hong.gd` |
| `X-User-Scopes` | 공백 구분, `mcp:` 접두 스코프만 필터해 전달 | `mcp:upstream-a mcp:upstream-b` |

규칙: 인바운드 요청에서 위 3개 헤더는 무조건 strip 후 게이트웨이가 재설정한다.

**(c) upstream 설정 스키마 (`config/upstreams.yaml`)**

```yaml
upstreams:
  - name: upstream-a            # 네임스페이스 접두어로 사용 ({name}__{tool})
    url: http://upstream-a:3001/mcp   # Streamable HTTP 엔드포인트
    scope: mcp:upstream-a       # 접근에 필요한 스코프 (1개)
    description: "테스트용 echo MCP A"
  - name: upstream-b
    url: http://upstream-b:3002/mcp
    scope: mcp:upstream-b
    description: "테스트용 echo MCP B"
```

**(d) 로컬 개발 규약**

| 항목 | 값 |
|---|---|
| 게이트웨이 | `http://localhost:3000/mcp` — 이 URL이 곧 `aud`·RFC 9728 `resource` 값 (완전 일치, 트레일링 슬래시 없음) |
| Keycloak | `http://localhost:8080`, realm `mcp` |
| upstream-a / upstream-b | `:3001` / `:3002`, **Streamable HTTP** (운영과 동일 transport — stdio 금지) |
| 환경변수 | `GATEWAY_PUBLIC_URL`, `KEYCLOAK_ISSUER_URL`, `UPSTREAMS_CONFIG_PATH`, `LOG_LEVEL` |

**(e) 테스트 계정 계약 (realm.json에 고정)**

| 계정 | 그룹 | 보유 스코프 | 용도 |
|---|---|---|---|
| `user-a` | `team-a` | `mcp:upstream-a` 만 | 권한 필터링 검증 (Phase 4) |
| `user-b` | `team-all` | `mcp:upstream-a` + `mcp:upstream-b` | 전체 권한 기준선 |

`[추측]` (b)~(e)의 구체 값은 설계 판단이며 외부 근거가 있는 사항이 아니다. 프로젝트 상황에 맞게 변경 가능하되, 변경 시 문서-코드 동기화를 유지한다.

---

## 3. 저장소 구조 (제안)

```
mcp-gateway/
├── CLAUDE.md                  # 에이전트 규칙 (아래 §6)
├── plan.md                    # 본 문서
├── docs/
│   ├── design-spec.html       # 설계 확정본
│   └── vendor/                # MCP 인가 스펙, SDK 문서, Claude Code MCP 문서 사본
├── docker/
│   ├── docker-compose.yml     # keycloak + upstream-a + upstream-b + gateway
│   └── keycloak/realm.json    # realm 자동 임포트 (스코프·정책 포함)
├── packages/
│   ├── gateway/               # 게이트웨이 본체
│   │   └── src/
│   │       ├── server/        # Streamable HTTP 수신, well-known 엔드포인트
│   │       ├── auth/          # JWT 검증 미들웨어, 스코프 검사
│   │       ├── upstream/      # upstream MCP 클라이언트 풀, tools 캐시
│   │       ├── routing/       # 네임스페이싱, tools/call 라우팅
│   │       └── audit/         # 감사 로그
│   └── dummy-upstream/        # 테스트용 echo MCP 서버
└── tests/
    ├── unit/                  # 토큰 검증, 필터링 로직
    └── e2e/                   # Inspector/스크립트 기반 플로우 테스트
```

`[추측]` 구조는 일반적인 모노레포 관행에 기반한 제안이며 필수는 아니다.

---

## 4. Phase별 구현 계획

각 Phase는 독립적으로 완료·검증 가능하도록 설계했다. **검수 기준(AC)을 통과하기 전에는 다음 Phase로 넘어가지 않는다.**

### Phase 0 — 환경 구축

**작업**
- 모노레포 초기화 (pnpm 또는 npm workspaces), TypeScript, ESLint/Prettier, vitest
- **SDK v1 최신 안정 버전 번호를 npm에서 확인 후 pin** (v1 사용은 확정 — §2.1)
- CLAUDE.md 작성 (§6), `docs/vendor/`에 레퍼런스 문서 저장
- docker-compose: Keycloak(dev mode) + 더미 upstream MCP 2개(echo 툴 각 1개, **Streamable HTTP transport** — §2.3(d))
- Keycloak realm.json 초안: realm `mcp`, 테스트 계정 `user-a`/`user-b`(§2.3(e) 계약대로), client scope `mcp:upstream-a`/`mcp:upstream-b`, 그룹 매핑

**검수 기준(AC)**
- [ ] `docker compose up`으로 전체 스택 기동
- [ ] Keycloak admin 콘솔에서 realm·스코프·그룹 확인
- [ ] 더미 upstream에 MCP Inspector로 직접 연결해 echo 툴 호출 성공

### Phase 1 — OAuth 디스커버리 E2E (최우선 리스크)

**작업**
- 게이트웨이 Streamable HTTP 엔드포인트(`/mcp`) 구현
- 미인증 요청에 `401 + WWW-Authenticate: Bearer resource_metadata="..."` 반환 — `[확인됨]` MCP 인가 스펙의 디스커버리 진입점 [1][6]
- `/.well-known/oauth-protected-resource` (RFC 9728) 메타데이터 엔드포인트 — `resource`는 게이트웨이 URL과 정확히 일치, `authorization_servers`에 Keycloak realm URL [1][6]
- Keycloak 익명 DCR 활성화: `[확인됨]` Keycloak은 기본적으로 Trusted Hosts 화이트리스트가 비어 있어 익명 등록이 사실상 비활성 상태다. Client Registration Policies에서 Trusted Hosts(내부망 대역), Max Clients, Allowed Client Scopes 정책을 구성해야 한다 [8]
- 리다이렉트 정책: `[확인됨]` Claude Code는 RFC 8252 루프백(임시 포트)을 사용하므로 `http://localhost/callback`·`http://127.0.0.1/callback`을 포트 무관 허용 [5]. `[불확실]` Keycloak에서 포트 무관 루프백 허용의 정확한 설정 방법(와일드카드 패턴 등)은 이 Phase에서 실증으로 확정
- PKCE S256 강제
- **aud 클레임 확보 (리스크 항목):** `[추측]` 일반적으로 Keycloak은 기본 설정에서 액세스 토큰의 `aud`에 게이트웨이 URL 같은 임의 audience를 포함하지 않으며, client scope에 **Audience protocol mapper**를 추가해야 하는 것으로 알고 있다. 또한 클라이언트가 보내는 RFC 8707 `resource` 파라미터를 Keycloak이 aud에 반영하는지는 `[불확실]` — 확인하지 못했다. 이 Phase에서 실제 발급 토큰을 디코딩해 aud 포함 여부를 확인하고, 없으면 Audience mapper를 구성한다. **미해소 시 Phase 2의 aud 검증이 전부 실패하므로 Phase 1에서 반드시 해소한다**

**검수 기준(AC)**
- [ ] MCP Inspector "Quick OAuth Flow"로 전체 플로우 통과 [9]
- [ ] **실제 Claude Code에서 `claude mcp add` → `/mcp` → 브라우저 로그인 → 연결 성공** — `[확인됨]` Claude Code의 원격 서버 OAuth는 `/mcp`로 처리 [4]
- [ ] DCR로 생성된 클라이언트가 Keycloak에 등록되고 정책 제약이 적용됨
- [ ] 발급된 액세스 토큰을 디코딩해 `aud`에 게이트웨이 공개 URL(§2.3(d)) 포함, `scope` 클레임에 `mcp:*` 스코프 포함을 확인 — §2.3(a) 계약 확정

> 이 Phase가 통과되면 프로젝트 리스크의 상당 부분이 해소된다. Keycloak-클라이언트 궁합(리다이렉트, DCR 정책)에서 시행착오 가능성이 가장 크다 — `[추측]`

### Phase 2 — JWT 검증 미들웨어

**작업**
- `jose`로 JWKS 원격 조회 + 캐시(TTL 5분 권장 — `[확인됨]` 로컬 JWT 검증 + JWKS 캐시가 일반적 기본값으로 권고됨 [2])
- 서명 + `exp` + `aud` 검증. `[확인됨]` aud 검증 누락은 타 리소스용 토큰 재사용을 허용하는 실제 공격 벡터 [2], 스펙상 MUST [1]
- 실패 시 401, 스코프 부족 시 `403 + WWW-Authenticate: Bearer error="insufficient_scope"` — `[확인됨]` 스펙 정의 응답 [1]
- **매 요청 재검증:** Mcp-Session-Id 세션 사용 여부와 무관하게 모든 요청의 Authorization 헤더를 검증. 세션 ID만으로 인증 상태를 유지하는 코드 경로 금지 (§2.2)
- MCP 스펙의 보안 권고 문서(세션 하이재킹 관련)를 확인하고 요구사항을 이 Phase에 반영 — `[불확실]` 항목 해소

**검수 기준(AC)**
- [ ] 단위 테스트: 정상 / 만료 / 서명 위조 / aud 불일치 / 스코프 부족 각각 검증
- [ ] 유효 토큰으로 `/mcp` 요청 시 통과
- [ ] 유효한 Mcp-Session-Id + 무효/부재 Authorization 헤더 조합의 요청 → 401 (세션만으로 인증 유지 불가 증명)
- [ ] 토큰 검증이 세션 수립 시 1회가 아닌 매 요청 수행됨을 테스트로 증명 (예: 세션 유지 중 토큰 만료 시 다음 요청부터 401)

### Phase 3 — Upstream 애그리게이션

**작업**
- 게이트웨이가 MCP 클라이언트로 upstream 연결 (SDK 클라이언트 라이브러리 [7])
- 설정 파일(`upstreams.yaml` 등)로 upstream 목록·스코프 매핑 선언
- tools/list 수집·캐시 + `{서버명}__{툴명}` 네임스페이싱
- tools/call 수신 시 접두어 파싱 → 대상 upstream으로 프록시
- upstream 연결 실패 시 해당 서버 툴만 제외하고 나머지 정상 서비스 (부분 장애 허용)

**검수 기준(AC)**
- [ ] Claude Code에서 두 upstream의 툴이 접두어와 함께 목록에 보임
- [ ] 각 툴 호출이 올바른 upstream으로 라우팅되어 응답 반환
- [ ] upstream 1개 중단 시 나머지 툴 정상 동작

### Phase 4 — 스코프 기반 권한 제어 (핵심)

**작업**
- tools/list 응답을 토큰 스코프 기준으로 필터링 (미허용 MCP의 툴은 목록에서 제거)
- tools/call 시점 스코프 재검증 (목록 우회 직접 호출 차단) — `[추측]` 이중 검증은 보안 설계 원칙에 기반한 필수 요건으로 판단
- upstream 전달용 신뢰 헤더 `X-User-Id` / `X-User-Scopes` 주입 + **인바운드 동일 헤더 strip** (위조 방지)
- 감사 로그: 사용자 ID · 대상 MCP · 툴명 · 결과 · 타임스탬프 (구조화 JSON)

**검수 기준(AC)**
- [ ] 권한이 다른 두 테스트 계정으로 로그인 → 보이는 툴 목록이 다름
- [ ] 목록에 없는 툴 이름으로 직접 tools/call → 403 insufficient_scope
- [ ] 클라이언트가 `X-User-Scopes` 헤더를 임의 주입해도 무시됨 (테스트로 증명)
- [ ] 감사 로그에 위 시나리오가 모두 기록됨

### Phase 5 — 토큰 수명·재인증 시나리오

**작업**
- Keycloak: Access Token Lifespan 1h / SSO Session·Refresh 24h, `offline_access` 스코프 광고 — `[추측]` 설정 항목명은 Keycloak 일반 지식 기반, 사용 버전 문서로 확인
- `[확인됨]` MCP 스펙상 리프레시 토큰 발급은 AS 재량이며 클라이언트는 발급을 가정하면 안 됨 [1] → Keycloak에서 명시적으로 발급 구성
- 테스트용으로 수명을 2분/5분으로 단축해 검증

**검수 기준(AC)**
- [ ] 액세스 토큰 만료 후 Claude Code가 브라우저 재로그인 **없이** 자동 갱신 — `[확인됨]` Claude Code는 AS가 `offline_access`를 광고하면 자동으로 요청해 갱신한다 [4]. 단, Keycloak 조합에서의 실동작은 여기서 실증
- [ ] 세션(리프레시) 만료 후 401 → Claude Code `/mcp` Re-authenticate로 복구 [4]
- [ ] Keycloak에서 사용자 그룹 제거 → 다음 토큰 갱신 시점부터 해당 스코프 차단

### Phase 6 — 운영 준비

**작업**
- 게이트웨이 컨테이너화, 헬스체크 엔드포인트, 구조화 로깅
- 사내 CA 기반 HTTPS 종단 구성
- upstream 네트워크 격리 (게이트웨이만 접근 가능) + 우회 접근 불가 테스트
- 운영 문서: 신규 upstream 추가 절차, 스코프/그룹 부여 절차, 권한 회수 절차

**검수 기준(AC)**
- [ ] 게이트웨이 외 위치에서 upstream 직접 접근 시도 → 차단 확인
- [ ] HTTPS로 Claude Code 전체 플로우 재검증

### Phase 7 — 나머지 클라이언트 검증

**작업 및 확인 사항**
- **Cursor (IDE):** `[확인됨]` v1.0부터 OAuth 지원, RFC 9728 디스커버리 → 등록 → 브라우저 PKCE [10]. 커스텀 스킴 콜백 `cursor://anysphere.cursor-mcp/oauth/callback` 허용 추가 [11]
- **GitHub Copilot CLI:** `[확인됨]` v0.0.389부터 DCR 기반 OAuth 원격 MCP 지원, CIMD 미지원 [12]. `[확인됨]` `oauth.clientId` 설정을 무시하고 항상 DCR을 수행하는 이슈 존재(2026-04 기준) [13] → DCR 경로로 검증
- ~~Cursor CLI~~ — **스펙아웃 (v1.2에서 범위 제외).** OAuth 지원 여부가 미확인 상태였던 항목으로, 향후 지원 요구가 생기면 지원 여부 확인부터 재개

**검수 기준(AC)**
- [ ] 클라이언트(Cursor, Copilot CLI)별 최초 인증 / 자동 갱신 / 만료 후 재인증 3개 시나리오 통과 여부를 매트릭스로 기록

---

## 5. 일정 감각

`[추측]` agent coding 기준 Phase당 1~3 세션으로 예상하나, Phase 1(Keycloak-클라이언트 궁합)과 Phase 7(클라이언트별 편차)에서 변동 가능성이 크다. 확정적 일정 산출은 Phase 1 완료 후에 하는 것을 권한다.

---

## 6. Agent Coding(Sonnet 4.5) 운영 규칙

### 6.0 선행 준비물 (사람이 세션 시작 전 리포에 배치)

신규 세션은 이 대화의 맥락이 없으므로, 아래가 리포에 있어야 계획이 자기완결적으로 동작한다.

- [ ] `plan.md` (본 문서) — 리포 루트
- [ ] `docs/design-spec.html` (설계 확정본)
- [ ] `docs/vendor/` — §7의 [1](MCP 인가 스펙), [4](Claude Code MCP 문서), [7](SDK v1 문서), [8](Keycloak Client Registration) 사본 저장
- [ ] `CLAUDE.md` 초안 (아래 6.2 규칙 포함) — 없으면 Phase 0의 첫 작업으로 에이전트가 작성

### 6.1 컨텍스트 규칙

**컨텍스트 제공이 필수:** `[추측]` 모델 학습 데이터에 최신 MCP 인가 스펙 개정(2025-11-25, 2026-07-28 RC)이 충분히 포함되지 않았을 가능성이 높다. `docs/vendor/`에 §7의 [1][4][7][8] 문서를 저장하고, 인증 관련 작업 시 반드시 참조하도록 CLAUDE.md에 명시한다.

### 6.2 CLAUDE.md에 고정할 규칙

- 스코프 컨벤션 `mcp:{서버명}` / 네임스페이싱 `{서버명}__{툴명}`
- **§2.3 구현 계약(클레임·헤더·스키마·포트·계정)을 임의 변경 금지 — 변경 필요 시 plan.md 갱신이 선행**
- 신뢰 헤더는 인바운드에서 항상 strip 후 재설정
- aud·exp·서명 검증은 어떤 경로에서도 생략 금지
- SDK 버전 pin 유지, 임의 업그레이드 금지
- 스펙 관련 판단이 필요하면 docs/vendor/ 문서를 먼저 확인

### 6.3 진행 규칙

- **Phase 단위 진행:** 한 세션에 하나의 Phase(또는 그 일부)만. AC 통과를 세션 종료 조건으로 삼는다.
- **테스트 우선:** Phase 2·4는 AC를 테스트 코드로 먼저 작성하게 한 뒤 구현.
- **미해결 항목 갱신:** Phase 진행 중 `[불확실]`/`[추측]` 항목이 해소되면 §7 미해결 표와 해당 본문을 즉시 갱신한다.

---

## 7. 레퍼런스 (출처)

구현 중 참조할 1차 자료. 링크는 2026-07-06 검색 시점 기준 유효.

| # | 자료 | 내용 | URL |
|---|---|---|---|
| [1] | MCP Authorization Specification (공식) | OAuth 2.1 리소스 서버 모델, PKCE·RFC 8707·aud 검증 MUST, 401/403 에러 응답 형식, 리프레시 토큰 지침 | https://modelcontextprotocol.io/specification/draft/basic/authorization |
| [2] | MCP OAuth 2.1 Developer Guide 2026 | JWKS 캐시(5분) 권고, aud 검증 누락 공격 벡터, 게이트웨이 패턴 | https://baeseokjae.github.io/posts/mcp-oauth-authentication-guide-2026/ |
| [3] | MCP 2026-07-28 스펙 RC 공지 (공식 블로그) | stateless 코어, Mcp-Session-Id 제거, Mcp-Method/Mcp-Name 헤더 — sticky session 비의존 설계 근거 | https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/ |
| [4] | Claude Code MCP 공식 문서 | `/mcp` OAuth 플로우, offline_access 자동 갱신, Re-authenticate, 비대화형 모드 제약, WWW-Authenticate 자동 디스커버리 | https://code.claude.com/docs/en/mcp |
| [5] | Claude Connector OAuth (sunpeak) | Claude Code의 RFC 8252 루프백 리다이렉트(포트 무관 localhost/127.0.0.1 허용 필요) | https://sunpeak.ai/blogs/claude-connector-oauth-authentication/ |
| [6] | Upstash — MCP OAuth 구현 딥다이브 | 401 → RFC 9728 메타데이터 → DCR → PKCE 전체 플로우의 실구현 관점 해설, 스펙-현실 불일치 사례 | https://upstash.com/blog/mcp-oauth-implementation |
| [7] | MCP TypeScript SDK (공식) | 서버(Streamable HTTP, auth helpers)·클라이언트(OAuth helpers) 라이브러리, Express 등 미들웨어 패키지, v1/v2 세대 구분(v1 문서: https://ts.sdk.modelcontextprotocol.io/) | https://github.com/modelcontextprotocol/typescript-sdk |
| [8] | Keycloak 공식 문서 — Client Registration Service | OIDC DCR 엔드포인트(`/realms/<realm>/clients-registrations/openid-connect`), 익명 등록은 Trusted Hosts 미설정 시 사실상 비활성, Client Registration Policies(Trusted Hosts/Max Clients/Consent 등) | https://www.keycloak.org/securing-apps/client-registration |
| [9] | Claude Platform Docs — MCP connector | MCP Inspector로 OAuth 플로우 테스트하는 절차 | https://platform.claude.com/docs/en/agents-and-tools/mcp-connector |
| [10] | TrueFoundry — Cursor MCP 인증 | Cursor v1.0 OAuth 지원, RFC 9728 디스커버리·PKCE 플로우 | https://www.truefoundry.com/blog/mcp-authentication-in-cursor-oauth-api-keys-and-secure-configuration |
| [11] | Casdoor — Cursor 연동 가이드 | Cursor 콜백 URL `cursor://anysphere.cursor-mcp/oauth/callback` | https://casdoor.ai/docs/how-to-connect/mcp/connect-cursor/ |
| [12] | GitHub copilot-cli Issue #1305 | v0.0.389 DCR 지원 도입, CIMD 미지원(요청 상태) | https://github.com/github/copilot-cli/issues/1305 |
| [13] | GitHub copilot-cli Issue #2717 | `oauth.clientId` 무시하고 항상 DCR 수행하는 이슈 | https://github.com/github/copilot-cli/issues/2717 |
| [14] | Christian Posta — MCP DCR with Keycloak | Keycloak에서 MCP용 익명 DCR을 실제로 구성한 단계별 사례 (Trusted Hosts·Allowed Client Scopes 정책 설정 포함) | https://blog.christianposta.com/understanding-mcp-authorization-with-dynamic-client-registration/ |

### 미해결 확인 사항 (구현 중 검증)

| 항목 | 검증 Phase |
|---|---|
| SDK v1 최신 안정 버전 번호 확인 및 pin | Phase 0 |
| SDK v1 브랜치의 유지보수(보안 패치) 기간 | Phase 0 |
| Keycloak 포트 무관 루프백 리다이렉트 설정 방법 | Phase 1 |
| Keycloak 액세스 토큰의 aud 포함 여부 (Audience mapper 필요성) 및 RFC 8707 resource 파라미터 반영 여부 | Phase 1 |
| 실제 토큰의 scope 클레임 형식 확정 (§2.3(a) 계약 검증) | Phase 1 |
| MCP 스펙 보안 권고(세션 하이재킹) 문서 확인 및 반영 | Phase 2 |
| Claude Code + Keycloak 조합의 offline_access 자동 갱신 실동작 | Phase 5 |
| Copilot CLI 리프레시 토큰 자동 갱신 동작 | Phase 7 |
