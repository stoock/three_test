package com.jpalab.scenario.impl;

import com.jpalab.domain.Address;
import com.jpalab.domain.Member;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class PersistenceContextScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "persistence-context",
                "영속성 컨텍스트", 1,
                "영속성 컨텍스트와 1차 캐시",
                "persist() 한 엔티티가 어떻게 관리되고, 같은 ID 조회 시 왜 SQL이 안 나가는지 직접 확인합니다.",
                """
                **영속성 컨텍스트(Persistence Context)** 는 엔티티를 영구 저장하는 환경이라는 뜻으로, \
                `EntityManager` 를 통해 엔티티를 보관하고 관리하는 논리적인 저장소입니다.

                엔티티는 4가지 상태를 가집니다.
                - **비영속(new/transient)**: `new` 로 막 생성해서 JPA와 무관한 상태
                - **영속(managed)**: `persist()`, `find()`, JPQL 조회 등으로 영속성 컨텍스트가 관리하는 상태
                - **준영속(detached)**: 영속이었다가 분리된 상태 (`detach()`, `clear()`, `close()`)
                - **삭제(removed)**: `remove()` 로 삭제가 예약된 상태

                영속성 컨텍스트가 제공하는 핵심 기능:
                - **1차 캐시**: 영속 엔티티는 `@Id` 를 키로 캐시에 보관됩니다. 같은 트랜잭션에서 같은 ID를 `find()` 하면 DB를 거치지 않고 캐시에서 반환합니다.
                - **동일성(identity) 보장**: 같은 트랜잭션 안에서 같은 ID로 조회한 엔티티는 `==` 비교가 `true` 입니다. (반복 가능한 읽기 등급의 일관성을 애플리케이션 레벨에서 제공)
                - **쓰기 지연, 변경 감지, 지연 로딩**: 이후 시나리오에서 하나씩 다룹니다.
                """,
                """
                - 1차 캐시는 **트랜잭션 범위**의 아주 짧은 캐시입니다. 성능 최적화 수단이라기보다 동일성 보장과 변경 감지를 위한 메커니즘으로 이해하세요. 애플리케이션 전체 캐시(2차 캐시, Redis 등)와 혼동하면 안 됩니다.
                - `find()` 는 1차 캐시를 먼저 보지만, **JPQL은 항상 DB에 SQL을 실행**합니다. 다만 결과를 1차 캐시의 기존 엔티티와 ID로 비교해서, 이미 있으면 캐시의 엔티티를 반환합니다(조회 결과는 버려짐).
                - ID 생성 전략이 `IDENTITY` 면 `persist()` 시점에 즉시 INSERT가 나갑니다(ID를 알아야 1차 캐시에 넣을 수 있으므로). `SEQUENCE` 전략은 시퀀스만 먼저 채번하고 INSERT는 커밋까지 미룹니다. 이 데모는 SEQUENCE 전략입니다.
                """,
                """
                - 운영에서는 대부분 **스프링의 `@Transactional` + Spring Data JPA** 조합을 사용하며, 트랜잭션 시작 시 영속성 컨텍스트가 만들어지고 종료 시 함께 닫힙니다 (트랜잭션 범위의 영속성 컨텍스트).
                - `spring.jpa.open-in-view` (OSIV) 가 기본 `true` 인데, 켜져 있으면 영속성 컨텍스트가 HTTP 응답 직전까지 유지되어 커넥션을 오래 점유합니다. **트래픽이 있는 API 서버라면 `false` 로 끄고**, 필요한 데이터는 서비스 계층에서 다 조회해 DTO로 반환하는 패턴이 일반적입니다.
                - 동일성 보장 덕분에 같은 트랜잭션 안에서는 "어디서 조회했든 같은 객체"라는 가정으로 도메인 로직을 짤 수 있습니다. 이 점이 도메인 주도 설계(DDD)와 JPA가 잘 맞는 이유 중 하나입니다.
                """,
                """
                // 1) 비영속 → 영속
                Member member = new Member("신입사원", 26, new Address("서울", "마포대로 1", "04000"));
                em.persist(member);   // 1차 캐시에 저장 (SEQUENCE 채번만 실행, INSERT는 커밋 시)

                Member found = em.find(Member.class, member.getId()); // SQL 없음! 1차 캐시 히트
                System.out.println(member == found);                  // true — 동일성 보장

                // 2) 새 트랜잭션(새 영속성 컨텍스트)에서
                Member m1 = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                              .getSingleResult();   // JPQL → SELECT 실행
                Member m2 = em.find(Member.class, m1.getId()); // SQL 없음 — 1차 캐시 히트
                System.out.println(m1 == m2);                  // true
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("1) persist() — 1차 캐시 저장과 동일성 보장", em -> {
            Member member = new Member("신입사원", 26, new Address("서울", "마포대로 1", "04000"));
            em.persist(member);
            ctx.log("persist() 직후 — SEQUENCE에서 ID 즉시 채번: id=" + member.getId());
            ctx.log("이 시점에는 INSERT가 아직 실행되지 않았습니다 (커밋 때 실행 — 아래 SQL 순서 확인).");

            Member found = em.find(Member.class, member.getId());
            ctx.log("같은 ID로 em.find() 호출 → SELECT 없이 1차 캐시에서 반환");
            ctx.log("동일성 보장: (member == found) = " + (member == found));
        });

        ctx.inTx("2) 새 영속성 컨텍스트 — JPQL 조회 후 find()는 캐시 히트", em -> {
            Member m1 = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("JPQL 조회 → SELECT 1회 실행, 결과가 1차 캐시에 들어감: " + m1);

            Member m2 = em.find(Member.class, m1.getId());
            ctx.log("이어서 em.find() → 추가 SELECT 없음 (SQL 목록에 SELECT가 1개뿐인 것 확인)");
            ctx.log("동일성 보장: (m1 == m2) = " + (m1 == m2));
        });

        ctx.inTx("3) detach() — 준영속 엔티티는 더 이상 관리되지 않음", em -> {
            Member m = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            em.detach(m);
            m.setAge(99);
            ctx.log("detach() 후 값을 변경했지만 커밋해도 UPDATE가 없습니다 (변경 감지 대상이 아님).");
        });
    }
}
