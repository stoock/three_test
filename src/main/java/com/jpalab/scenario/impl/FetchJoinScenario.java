package com.jpalab.scenario.impl;

import com.jpalab.domain.Member;
import com.jpalab.domain.Team;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import jakarta.persistence.EntityGraph;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class FetchJoinScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "fetch-join",
                "지연 로딩과 성능", 4,
                "페치 조인과 EntityGraph — N+1 해결",
                "같은 조회를 fetch join으로 바꾸면 쿼리 1번으로 끝나는 것과, 컬렉션 페치 조인 + 페이징의 함정을 확인합니다.",
                """
                **페치 조인(fetch join)** 은 JPQL에서 연관된 엔티티나 컬렉션을 **SQL 조인 한 번으로 함께 조회**하는 \
                기능입니다. 일반 join과 달리 조인 대상까지 SELECT 절에 포함시켜 영속성 컨텍스트에 올립니다.

                - `join fetch t.members`: 팀과 회원을 한 방에 조회. 회원 컬렉션이 이미 초기화된 상태가 됩니다.
                - 일반 `join` 은 조인 조건으로만 쓰일 뿐 연관 엔티티를 로딩하지 않습니다 (이후 접근 시 N+1 그대로 발생).

                **컬렉션 페치 조인의 제약** (일대다 조인은 행이 뻥튀기되기 때문):
                1. 일대다 조인 결과는 자식 수만큼 행이 늘어납니다. Hibernate 6부터는 엔티티 결과 중복을 자동 제거하지만, SQL 행 수 자체가 늘어난다는 사실은 변하지 않습니다.
                2. **페이징(setFirstResult/setMaxResults)과 함께 쓰면 안 됩니다** — DB에서 LIMIT를 걸 수 없어 Hibernate가 전체를 메모리에 올린 후 자르며, 경고 로그(HHH90003004)를 남깁니다. 데이터가 많으면 OOM.
                3. 둘 이상의 컬렉션을 동시에 페치 조인하면 MultipleBagFetchException 또는 데이터 곱 폭발.

                **`@EntityGraph` / EntityManager의 EntityGraph** 는 fetch join을 선언적으로 지정하는 JPA 표준 방법입니다.
                """,
                """
                - xToOne(다대일/일대일) 관계는 fetch join을 자유롭게, 몇 개든 함께 걸 수 있습니다. 제약은 컬렉션(xToMany)에만 있습니다.
                - **컬렉션 + 페이징 실전 공식**: 루트는 xToOne만 fetch join해서 페이징하고, 컬렉션은 LAZY로 두되 `hibernate.default_batch_fetch_size` 로 IN 조회되게 합니다. 쿼리 수: 1(루트) + 1(컬렉션 IN) 수준으로 안정화.
                - fetch join 대상에는 별칭을 붙여 where 조건으로 거르지 마세요. 컬렉션 일부만 로딩된 엔티티가 영속성 컨텍스트에 들어가 정합성이 깨집니다 (Hibernate 6는 허용하지만 위험성은 동일).
                - Spring Data JPA에서는 `@EntityGraph(attributePaths = {"members"})` 를 리포지토리 메서드에 붙이는 방식이 간편합니다.
                """,
                """
                - 운영에서 조회 API의 일반적인 단계별 최적화 순서:
                  1. 모든 연관 LAZY 확인 → 2. xToOne fetch join → 3. 컬렉션은 batch_size → 4. 그래도 느리면 DTO 직접 조회 → 5. 그래도 안 되면 캐시/역정규화.
                - 핵심 목록 화면(주문 목록, 피드 등)은 처음부터 **DTO 프로젝션 + 컬렉션 별도 IN 조회**로 짜는 팀이 많습니다. 엔티티 그래프 로딩은 단건 상세 화면에 적합합니다.
                - fetch join 쿼리가 화면 요구사항마다 늘어나면 리포지토리가 비대해집니다. 조회 전용 리포지토리를 분리하고 QueryDSL로 동적 쿼리를 관리하는 구성이 사실상 표준입니다.
                """,
                """
                // N+1 발생 코드
                select t from Team t                              // 1 + N번

                // fetch join — 쿼리 1번
                select t from Team t left join fetch t.members    // 1번!

                // EntityGraph (JPA 표준)
                EntityGraph<Team> graph = em.createEntityGraph(Team.class);
                graph.addAttributeNodes("members");
                em.createQuery("select t from Team t", Team.class)
                  .setHint("jakarta.persistence.fetchgraph", graph)
                  .getResultList();

                // ⚠ 컬렉션 fetch join + 페이징 = 메모리에서 페이징 (위험!)
                em.createQuery("select t from Team t join fetch t.members", Team.class)
                  .setMaxResults(2)   // HHH90003004 경고, 전체를 메모리에 로딩
                  .getResultList();
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("1) fetch join — 쿼리 1번으로 팀 + 회원 모두 조회", em -> {
            List<Team> teams = em.createQuery(
                            "select t from Team t left join fetch t.members", Team.class)
                    .getResultList();
            for (Team team : teams) {
                ctx.log("  - " + team.getName() + ": " + team.getMembers().size() + "명 (추가 SQL 없음!)");
            }
            ctx.log("N+1 시나리오와 비교해 보세요 — SQL이 join 포함 1번뿐입니다.");
        });

        ctx.inTx("2) EntityGraph — JPA 표준 방식으로 같은 효과", em -> {
            EntityGraph<Team> graph = em.createEntityGraph(Team.class);
            graph.addAttributeNodes("members");
            List<Team> teams = em.createQuery("select t from Team t", Team.class)
                    .setHint("jakarta.persistence.fetchgraph", graph)
                    .getResultList();
            ctx.log("fetchgraph 힌트 적용 → SQL에 left join이 자동으로 들어간 것 확인");
            ctx.log("조회된 팀 수: " + teams.size());
        });

        ctx.inTx("3) ⚠ 함정 — 컬렉션 fetch join + 페이징", em -> {
            List<Team> teams = em.createQuery(
                            "select t from Team t join fetch t.members", Team.class)
                    .setFirstResult(0)
                    .setMaxResults(2)
                    .getResultList();
            ctx.log("setMaxResults(2) 를 걸었지만 SQL에 LIMIT가 없습니다! (SQL 확인)");
            ctx.log("Hibernate가 전체 결과를 메모리에 올린 뒤 잘랐습니다 (서버 로그에 HHH90003004 경고).");
            ctx.log("조회된 팀: " + teams.stream().map(Team::getName).toList());
            ctx.log("데이터가 수십만 건이면 OOM으로 이어질 수 있는 위험한 패턴입니다.");
        });

        ctx.inTx("4) xToOne은 fetch join + 페이징 안전", em -> {
            List<Member> members = em.createQuery(
                            "select m from Member m join fetch m.team order by m.name", Member.class)
                    .setFirstResult(0)
                    .setMaxResults(3)
                    .getResultList();
            ctx.log("다대일(member→team) fetch join은 행 뻥튀기가 없어 SQL에 LIMIT가 정상 적용됩니다.");
            members.forEach(m -> ctx.log("  - " + m.getName() + " / " + m.getTeam().getName()));
        });
    }
}
