package com.jpalab.scenario.impl;

import com.jpalab.domain.Member;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class LazyInitializationExceptionScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "lazy-initialization-exception",
                "지연 로딩과 성능", 2,
                "LazyInitializationException 체험 ⚠",
                "JPA에서 가장 자주 만나는 예외를 직접 발생시키고, 올바른 해결 방법을 확인합니다.",
                """
                `LazyInitializationException` 은 **영속성 컨텍스트가 닫힌 후에 프록시를 초기화하려고 할 때** \
                발생하는 Hibernate 예외입니다.

                프록시 초기화는 영속성 컨텍스트를 통해 DB를 조회해야 하는데, 트랜잭션이 끝나서 \
                영속성 컨텍스트가 이미 닫혔다면(준영속 상태) 조회할 방법이 없으므로 예외를 던집니다.

                전형적인 발생 상황:
                - 트랜잭션이 있는 서비스 계층에서 엔티티를 반환하고, **트랜잭션 밖**(컨트롤러, 뷰)에서 지연 로딩 필드에 접근
                - 엔티티를 JSON으로 직렬화할 때 Jackson이 모든 getter를 호출하면서 프록시를 건드림
                - OSIV(open-in-view)를 끈 상태에서 컨트롤러에서 연관 필드 접근

                해결의 핵심은 "**트랜잭션 안에서 필요한 데이터를 모두 로딩해 둔다**"입니다.
                """,
                """
                - 해결 방법 우선순위:
                  1. **fetch join** — 처음부터 연관 엔티티를 함께 조회 (가장 일반적)
                  2. **DTO 프로젝션** — 화면에 필요한 필드만 select해서 DTO로 반환 (엔티티가 계층을 벗어나지 않음)
                  3. `@EntityGraph` — Spring Data JPA 메서드에 선언적으로 fetch 지정
                  4. 트랜잭션 안에서 강제 초기화 (`Hibernate.initialize()`) — 임시방편에 가까움
                - **OSIV를 켜서 해결하는 것은 권장하지 않습니다.** 예외는 사라지지만 뷰 렌더링 중 쿼리가 나가고(N+1을 화면까지 끌고 감) DB 커넥션을 응답 끝까지 점유합니다.
                - 이 예외가 났다는 것은 "설계상 데이터 로딩 책임이 어디 있는지 불명확하다"는 신호입니다. 예외 지점만 막지 말고 조회 로직을 정리하세요.
                """,
                """
                - 운영 권장 구성: `spring.jpa.open-in-view=false` + **서비스/쿼리 계층에서 조회 완결** + 컨트롤러에는 DTO만 전달. 이렇게 하면 LazyInitializationException이 "컨트롤러에서 엔티티를 만지고 있다"는 설계 경고 역할을 해줍니다.
                - API 응답에서 엔티티를 직접 반환하다 Jackson 직렬화로 이 예외가 터지는 사고가 흔합니다. 응답 전용 DTO 변환을 강제하는 컨벤션(아키텍처 테스트로 검증까지)을 두는 팀이 많습니다.
                - 화면별 조회 전용 Repository(또는 DAO/Query 서비스)를 따로 두고, 거기서 fetch join/DTO 쿼리를 관리하는 CQRS-lite 구조가 사실상의 표준입니다.
                """,
                """
                // 트랜잭션 안에서 회원만 조회 (team은 LAZY 프록시)
                Member member = transactional(() -> em.find(Member.class, id));
                // 트랜잭션 종료 — 영속성 컨텍스트 닫힘

                member.getTeam().getName();
                // ❌ LazyInitializationException:
                //    could not initialize proxy - no Session

                // ✅ 해결: 트랜잭션 안에서 fetch join으로 함께 조회
                Member member = em.createQuery(
                        "select m from Member m join fetch m.team where m.id = :id", Member.class)
                        .setParameter("id", id).getSingleResult();
                member.getTeam().getName(); // 트랜잭션 밖에서도 OK (이미 로딩됨)
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        Member[] lazy = new Member[1];
        Member[] fetched = new Member[1];

        ctx.inTx("1) 트랜잭션 안에서 회원만 조회 (team은 LAZY 프록시)", em -> {
            lazy[0] = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("조회 완료: " + lazy[0]);
            ctx.log("team은 아직 초기화되지 않은 프록시 상태로 트랜잭션이 종료됩니다.");
        });

        ctx.step("2) 트랜잭션 종료 후 지연 로딩 시도 ❌", () -> {
            ctx.log("member.getTeam().getName() 호출 시도...");
            String name = lazy[0].getTeam().getName(); // LazyInitializationException!
            ctx.log("여기는 실행되지 않습니다: " + name);
        });

        ctx.inTx("3) 해결 — fetch join으로 트랜잭션 안에서 함께 로딩", em -> {
            fetched[0] = em.createQuery(
                            "select m from Member m join fetch m.team where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("join fetch로 member + team을 한 번에 조회 (SQL의 join 확인)");
        });

        ctx.step("4) 트랜잭션 종료 후 접근해도 안전 ✅", () -> {
            String teamName = fetched[0].getTeam().getName();
            ctx.log("이미 로딩되어 있으므로 예외 없음: 소속팀 = " + teamName);
            ctx.log("핵심: '트랜잭션 안에서 필요한 데이터를 모두 로딩'이 해결의 본질입니다.");
        });
    }
}
