# 불멸의 연대기 (Immortal Chronicle)

[hasanharman/isomiddleearth](https://github.com/hasanharman/isomiddleearth)의
아이소메트릭 스타일과 기술 스택(Next.js · React · TypeScript · Zustand · Tailwind)을
바탕으로 만든 **불멸자 라이프 시뮬레이션**입니다.

고대 농경 사회에서 태어난 캐릭터가 엘프처럼 영원히 살며, 선택한 성향에 따라
성장하고, 기술 발전과 함께 끝없는 초미래까지 나아가는 과정을 **관전**합니다.

## 요구사항 매핑

| 요구사항 | 구현 |
| --- | --- |
| 캐릭터 추가 + 성향 선택 | `CharacterCreation` — 이름 입력 후 7가지 성향(탐험가/학자/전사/장인/상인/신비주의자/지도자) 선택 |
| 성장하지만 무한히 사는 캐릭터 | `Character.age`가 상한 없이 증가, 죽음 없음 (엘프형 불멸) |
| 성향 기반 성장 | 각 성향의 `growth`/`techAffinity`가 능력치·기술 발전 속도에 반영 (`simulation.ts`) |
| 중요 선택 로그 + 시점 사진 | 모든 시대 진입·중요 선택이 `LogEntry`로 기록되며, 그 순간의 아이소메트릭 장면을 SVG "사진"으로 캡처 (`scene.ts → captureSnapshot`) |
| 시간 흐름 조정 (멈춤/보통/배속 최대 1000배) | `TimeControls` + `useGameClock` (멈춤·보통·5·25·100·1000배) |
| 저장 기능 | Zustand `persist`로 localStorage 자동 저장(쓰기 스로틀링) + 수동 저장 버튼 |
| 새 캐릭터 시 처음부터 | "새 캐릭터" 버튼이 상태를 초기화하고 생성 화면으로 복귀 |
| 고대 농경 ~ 끝없는 초미래 | `eras.ts` — 10개 명명 시대 + 그 이후 초미래 세대를 무한 생성 |

## 시대 흐름

고대 농경 → 청동기 → 고전 문명 → 중세 → 르네상스 → 산업 혁명 → 근대 도시 →
정보화 → 우주 → 초미래 → 초미래 II, III … (무한)

기술 수준(`techLevel`)은 캐릭터의 지식·창의력·정신과 성향의 기술 친화도에 따라
상승하며, 100포인트마다 다음 시대로 진입합니다. 시간을 가속할수록 문명이
가속도로 발전하는 모습을 볼 수 있습니다.

## 시나리오 시스템 (기획자 리뷰 반영)

게임 시나리오 기획자 검증 의견을 바탕으로 다음을 보강했습니다.

- **사건 다양성**: 매 사건은 ① 게임이론 의사결정 ② 시대별 플레이버 이벤트
  (`events.ts`의 `EPOCH_EVENTS`, 농경~초미래 9개 시대군) ③ 성향 테마 이벤트
  (`disposition.themes` 실사용) ④ 라이벌 관계 이벤트 중 하나로 생성됩니다.
- **사건 고갈 방지**: 이벤트 간격(`choiceInterval`)에 상한(최대 20년)을 두고
  `nextChoiceAge`로 O(1) 스케줄링 — 수백만 년이 흘러도 사진/사건이 끊기지 않음.
- **라이벌/인연 시스템**: 시대를 가로질러 다시 만나는 인물들과 반복 게임(팃포탯,
  죄수의 딜레마)을 벌이며 호감도가 벗(🤝)~숙적(⚔️)으로 변합니다 (`strategy.ts`).
- **이정표(업적)**: 천 년 생존, 우주 진출, 초월, 영토 13×13, 능력치 1천/1만 돌파 등
  `MILESTONES` 달성 시 사진과 함께 기록됩니다.
- **신비주의자 구제**: `정신`이 `techRate`에 기여하고 게임 결과(운명)를 유리하게
  보정(`spiritEdge`)하여 모든 성향이 유효합니다. 성향 간 기술 진행 격차도 완화.
- **영토 확장 재설계**: 시대 종속을 풀고 문명 지수가 임계(`1.4^n`)를 넘을 때마다
  확장 — 최대 13×13까지 도달 가능.
- **카오스 시각화**: 로지스틱 사상 '운명' 상태를 스탯 게이지와 장면 날씨 틴트로 표시.
  로그 보관 상한 240, 카테고리 필터(전체/이정표/사건/선택/인연) 제공.

## 실행

```bash
npm install
npm run dev      # 개발 서버 (http://localhost:3000)
npm run build    # 프로덕션 빌드
npm run start    # 프로덕션 서버
```

## 구조

```
src/
  app/                 Next.js App Router (layout, page)
  components/
    Game.tsx           전체 오케스트레이션 + 저장/새 캐릭터
    CharacterCreation  캐릭터 생성 (이름 + 성향)
    IsoScene           실시간 아이소메트릭 관전 화면
    StatsPanel         능력치 / 시대 / 진행도
    TimeControls       시간 흐름 제어
    EventLog           사진이 포함된 연대기 기록 + 확대 보기
  hooks/useGameClock   requestAnimationFrame 기반 시간 엔진
  lib/
    types.ts           도메인 타입
    dispositions.ts    성향 정의
    eras.ts            시대 정의 + 무한 미래 생성
    simulation.ts      성장/시대/선택 틱 엔진
    events.ts          중요 선택 이벤트 생성
    scene.ts           아이소메트릭 SVG 렌더 + 스냅샷("사진") 캡처
  store/gameStore.ts   Zustand 상태 + localStorage 영속화
```
