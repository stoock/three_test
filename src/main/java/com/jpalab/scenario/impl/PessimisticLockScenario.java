package com.jpalab.scenario.impl;

import com.jpalab.domain.Product;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class PessimisticLockScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "pessimistic-lock",
                "동시성과 락", 2,
                "비관적 락 (PESSIMISTIC_WRITE) — 락 경합 체험 ⚠",
                "SELECT ... FOR UPDATE로 행을 잠그고, 다른 트랜잭션이 대기하다 타임아웃 나는 것을 확인합니다.",
                """
                **비관적 락(Pessimistic Lock)** 은 "충돌이 자주 일어난다"고 가정하고, 조회 시점에 \
                **데이터베이스의 행 잠금**을 거는 방식입니다.

                - `LockModeType.PESSIMISTIC_WRITE`: 배타 락. SQL로 `SELECT ... FOR UPDATE` 가 실행되며, 커밋/롤백까지 다른 트랜잭션의 수정(및 FOR UPDATE 조회)을 차단합니다. 가장 많이 사용.
                - `LockModeType.PESSIMISTIC_READ`: 공유 락 (`FOR SHARE`). 읽기는 허용, 수정은 차단.
                - `PESSIMISTIC_FORCE_INCREMENT`: 비관적 락 + 버전 증가.

                다른 트랜잭션이 이미 락을 잡고 있으면 후속 트랜잭션은 **대기**하다가, 락 타임아웃이 지나면 \
                `PessimisticLockException` 또는 `LockTimeoutException` 이 발생합니다. \
                대기 시간은 `jakarta.persistence.lock.timeout` 힌트로 지정할 수 있습니다 \
                (DB별 지원 여부가 다르며, Oracle/PostgreSQL은 NOWAIT/SKIP LOCKED 등 정밀 제어 가능).

                낙관적 락과의 비교: 낙관적 락은 커밋 시점에 충돌을 **감지**(실패 후 재시도), \
                비관적 락은 시작 시점에 충돌을 **차단**(대기 후 순차 처리)합니다.
                """,
                """
                - 선택 기준: 충돌이 드물면 낙관적 락(처리량 우위), 충돌이 잦고 재시도 비용이 크면 비관적 락(안정성 우위). 재고 차감처럼 "반드시 순차 처리"가 필요한 핫스팟은 비관적 락이 단순하고 확실합니다.
                - **데드락 주의**: 두 트랜잭션이 서로 다른 순서로 여러 행을 잠그면 데드락이 납니다. 항상 **일정한 순서(예: ID 오름차순)로 잠그는 규칙**을 지키세요.
                - 락을 잡은 트랜잭션은 최대한 짧게! 락 보유 중 외부 API 호출 같은 느린 작업을 하면 전체 시스템이 줄줄이 대기합니다.
                - 타임아웃을 반드시 설정하세요. 무한 대기는 커넥션 풀 고갈로 이어집니다.
                """,
                """
                - Spring Data JPA 사용 시: `@Lock(LockModeType.PESSIMISTIC_WRITE)` 를 리포지토리 메서드에 붙이고, `@QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))` 으로 타임아웃을 함께 지정하는 것이 표준 패턴입니다.
                - 대표 활용: 재고 차감, 계좌 이체(출금 계좌 잠금), 순번 채번. "조회 → 검증 → 차감"을 한 트랜잭션에서 FOR UPDATE로 묶습니다.
                - 작업 큐 폴링에는 `SKIP LOCKED` (PostgreSQL/Oracle/MySQL 8+)가 유용합니다 — 잠긴 행은 건너뛰고 다음 작업을 가져와 여러 워커가 경합 없이 분산 처리합니다.
                - 단일 DB를 넘어서는 분산 환경(다중 서비스, 샤딩)에서는 DB 락 대신 Redis(Redisson) 분산락이나 메시지 큐 직렬화로 풀어야 합니다.
                """,
                """
                // 트랜잭션 A: 행 잠금
                Product p = em.find(Product.class, id, LockModeType.PESSIMISTIC_WRITE);
                // SQL: select ... from product where id=? for update
                p.removeStock(1);   // 잠근 상태에서 안전하게 검증/차감
                tx.commit();        // 커밋 시 락 해제

                // 트랜잭션 B (A가 커밋하기 전):
                em2.find(Product.class, id, LockModeType.PESSIMISTIC_WRITE,
                         Map.of("jakarta.persistence.lock.timeout", 0));
                // A가 락을 쥐고 있으므로 대기 → 타임아웃
                // ❌ PessimisticLockException / LockTimeoutException
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        Long[] productId = new Long[1];

        ctx.inTx("1) PESSIMISTIC_WRITE 조회 — SELECT ... FOR UPDATE", em -> {
            Product product = em.createQuery("select p from Product p where p.name = '노트북'", Product.class)
                    .getSingleResult();
            productId[0] = product.getId();
            Product locked = em.find(Product.class, productId[0], LockModeType.PESSIMISTIC_WRITE);
            ctx.log("SQL 끝에 'for update' 가 붙은 것을 확인하세요.");
            locked.removeStock(1);
            ctx.log("락을 쥔 상태에서 재고 차감: " + locked.getStockQuantity() + "개 남음 → 커밋과 함께 락 해제");
        });

        ctx.step("2) 락 경합 체험 — 트랜잭션B가 대기하다 타임아웃 ❌", () -> {
            EntityManager emA = ctx.newEntityManager();
            EntityManager emB = ctx.newEntityManager();
            try {
                emA.getTransaction().begin();
                emA.find(Product.class, productId[0], LockModeType.PESSIMISTIC_WRITE);
                ctx.log("트랜잭션A가 노트북 행에 FOR UPDATE 락을 잡고 커밋하지 않고 있습니다...");

                emB.getTransaction().begin();
                ctx.log("트랜잭션B가 같은 행에 FOR UPDATE 조회 시도 → 락 대기 → 타임아웃!");
                emB.find(Product.class, productId[0], LockModeType.PESSIMISTIC_WRITE,
                        Map.of("jakarta.persistence.lock.timeout", 0));
                ctx.log("여기는 실행되지 않습니다.");
            } finally {
                if (emA.getTransaction().isActive()) {
                    emA.getTransaction().rollback();
                }
            }
        });

        ctx.note("정리",
                "비관적 락은 '대기'가 본질입니다. 락을 짧게 쥐고, 타임아웃을 설정하고, 잠그는 순서를 통일하세요.",
                "충돌이 드물면 낙관적 락(@Version), 잦으면 비관적 락 — 이것이 선택의 출발점입니다.");
    }
}
