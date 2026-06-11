package com.jpalab.scenario.impl;

import com.jpalab.domain.Member;
import com.jpalab.domain.Team;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class ProxyLazyLoadingScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "proxy-lazy-loading",
                "지연 로딩과 성능", 1,
                "프록시와 지연 로딩 (LAZY)",
                "연관 엔티티가 '가짜 객체'로 들어오고, 실제 사용 시점에 SELECT가 실행되는 것을 확인합니다.",
                """
                **지연 로딩(LAZY)** 은 연관된 엔티티를 실제 사용하는 시점까지 조회를 미루는 기능이고, \
                이를 구현하는 메커니즘이 **프록시(Proxy)** 입니다.

                `member.getTeam()` 이 반환하는 것은 진짜 Team이 아니라 Team을 상속받은 가짜 객체(프록시)입니다.
                - 프록시는 실제 객체의 **참조(target)를 보관**하며, 처음에는 비어 있습니다.
                - `team.getName()` 처럼 실제 값이 필요한 메서드를 호출하는 순간 **초기화**가 일어나며 SELECT가 실행됩니다.
                - 단, `getId()` 는 프록시가 이미 ID를 알고 있으므로 **초기화 없이** 반환됩니다 (필드 접근 방식 기준).

                프록시의 특징:
                - 처음 사용할 때 **한 번만** 초기화됩니다.
                - 초기화돼도 프록시가 실제 엔티티로 바뀌는 것이 아니라, 프록시를 **통해** 실제 엔티티에 접근합니다. 따라서 타입 비교는 `==` 대신 `instanceof` 를 써야 합니다.
                - 영속성 컨텍스트에 이미 실제 엔티티가 있으면 `getReference()` 도 실제 엔티티를 반환합니다.
                - **영속성 컨텍스트가 닫힌 뒤 초기화를 시도하면 `LazyInitializationException`** 이 발생합니다 (다음 시나리오).
                """,
                """
                - 실무 기본 원칙: **모든 연관관계는 LAZY.** `@ManyToOne`, `@OneToOne` 은 기본값이 EAGER이므로 반드시 `fetch = FetchType.LAZY` 를 명시하세요. (`@OneToMany` 는 기본 LAZY)
                - EAGER의 문제: (1) JPQL과 만나면 N+1을 일으키고, (2) 어떤 화면에서든 항상 조인/추가 조회가 발생해 필요 없는 데이터까지 가져오며, (3) 쿼리 예측이 불가능해집니다.
                - 프록시 때문에 생기는 미묘한 버그들: `getClass() ==` 비교 실패, `equals()` 구현 시 필드 직접 접근 실패. equals/hashCode는 getter를 통해 구현하고 타입 비교는 instanceof로.
                - 트랜잭션 안에서 프록시인지 확인하려면 `Hibernate.isInitialized(entity)`, 강제 초기화는 `Hibernate.initialize(entity)`.
                """,
                """
                - 운영 패턴: 엔티티는 전부 LAZY로 두고, **화면/API별로 필요한 데이터를 fetch join이나 DTO 프로젝션으로 명시적으로 가져옵니다.** "기본은 안 가져온다, 필요할 때 명시한다"가 쿼리를 예측 가능하게 만듭니다.
                - `@OneToOne` 양방향에서 연관관계 주인이 아닌 쪽은 LAZY가 동작하지 않고 EAGER처럼 추가 쿼리가 나갑니다(프록시를 만들려면 null 여부를 알아야 하는데 FK가 없어서 모름). 구조 변경(주인 변경, 단방향화)이나 별도 조회로 풀어야 합니다.
                - 배치/통계처럼 연관 데이터를 대량으로 함께 읽는 작업은 지연 로딩에 맡기지 말고 처음부터 fetch join / 별도 쿼리로 설계하세요.
                """,
                """
                Member member = em.find(Member.class, memberId);  // SELECT는 member만

                Team team = member.getTeam();
                System.out.println(team.getClass());
                // class com.jpalab.domain.Team$HibernateProxy$... ← 가짜 객체!

                team.getId();    // ID는 이미 알고 있음 → SQL 없음
                team.getName();  // 이 순간 SELECT 실행 (프록시 초기화)
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        Long[] memberId = new Long[1];

        ctx.inTx("1) 회원 조회 — team은 프록시(가짜 객체)", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            memberId[0] = member.getId();
            Team team = member.getTeam();
            ctx.log("member.getTeam() 의 실제 클래스: " + team.getClass().getName());
            ctx.log("→ Team이 아니라 Team을 상속한 프록시입니다. 아직 team SELECT는 없음 (SQL 확인).");

            ctx.log("team.getId() = " + team.getId() + " ← ID는 초기화 없이 반환 (추가 SQL 없음)");

            String name = team.getName();
            ctx.log("team.getName() 호출 → 이 순간 프록시 초기화! SELECT 실행됨. 결과: " + name);
        });

        ctx.inTx("2) getReference() — 조회 자체를 미루기", em -> {
            Member ref = em.getReference(Member.class, memberId[0]);
            ctx.log("em.getReference() 반환 클래스: " + ref.getClass().getName());
            ctx.log("find()와 달리 SELECT 없이 프록시만 반환 — FK 설정 용도로 유용");
            ctx.log("ref.getName() 호출 → " + ref.getName() + " (이때 SELECT 실행)");
        });

        ctx.inTx("3) 영속성 컨텍스트에 이미 있으면 프록시가 아닌 원본 반환", em -> {
            Member real = em.find(Member.class, memberId[0]);
            Member ref = em.getReference(Member.class, memberId[0]);
            ctx.log("find() 후 getReference() → 같은 객체 반환: (real == ref) = " + (real == ref));
            ctx.log("영속성 컨텍스트는 동일성 보장을 위해 이미 관리 중인 원본을 돌려줍니다.");
        });
    }
}
