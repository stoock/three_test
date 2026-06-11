package com.jpalab.scenario.impl;

import com.jpalab.domain.Member;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class BulkOperationsScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "bulk-operations",
                "JPQL과 벌크 연산", 1,
                "벌크 연산과 영속성 컨텍스트 불일치 ⚠",
                "벌크 UPDATE가 영속성 컨텍스트를 무시하고 DB를 직접 수정해서 생기는 데이터 불일치를 체험합니다.",
                """
                **벌크 연산**은 JPQL의 `update` / `delete` 문으로 여러 행을 **쿼리 한 번에** 수정/삭제하는 \
                기능입니다 (`executeUpdate()` 로 실행, 영향받은 행 수 반환).

                변경 감지는 엔티티를 모두 로딩한 뒤 행마다 UPDATE를 실행하므로 대량 수정에 비효율적입니다. \
                100만 건의 가격을 10% 올린다면 벌크 연산이 답입니다.

                **가장 중요한 특징이자 함정**: 벌크 연산은 **영속성 컨텍스트를 거치지 않고 DB에 직접 실행**됩니다.
                - 1차 캐시에 이미 로딩된 엔티티는 벌크 연산의 결과를 **모릅니다** (옛날 값 그대로).
                - 이후 그 엔티티를 사용하면 DB와 다른 값으로 로직이 수행되는 정합성 버그가 생깁니다.

                해결: 벌크 연산 직후 **`em.clear()`** 로 영속성 컨텍스트를 비우고, 필요한 엔티티는 다시 조회합니다. \
                (또는 벌크 연산을 트랜잭션에서 가장 먼저 실행)
                """,
                """
                - 벌크 연산 후 `clear()` 는 선택이 아니라 **필수 습관**입니다. Spring Data JPA에서는 `@Modifying(clearAutomatically = true)` 가 같은 역할을 합니다 (`flushAutomatically = true` 도 함께 검토).
                - 벌크 연산도 실행 직전에 자동 플러시는 됩니다 — 하지만 실행 **후** 1차 캐시를 갱신해 주지는 않는다는 게 함정입니다.
                - 벌크 UPDATE는 `@Version` 을 자동 증가시키지 않습니다. 낙관적 락을 쓰는 엔티티라면 `update ... set m.version = m.version + 1` 을 직접 포함하거나 충돌 가능성을 검토하세요.
                - JPQL 벌크 연산은 영속성 전이(cascade)도 무시합니다. `delete from Order` 를 해도 OrderItem은 지워지지 않아 FK 제약 위반이 납니다 — 자식부터 지우세요.
                """,
                """
                - 운영 활용 예: 휴면 회원 일괄 전환, 만료 쿠폰 일괄 비활성화, 특정 조건 데이터 마이그레이션. "조건에 맞는 전 행을 같은 규칙으로" 바꿀 때 벌크가 정답입니다.
                - Spring Data JPA 표준 패턴:
                  `@Modifying(clearAutomatically = true) @Query("update Member m set m.status = 'DORMANT' where m.lastLoginAt < :limit")`
                - 수십만~수백만 건 삭제는 한 방 벌크도 위험합니다 (락 장시간 보유, 언두 로그 폭증). `limit` 을 걸어 N천 건씩 반복 삭제하는 청크 전략이 운영 표준입니다.
                - 벌크 연산은 DB 트리거처럼 JPA 생명주기 콜백(@PreUpdate 등)과 Auditing(updatedAt 자동 갱신)도 건너뜁니다. 갱신 일시가 필요하면 set 절에 직접 포함하세요.
                """,
                """
                Member member = em.find(Member.class, id);   // 1차 캐시에 로딩 (age=29)

                int updated = em.createQuery("update Member m set m.age = m.age + 10")
                                .executeUpdate();             // DB 직접 실행! (DB의 age=39)

                member.getAge();  // 29 ?!  — 1차 캐시는 갱신되지 않았다 ❌

                em.clear();                                   // 영속성 컨텍스트 초기화
                Member fresh = em.find(Member.class, id);     // DB에서 다시 조회
                fresh.getAge();   // 39 ✅
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("1) 불일치 체험 — 벌크 UPDATE 후 1차 캐시는 옛날 값", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("벌크 연산 전 1차 캐시의 age: " + member.getAge());

            int updated = em.createQuery("update Member m set m.age = m.age + 10").executeUpdate();
            ctx.log("벌크 UPDATE 실행 — 영향받은 행 수: " + updated + " (쿼리 한 번으로 전원 +10)");

            ctx.log("⚠ 1차 캐시의 엔티티 age: " + member.getAge() + " ← 그대로!");
            Integer dbAge = em.createQuery("select m.age from Member m where m.id = :id", Integer.class)
                    .setParameter("id", member.getId())
                    .getSingleResult();
            ctx.log("스칼라 쿼리로 본 DB의 실제 age: " + dbAge + " ← 이미 +10");
            ctx.log("같은 트랜잭션 안에서 객체와 DB가 서로 다른 값을 가진 위험한 상태입니다.");
        });

        ctx.inTx("2) 올바른 패턴 — 벌크 후 clear() 하고 다시 조회", em -> {
            int updated = em.createQuery("update Member m set m.age = m.age + 10").executeUpdate();
            ctx.log("벌크 UPDATE 실행: " + updated + "건");

            em.clear();
            ctx.log("em.clear() — 영속성 컨텍스트 초기화");

            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("다시 조회한 age: " + member.getAge() + " ✅ DB와 일치");
        });

        ctx.inTx("3) ⚠ 벌크 DELETE는 cascade를 무시한다", em -> {
            ctx.log("주문상품(자식)이 있는 상태에서 'delete from Order' 벌크 삭제 시도...");
            em.createQuery("delete from Order").executeUpdate();
            ctx.log("여기는 실행되지 않습니다.");
        });

        ctx.inTx("4) 올바른 벌크 삭제 — 자식부터 지운다", em -> {
            int items = em.createQuery("delete from OrderItem").executeUpdate();
            int orders = em.createQuery("delete from Order").executeUpdate();
            ctx.log("OrderItem " + items + "건 삭제 → Order " + orders + "건 삭제 (FK 제약 순서 준수)");
        });
    }
}
