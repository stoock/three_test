# ⚡ JPA Lab — 실행하며 배우는 JPA

눈으로만 읽는 학습이 아니라, **실제 JPA 코드를 버튼 한 번으로 실행**해서 어떤 SQL이 나가는지,
언제 예외가 터지는지를 직접 확인하는 학습 웹앱입니다.

## 실행 방법

```bash
./mvnw spring-boot:run   # 또는 mvn spring-boot:run
```

브라우저에서 **http://localhost:8080** 접속.

- DB는 인메모리 H2라서 별도 설치가 필요 없고, 재시작하면 초기화됩니다.
- H2 콘솔: http://localhost:8080/h2-console (JDBC URL: `jdbc:h2:mem:jpalab`, 사용자: `sa`)

## 무엇을 배우나

각 시나리오는 3개 탭(📖 개념 설명+다이어그램 / 💡 실무 가이드(실무 팁·운영 활용) / 💻 핵심 코드)과
**▶ 실행하기** 버튼을 제공합니다. 실행 버튼은 서버에 준비된 시나리오 코드를 실제로 실행하며
(핵심 코드 탭은 그 요약), 데이터 초기화 후 단계별로 수행되어
각 단계의 **실제 실행된 SQL**과 **발생한 예외**(타입 + 원인 체인)가 그대로 표시됩니다.

| 카테고리 | 시나리오 |
|---|---|
| 영속성 컨텍스트 | 1차 캐시 · 변경 감지 · 쓰기 지연/플러시 · 준영속과 merge의 함정 |
| 연관관계 매핑 | 연관관계의 주인 · cascade/orphanRemoval · 임베디드 타입과 상속 매핑 |
| 지연 로딩과 성능 | 프록시 · **LazyInitializationException 체험 ⚠** · **N+1 체험 ⚠** · 페치 조인/EntityGraph · 페이징 |
| 동시성과 락 | **낙관적 락 충돌 체험 ⚠** · **비관적 락 타임아웃 체험 ⚠** |
| JPQL과 벌크 연산 | **벌크 연산과 1차 캐시 불일치 체험 ⚠** |

⚠ 표시는 일부러 예외와 잘못된 방식을 발생시키는 체험형 시나리오입니다.

## 🧪 스크래치 패드

JPQL / 네이티브 SQL을 자유롭게 입력해 실행할 수 있습니다.

- 결과 테이블, 실제 실행된 SQL, 예외 체인을 그대로 보여줍니다.
- 예제 칩 제공 (❌ 표시는 의도적으로 실패하는 예외 체험 예제)
- 엔티티 레퍼런스 패널로 엔티티/필드명을 확인하며 작성
- **데이터 초기화** 버튼으로 언제든 처음 상태로 복원

## 학습용 도메인 모델

```
Team 1 ── N Member (양방향, 지연 로딩)        Member.address = 임베디드 타입(Address)
Order 1 ── N OrderItem N ── 1 Product        Order→OrderItem: cascade ALL + orphanRemoval
Item ◁── Book / Album                         SINGLE_TABLE 상속 (dtype)
Product.version                               @Version 낙관적 락
```

## 구조

```
src/main/java/com/jpalab/
├── domain/          # 학습용 엔티티
├── scenario/        # Scenario 인터페이스 + 문서 모델
│   └── impl/        # 15개 학습 시나리오 (설명 + 실행 코드)
├── support/         # SQL 캡처(StatementInspector), 시나리오 실행 컨텍스트
├── service/         # 데이터 초기화
└── web/             # 시나리오/스크래치패드/스키마 API
src/main/resources/static/   # 프론트엔드 (순수 HTML/CSS/JS)
```

새 시나리오를 추가하려면 `scenario/impl` 에 `Scenario` 구현체를 `@Component` 로 등록하면
사이드바에 자동으로 나타납니다.
