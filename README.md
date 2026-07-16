# html-presentation-wiki — HTML 프리젠테이션을 Confluence/위키에 발행하는 Agent Skill

HTML 프리젠테이션 파일(reveal.js, impress.js, Marp, deck.js, Shower 등 단일
HTML 슬라이드 덱)을 **Confluence**(Cloud/Server/DC) 또는 **GitHub Wiki**에
업로드하고, 페이지·첨부파일·인덱스를 자동으로 구성해 주는
[Agent Skill](https://agentskills.io)입니다. 여러 파일 **배치 업로드**를
지원합니다.

## Confluence에 발행 (기본 타깃)

### 알아둘 핵심 사실

- Confluence는 HTML 첨부파일을 보안상 **강제 다운로드**로 서빙합니다
  (인라인 렌더링 안 됨). Cloud는 HTML 매크로 자체가 제거되었습니다.
- 그래서 이 스킬의 발행 패턴은: **첨부파일 업로드 + 다운로드 링크와
  메타데이터가 담긴 페이지 생성**입니다. 덱이 외부(GitHub Pages, S3 등)에도
  호스팅되어 있다면 `--embed-url`로 **iframe 매크로 인라인 임베드**를
  추가할 수 있습니다.

### 인증 설정

```bash
export CONFLUENCE_BASE_URL="https://yoursite.atlassian.net/wiki"  # Cloud는 /wiki 포함
export CONFLUENCE_EMAIL="you@example.com"
export CONFLUENCE_API_TOKEN="..."   # https://id.atlassian.com → Security → API tokens
# Server/Data Center는 대신:
export CONFLUENCE_PAT="..."         # Personal Access Token
```

### 사용

Claude Code에서 자연어로:

> "덱 3개를 컨플루언스 DOCS 스페이스에 올려줘"

또는 직접 실행:

```bash
# 계획만 미리보기 (API 호출 없음)
python3 skills/html-presentation-wiki/scripts/publish_to_confluence.py \
  deck1.html deck2.html --space DOCS --dry-run

# 발행 — 파일마다 페이지 생성/업데이트 + 첨부 업로드
python3 skills/html-presentation-wiki/scripts/publish_to_confluence.py \
  deck1.html deck2.html --space DOCS

# 단일 파일 + 외부 호스팅 URL 인라인 임베드
python3 skills/html-presentation-wiki/scripts/publish_to_confluence.py \
  deck.html --space DOCS --title "Q3 리뷰" \
  --embed-url "https://you.github.io/repo/deck.html"
```

- 페이지들은 자동 생성되는 **"HTML Presentations"** 인덱스 페이지 아래에
  중첩되고, 인덱스는 children 매크로로 스스로 유지됩니다.
- **같은 제목으로 재발행하면 업데이트**(페이지 버전 증가, 첨부 교체)됩니다.
- 주요 옵션: `--parent-title`/`--parent-id`(부모 지정), `--description`,
  `--force`(로컬 참조 경고 무시), `--dry-run`.

## GitHub Wiki에 발행 (보조 타깃)

```bash
bash skills/html-presentation-wiki/scripts/publish_to_wiki.sh \
  --file deck.html --title "Q3 아키텍처 리뷰"
```

위키 git 저장소에 push하고 htmlpreview/raw.githack 뷰어 링크가 담긴 페이지와
`Presentations` 인덱스를 생성합니다(공개 리포 전용 뷰어, 비공개는
`--private`). 자세한 내용은 `references/github-wiki.md`.

## 설치

**플러그인으로 설치 (권장)** — Claude Code에서:

```
/plugin marketplace add stoock/three_test
/plugin install html-presentation-wiki@html-presentation-wiki-skill
```

**수동 설치**:

```bash
cp -r skills/html-presentation-wiki ~/.claude/skills/          # 개인 스킬
cp -r skills/html-presentation-wiki <repo>/.claude/skills/     # 프로젝트 스킬
```

## 구조

```
skills/html-presentation-wiki/
├── SKILL.md                          # 에이전트용 지침 (타깃 선택 → 검사 → 발행)
├── scripts/
│   ├── inspect_presentation.py      # 프레임워크 감지(5종), 슬라이드 수,
│   │                                #   업로드 시 깨질 로컬 참조 사전 검출
│   ├── publish_to_confluence.py     # REST API: 페이지 생성/업데이트,
│   │                                #   첨부 업로드/교체, 배치, dry-run
│   ├── publish_to_wiki.sh           # GitHub Wiki: clone→발행→push(재시도)
│   └── generate_wiki_page.py        # GitHub Wiki 페이지+인덱스 생성
├── references/
│   ├── confluence.md                # Cloud/DC 차이, API, 트러블슈팅 표
│   ├── github-wiki.md               # 위키 git 메커니즘, 트러블슈팅 표
│   └── hosting-options.md           # 인라인 뷰 전략 (GitHub Pages 등)
└── assets/
    └── page-template.md             # GitHub Wiki 페이지 템플릿
```

## 지원하는 프리젠테이션 프레임워크

검사 스크립트가 자동 감지합니다 — 별도 옵션이 필요 없습니다:

| 프레임워크 | 감지 방식 | 슬라이드 수 |
|-----------|----------|------------|
| reveal.js | `.reveal` 클래스 / `Reveal.initialize` | `<section>` 수 |
| impress.js | `#impress` / `impress().init` | `.step` 수 |
| Marp | marpit 마커 | `<section>` 수 |
| deck.js / Shower | 컨테이너 클래스 | `.slide` 수 |
| 그 외 | generic-html로 발행 (경고만 출력) | best-effort |

단, **자체 포함(self-contained) HTML**이어야 합니다 — `./img/...` 같은 로컬
파일 참조는 단일 파일 업로드 시 깨지므로 검사 단계에서 차단됩니다
(CDN `https://` 참조는 괜찮습니다).

## 참고한 오픈소스

- [anthropics/skills](https://github.com/anthropics/skills) — Agent Skills 스펙 및 skill-creator 모범 사례
- [ryanbbrown/revealjs-skill](https://github.com/ryanbbrown/revealjs-skill) — 스킬/플러그인 배포 구조
- [htmlpreview.github.com](https://github.com/htmlpreview/htmlpreview.github.com) — GitHub용 HTML 뷰어 프록시

## 라이선스

MIT
