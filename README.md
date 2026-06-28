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

기술 수준(`techLevel`)은 캐릭터의 지식·창의력과 성향의 기술 친화도에 따라
상승하며, 100포인트마다 다음 시대로 진입합니다. 시간을 가속할수록 문명이
가속도로 발전하는 모습을 볼 수 있습니다.

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
