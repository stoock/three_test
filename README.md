# html-presentation-wiki — HTML 프리젠테이션을 GitHub Wiki에 발행하는 Agent Skill

HTML 프리젠테이션 파일(reveal.js, impress.js, Marp 등 단일 HTML 슬라이드 덱)을
GitHub Wiki에 업로드하고, 클릭 한 번으로 볼 수 있는 위키 페이지와 인덱스를
자동으로 만들어 주는 [Agent Skill](https://agentskills.io)입니다.

## 동작 원리

GitHub Wiki는 그 자체가 git 저장소(`<owner>/<repo>.wiki.git`)입니다. 하지만
위키에 올린 `.html` 파일의 raw URL은 `text/plain`으로 서빙되어 브라우저에서
렌더링되지 않습니다. 이 스킬은 다음과 같이 해결합니다.

1. HTML 파일을 위키 저장소의 `presentations/` 아래로 push
2. 프리젠테이션별 위키 페이지 생성 — [htmlpreview.github.io](https://github.com/htmlpreview/htmlpreview.github.com)
   / raw.githack.com 뷰어 링크(공개 리포), 다운로드 링크, 메타데이터 포함
3. `Presentations` 인덱스 페이지 자동 갱신 (마커 기반, 최신순 정렬)

## 설치

**플러그인으로 설치 (권장)** — Claude Code에서:

```
/plugin marketplace add stoock/three_test
/plugin install html-presentation-wiki@html-presentation-wiki-skill
```

**수동 설치** — 스킬 폴더를 복사:

```bash
# 개인 스킬 (모든 프로젝트에서 사용)
cp -r skills/html-presentation-wiki ~/.claude/skills/

# 또는 프로젝트 스킬 (해당 리포에서만)
cp -r skills/html-presentation-wiki <your-repo>/.claude/skills/
```

## 사용법

Claude Code에서 자연어로 요청하면 스킬이 자동으로 트리거됩니다:

> "deck.html 프리젠테이션을 wiki에 올려줘"

스크립트를 직접 실행할 수도 있습니다:

```bash
# 1) 업로드 전 검사 (프레임워크 감지, 로컬 파일 참조 확인 등)
python3 skills/html-presentation-wiki/scripts/inspect_presentation.py deck.html

# 2) 발행 (origin에서 리포 자동 감지)
bash skills/html-presentation-wiki/scripts/publish_to_wiki.sh \
  --file deck.html --title "Q3 아키텍처 리뷰" --description "한 줄 요약"
```

주요 옵션: `--repo owner/name`(리포 지정), `--private`(비공개 리포 — 뷰어 링크
생략), `--page-name`(위키 페이지 이름 지정), `--force`(로컬 참조 경고 무시).

## 구조

```
skills/html-presentation-wiki/
├── SKILL.md                          # 스킬 본문 (에이전트용 지침)
├── scripts/
│   ├── inspect_presentation.py      # 프레임워크/제목/슬라이드 수/깨질 참조 검사
│   ├── generate_wiki_page.py        # 위키 페이지 + 인덱스 생성
│   └── publish_to_wiki.sh           # clone → 복사 → 생성 → commit → push(재시도)
├── references/
│   ├── github-wiki.md               # 위키 git 메커니즘, 트러블슈팅 표
│   └── hosting-options.md           # 뷰어 프록시 vs GitHub Pages vs 타 위키
└── assets/
    └── page-template.md             # 위키 페이지 템플릿
```

## 알아둘 것

- **위키 초기화**: 위키 git 저장소는 웹 UI에서 첫 페이지를 만든 뒤에야
  생성됩니다. clone 실패 시 스크립트가 안내 메시지를 출력합니다.
- **뷰어 링크는 공개 리포 전용**: 비공개 리포는 `--private`으로 다운로드 전용
  페이지를 만들거나, GitHub Pages 호스팅을 권장합니다
  (`references/hosting-options.md` 참고).
- **자체 포함(self-contained) HTML 권장**: 로컬 파일(`./img/...`)을 참조하는
  덱은 단일 파일 업로드 시 깨집니다. 검사 스크립트가 미리 잡아냅니다.
- **업데이트**: 같은 제목으로 다시 발행하면 기존 파일과 페이지를 덮어씁니다.

## 참고한 오픈소스

- [anthropics/skills](https://github.com/anthropics/skills) — Agent Skills 스펙 및 skill-creator 모범 사례
- [ryanbbrown/revealjs-skill](https://github.com/ryanbbrown/revealjs-skill) — 스킬/플러그인 배포 구조
- [htmlpreview.github.com](https://github.com/htmlpreview/htmlpreview.github.com) — HTML 뷰어 프록시

## 라이선스

MIT
