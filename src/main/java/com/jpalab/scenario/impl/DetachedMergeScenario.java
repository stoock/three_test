package com.jpalab.scenario.impl;

import com.jpalab.domain.Member;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class DetachedMergeScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "detached-merge",
                "영속성 컨텍스트", 4,
                "준영속 상태와 merge()의 함정",
                "준영속 엔티티는 수정해도 반영되지 않는 것, merge()가 모든 필드를 덮어쓰는 것을 체험합니다.",
                """
                **준영속(detached)** 상태는 영속성 컨텍스트가 관리하다가 분리된 상태입니다. \
                `em.detach(entity)`, `em.clear()`, `em.close()` 로 만들어지며, 트랜잭션이 끝나 \
                영속성 컨텍스트가 닫힌 뒤의 엔티티가 대표적인 준영속 상태입니다.

                준영속 엔티티의 특징:
                - 1차 캐시, 변경 감지, 지연 로딩 등 영속성 컨텍스트의 **모든 기능을 사용할 수 없습니다.**
                - 값을 변경해도 DB에 반영되지 않습니다.
                - 식별자(ID) 값은 가지고 있습니다 (한 번은 영속 상태였으므로).

                **merge()** 는 준영속 엔티티를 다시 영속 상태로 만드는 메서드입니다. 동작:
                1. 파라미터로 받은 엔티티의 ID로 1차 캐시(없으면 DB)에서 엔티티를 조회
                2. 조회한 영속 엔티티에 파라미터 엔티티의 **모든 값을 복사** (밀어넣기)
                3. **복사받은 영속 엔티티를 반환** — 파라미터로 넘긴 객체는 여전히 준영속!
                """,
                """
                - **merge()의 최대 함정**: 모든 필드를 덮어쓰기 때문에, 화면에서 일부 필드만 받아 merge하면 나머지 필드가 `null` 로 업데이트됩니다. 실무 데이터 사고의 단골 원인입니다.
                - 수정이 필요하면 merge 대신 **"ID로 다시 조회 → 변경 감지"** 패턴을 쓰세요. 변경할 필드만 명시적으로 바꾸므로 안전합니다.
                - `merge()` 반환값을 받아서 써야 합니다. `em.merge(entity)` 후 `entity` 를 계속 쓰면 준영속 객체를 조작하는 것이라 변경이 반영되지 않습니다.
                - Spring Data JPA의 `save()` 는 내부적으로 "새 엔티티면 persist, 아니면 merge" 입니다. ID가 미리 할당된 엔티티를 save하면 의도치 않게 SELECT + merge가 실행됩니다 (`Persistable` 인터페이스로 해결).
                """,
                """
                - 운영 표준 수정 패턴 (merge를 쓰지 않는 방법):
                  컨트롤러에서 DTO로 변경 값만 받고 → 서비스의 `@Transactional` 메서드에서 `findById()` 로 조회 → 엔티티 비즈니스 메서드로 변경 → 커밋 시 변경 감지로 UPDATE.
                - HTTP 요청 사이를 넘나드는 엔티티(세션에 저장, 화면에 바인딩)는 전부 준영속입니다. 웹 계층에는 엔티티 대신 **DTO를 전달**하는 것이 사고를 줄이는 가장 확실한 방법입니다.
                - Spring Data JPA를 쓸 때 신규 저장 여부 판단이 애매한 엔티티(UUID 직접 할당 등)는 `Persistable<ID>` 를 구현해서 불필요한 SELECT를 제거합니다.
                """,
                """
                // 트랜잭션 1: 조회 후 영속성 컨텍스트 종료 → member는 준영속
                Member member = em1.find(Member.class, id);
                em1.close();

                member.setAge(99); // 아무 일도 일어나지 않는다! (변경 감지 X)

                // 트랜잭션 2: merge로 다시 영속화
                Member merged = em2.merge(member);
                // SELECT 후 member의 "모든 필드"를 영속 엔티티에 복사 → 커밋 시 UPDATE
                // 주의: merged != member. 반환값을 써야 한다!
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        Member[] holder = new Member[1];

        ctx.inTx("1) 조회 후 트랜잭션 종료 → 준영속 상태", em -> {
            holder[0] = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("조회: " + holder[0]);
            ctx.log("트랜잭션이 끝나면 영속성 컨텍스트가 닫히고 이 엔티티는 준영속이 됩니다.");
        });

        ctx.step("2) 준영속 상태에서 값 변경 — 아무 일도 일어나지 않음", () -> {
            holder[0].setAge(99);
            ctx.log("member.setAge(99) 호출 — 하지만 관리하는 영속성 컨텍스트가 없음");
            ctx.log("SQL 목록이 비어있는 것을 확인하세요. UPDATE는 실행되지 않습니다.");
        });

        ctx.inTx("3) merge() — SELECT 후 모든 필드를 덮어쓰는 UPDATE", em -> {
            Member merged = em.merge(holder[0]);
            ctx.log("merge() 실행 → 먼저 SELECT로 영속 엔티티를 가져온 뒤 모든 값을 복사합니다.");
            ctx.log("반환된 객체와 파라미터 객체는 다른 객체: (merged == 원본) = " + (merged == holder[0]));
            ctx.log("merged(영속): " + merged + " ← 이후 변경은 이 객체로 해야 합니다.");
        });

        ctx.inTx("4) 결과 확인", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("DB 반영 결과: " + member + " (age=99로 변경됨)");
            ctx.log("⚠ 만약 원본 객체의 일부 필드가 비어 있었다면 그 필드는 null로 덮어써졌을 것입니다 — merge의 함정");
        });
    }
}
