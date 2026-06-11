package com.jpalab.scenario.impl;

import com.jpalab.domain.Product;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Component;

@Component
public class OptimisticLockScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "optimistic-lock",
                "동시성과 락", 1,
                "낙관적 락 (@Version) — 충돌 체험 ⚠",
                "두 사용자가 같은 상품을 동시에 수정할 때 나중에 커밋하는 쪽이 실패하는 것을 직접 확인합니다.",
                """
                **낙관적 락(Optimistic Lock)** 은 "충돌은 드물게 일어난다"고 가정하고, DB 락 대신 \
                **버전 비교**로 충돌을 감지하는 JPA 표준 기능입니다.

                엔티티에 `@Version` 필드(int, Long, Timestamp 등)를 추가하면:
                1. 엔티티를 수정해 커밋할 때 `UPDATE ... SET version = version + 1 WHERE id = ? AND version = 조회시점버전` 으로 실행됩니다.
                2. 그 사이 누군가 먼저 수정해서 버전이 올라갔다면 WHERE 조건이 맞지 않아 **0건 업데이트** 가 됩니다.
                3. Hibernate는 이를 감지해 `OptimisticLockException` (Spring 변환 시 `ObjectOptimisticLockingFailureException`) 을 던지고 트랜잭션은 롤백됩니다.

                즉, **먼저 커밋한 사람이 이기고(first-commit wins), 나중에 커밋하는 사람은 실패**합니다. \
                두 번째 수정이 첫 번째 수정을 조용히 덮어쓰는 **두 번의 갱신 분실(lost update) 문제**를 막아줍니다.

                락 모드를 명시할 수도 있습니다: `OPTIMISTIC`(조회만 해도 커밋 시 버전 검증), \
                `OPTIMISTIC_FORCE_INCREMENT`(연관 엔티티 수정 시 루트 버전 강제 증가) 등.
                """,
                """
                - `@Version` 컬럼은 비용이 거의 없으므로 **수정 가능성이 있는 핵심 엔티티에는 기본으로 달아두는 것**을 권장합니다.
                - 예외를 잡아서 어떻게 할지가 진짜 설계입니다: (1) 사용자에게 "다른 사용자가 먼저 수정했습니다. 새로고침 후 다시 시도하세요" 안내, (2) 재시도(retry) 로직, (3) 필드 단위 병합 — 도메인 요구에 따라 선택하세요.
                - 버전 필드를 애플리케이션에서 직접 수정하면 안 됩니다. JPA가 관리합니다.
                - 재시도는 **새 트랜잭션에서 엔티티를 다시 조회**한 뒤 수행해야 합니다. 실패한 영속성 컨텍스트를 재사용하면 안 됩니다.
                """,
                """
                - 운영 활용 예: 재고 차감, 포인트 적립/사용, 좌석 선점, 게시글 동시 수정 방지 등 **충돌 빈도가 낮은 동시 수정** 보호에 가장 널리 쓰입니다.
                - 재시도 패턴: `@Retryable(retryFor = ObjectOptimisticLockingFailureException.class, maxAttempts = 3)` (Spring Retry) 또는 파사드 계층에서 수동 루프. 트랜잭션 경계 **바깥**에서 재시도해야 한다는 점이 핵심입니다.
                - 충돌이 자주 일어나는 핫스팟(선착순 쿠폰, 인기 상품 재고)이라면 낙관적 락은 재시도 폭풍을 일으킵니다. 비관적 락, DB 원자적 UPDATE(`set stock = stock - 1 where stock >= 1`), 또는 Redis 분산락/큐로 전환을 검토하세요.
                - REST API에서 같은 개념: `ETag` + `If-Match` 헤더로 버전을 주고받으면 클라이언트까지 포함한 낙관적 동시성 제어가 됩니다.
                """,
                """
                @Entity
                class Product {
                    @Version
                    private int version;  // 이것만 추가하면 끝
                }

                // 사용자 1, 2가 같은 상품을 각자의 트랜잭션에서 조회 (둘 다 version=0)
                Product p1 = em1.find(Product.class, id);
                Product p2 = em2.find(Product.class, id);

                p1.setPrice(1_400_000);
                tx1.commit(); // UPDATE ... SET version=1 WHERE id=? AND version=0 → 성공

                p2.setPrice(1_300_000);
                tx2.commit(); // UPDATE ... WHERE id=? AND version=0 → 0건! 버전이 이미 1
                // ❌ OptimisticLockException — 두 번의 갱신 분실 방지!
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        EntityManager em1 = ctx.newEntityManager();
        EntityManager em2 = ctx.newEntityManager();
        Product[] p1 = new Product[1];
        Product[] p2 = new Product[1];

        ctx.step("1) 사용자A와 사용자B가 같은 상품을 동시에 조회", () -> {
            em1.getTransaction().begin();
            em2.getTransaction().begin();
            p1[0] = em1.createQuery("select p from Product p where p.name = '노트북'", Product.class)
                    .getSingleResult();
            p2[0] = em2.createQuery("select p from Product p where p.name = '노트북'", Product.class)
                    .getSingleResult();
            ctx.log("사용자A가 본 상품: " + p1[0]);
            ctx.log("사용자B가 본 상품: " + p2[0]);
            ctx.log("둘 다 version=" + p1[0].getVersion() + " 인 같은 행을 보고 있습니다.");
        });

        ctx.step("2) 사용자A가 먼저 가격 수정 후 커밋 — 성공, version 증가", () -> {
            p1[0].setPrice(1_400_000);
            em1.getTransaction().commit();
            ctx.log("UPDATE의 WHERE 절에 'version=?' 조건이 포함된 것을 확인하세요.");
            ctx.log("커밋 성공 → version이 " + p1[0].getVersion() + " 로 증가");
        });

        ctx.step("3) 사용자B도 가격 수정 후 커밋 시도 ❌ OptimisticLockException", () -> {
            p2[0].setPrice(1_300_000);
            ctx.log("사용자B는 여전히 옛 버전을 기준으로 UPDATE를 시도합니다...");
            em2.getTransaction().commit(); // 예외 발생!
            ctx.log("여기는 실행되지 않습니다.");
        });

        ctx.inTx("4) 최종 상태 확인 — 먼저 커밋한 사용자A의 변경만 반영", em -> {
            Product product = em.createQuery("select p from Product p where p.name = '노트북'", Product.class)
                    .getSingleResult();
            ctx.log("최종 상태: " + product);
            ctx.log("사용자B의 변경(1,300,000원)이 사용자A의 변경을 조용히 덮어쓰는 사고를 막았습니다.");
            ctx.log("실무에서는 이 예외를 잡아 '다시 시도해 주세요' 안내 또는 재시도 로직으로 처리합니다.");
        });
    }
}
