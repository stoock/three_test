package com.jpalab.scenario.impl;

import com.jpalab.domain.Member;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class DirtyCheckingScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "dirty-checking",
                "영속성 컨텍스트", 2,
                "변경 감지 (Dirty Checking)",
                "update() 호출 없이 setter만으로 UPDATE SQL이 실행되는 것을 확인합니다.",
                """
                **변경 감지(Dirty Checking)** 는 영속성 컨텍스트가 관리하는 엔티티의 변경을 자동으로 \
                데이터베이스에 반영하는 기능입니다.

                동작 원리:
                1. 엔티티가 영속성 컨텍스트에 들어올 때(조회/저장 시점) 최초 상태를 복사한 **스냅샷**을 보관합니다.
                2. 플러시 시점(보통 커밋 직전)에 엔티티의 현재 상태와 스냅샷을 비교합니다.
                3. 달라진 엔티티가 있으면 UPDATE SQL을 만들어 쓰기 지연 저장소에 넣고 DB에 반영합니다.

                그래서 JPA에는 `update()` 같은 메서드가 **없습니다**. \
                "영속 상태의 엔티티를 수정하면 트랜잭션 커밋 시 알아서 반영된다"가 JPA의 기본 수정 방식입니다.

                기본적으로 Hibernate는 변경된 필드만이 아니라 **모든 필드를 포함한 UPDATE** 를 생성합니다. \
                (쿼리를 미리 만들어 재사용할 수 있고, PreparedStatement 캐시 효율이 좋기 때문)
                """,
                """
                - **수정은 변경 감지로, `merge()` 는 지양**: merge는 모든 필드를 덮어써서 의도치 않게 null로 업데이트될 위험이 있습니다. "조회 → 비즈니스 메서드로 변경 → 커밋"이 정석입니다.
                - setter를 열어두기보다 `member.changeAge(31)`, `order.cancel()` 처럼 **의도가 드러나는 비즈니스 메서드**로 변경하는 것이 추적과 유지보수에 유리합니다.
                - 변경된 컬럼만 UPDATE 하고 싶으면 엔티티에 `@DynamicUpdate` 를 붙입니다. 단, 컬럼이 아주 많거나(30개 이상) 특정 컬럼 잠금 경합이 있는 경우가 아니면 굳이 쓸 필요 없습니다.
                - 같은 값으로 setter를 호출하면 스냅샷과 동일하므로 UPDATE가 나가지 않습니다 (이 데모 3단계에서 확인).
                """,
                """
                - 운영 코드의 전형적인 수정 패턴:
                  서비스 계층에서 `@Transactional` 메서드 안에서 `repository.findById()` 로 조회 → 엔티티의 비즈니스 메서드 호출 → 메서드 종료(커밋) 시 자동 UPDATE. `save()` 를 다시 호출할 필요가 없습니다.
                - 읽기 전용 조회에는 `@Transactional(readOnly = true)` 를 사용하세요. Hibernate가 스냅샷 비교/플러시를 생략해서 메모리와 CPU를 아낍니다. 조회 서비스에서 특히 효과가 큽니다.
                - 대량 행을 한 번에 수정해야 하면 변경 감지(행 단위 UPDATE N번)가 아니라 **벌크 연산**(JPQL update 한 방)을 사용합니다. → "벌크 연산" 시나리오 참고.
                """,
                """
                @Transactional
                public void changeAge(Long memberId) {
                    Member member = em.find(Member.class, memberId); // 영속 상태 + 스냅샷 보관
                    member.setAge(member.getAge() + 1);              // 값만 변경
                    // em.update(member) ??? 그런 메서드는 없다!
                }   // 커밋 → 스냅샷과 비교 → UPDATE 자동 실행
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("1) 조회 후 setter만 호출 — 커밋 시 UPDATE 자동 실행", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("조회한 회원: " + member);
            member.setAge(member.getAge() + 1);
            ctx.log("member.setAge(" + member.getAge() + ") 만 호출 — save/update 호출 없음");
            ctx.log("커밋 시점에 스냅샷과 비교해서 UPDATE가 실행됩니다 (아래 SQL 확인).");
        });

        ctx.inTx("2) 다른 트랜잭션에서 변경 결과 확인", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("DB에 반영된 상태: " + member);
        });

        ctx.inTx("3) 같은 값으로 변경하면? — UPDATE 없음", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            member.setName(member.getName());
            ctx.log("같은 값으로 setName() 호출 → 스냅샷과 동일하므로 UPDATE가 나가지 않습니다.");
            ctx.log("(SQL 목록에 SELECT만 있는 것을 확인하세요)");
        });
    }
}
