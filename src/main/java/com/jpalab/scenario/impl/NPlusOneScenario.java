package com.jpalab.scenario.impl;

import com.jpalab.domain.Team;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class NPlusOneScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "nplus1-problem",
                "지연 로딩과 성능", 3,
                "N+1 문제 체험 ⚠",
                "팀 3개를 조회했는데 SELECT가 4번 나가는 것을 SQL 목록으로 직접 확인합니다.",
                """
                **N+1 문제**: 목록을 조회하는 쿼리 1번 + 각 행의 연관 엔티티를 조회하는 쿼리 N번이 \
                실행되는 성능 문제입니다. JPA 성능 문제의 90%가 여기서 나옵니다.

                발생 메커니즘 (LAZY 기준):
                1. `select t from Team t` → 팀 N개 조회 (쿼리 1번)
                2. 반복문에서 `team.getMembers()` 접근 → 팀마다 회원 조회 쿼리 실행 (쿼리 N번)
                3. 팀이 100개면 총 101번의 쿼리!

                EAGER로 바꿔도 해결되지 않습니다. JPQL은 일단 `select t from Team t` 를 SQL로 그대로 \
                번역해 실행한 뒤, EAGER 설정을 보고 연관 엔티티를 **즉시** N번 추가 조회합니다. \
                오히려 필요 없는 화면에서도 무조건 N+1이 발생하게 됩니다.

                개발 환경에서는 데이터가 적어 티가 안 나다가, 운영에서 데이터가 늘면 \
                갑자기 응답이 느려지는 전형적인 패턴을 보입니다.
                """,
                """
                - 해결 3종 세트:
                  1. **fetch join**: `select t from Team t join fetch t.members` — 쿼리 1번. 가장 기본.
                  2. **`@BatchSize` / `hibernate.default_batch_fetch_size`**: 지연 로딩 시 `where team_id in (?, ?, ...)` 로 묶어서 조회. N번 → N/배치크기 번으로 감소.
                  3. **DTO 프로젝션**: 필요한 컬럼만 join해서 직접 select.
                - 컬렉션 fetch join은 **한 쿼리에 하나만** 가능합니다 (둘 이상이면 MultipleBagFetchException 또는 카테시안 곱 폭발).
                - N+1은 코드 리뷰로 잡기 어렵습니다. **개발 단계에서 실행 SQL 로그를 항상 켜두고**, 한 요청에 같은 모양의 쿼리가 반복되면 의심하세요.
                """,
                """
                - 운영 표준 설정: `application.yml` 에 **`hibernate.default_batch_fetch_size: 100`** (보통 100~1000)을 전역으로 깔아두는 회사가 많습니다. 놓친 지연 로딩이 있어도 IN 쿼리로 묶여 최악을 면합니다.
                - 쿼리 카운트를 테스트로 검증하는 방법: datasource-proxy 나 Hibernate Statistics 로 "이 API는 쿼리 3번 이하" 같은 테스트를 작성해 회귀를 방지합니다.
                - APM(Pinpoint, Datadog, Scouter 등)에서 한 트랜잭션에 같은 쿼리가 수십 번 찍히는 패턴이 N+1의 운영 시그니처입니다. 슬로우 API 분석 시 가장 먼저 확인하세요.
                - xToOne 관계는 fetch join, xToMany(컬렉션)는 지연 로딩 + batch_size 조합이 페이징과 함께 쓸 수 있는 실전 공식입니다 (→ 페치 조인 시나리오의 페이징 함정 참고).
                """,
                """
                List<Team> teams = em.createQuery("select t from Team t", Team.class)
                                     .getResultList();          // 쿼리 1번

                for (Team team : teams) {
                    team.getMembers().size();                   // 팀마다 쿼리 1번씩... N번!
                }
                // 팀 3개 → 총 1 + 3 = 4번 실행 (실행 후 SQL 목록을 세어보세요)
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("팀 목록 조회 후 각 팀의 회원 접근 — 1 + N번의 SELECT", em -> {
            List<Team> teams = em.createQuery("select t from Team t", Team.class).getResultList();
            ctx.log("팀 목록 조회 완료: " + teams.size() + "개 팀 (여기까지 SELECT 1번)");
            ctx.log("이제 각 팀의 회원 컬렉션에 접근합니다...");
            for (Team team : teams) {
                ctx.log("  - " + team.getName() + ": " + team.getMembers().size() + "명 ← 이 줄마다 SELECT 1번 추가!");
            }
            ctx.log("");
            ctx.log("아래 SQL 목록을 세어보세요: 팀 조회 1번 + 팀별 회원 조회 " + teams.size() + "번 = 총 "
                    + (1 + teams.size()) + "번");
            ctx.log("팀이 100개였다면 101번의 쿼리가 실행됐을 것입니다.");
        });
    }
}
