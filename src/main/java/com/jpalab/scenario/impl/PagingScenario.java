package com.jpalab.scenario.impl;

import com.jpalab.domain.Member;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class PagingScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "paging",
                "지연 로딩과 성능", 5,
                "페이징 API",
                "setFirstResult/setMaxResults가 DB 방언에 맞는 LIMIT/OFFSET SQL로 번역되는 것을 확인합니다.",
                """
                JPA의 페이징 API는 단 두 개의 메서드로 추상화되어 있습니다.
                - `setFirstResult(int startPosition)`: 조회 시작 위치 (0부터)
                - `setMaxResults(int maxResult)`: 조회할 데이터 수

                JPA의 큰 장점 중 하나로, **데이터베이스 방언(Dialect)에 맞춰 SQL이 자동 생성**됩니다.
                - H2/PostgreSQL/MySQL: `... limit ? offset ?` (또는 fetch first 구문)
                - Oracle: `offset ? rows fetch next ? rows only` (12c+) 또는 rownum 서브쿼리

                페이징은 보통 **정렬(order by)** 과 함께 사용해야 결과가 안정적입니다. \
                정렬 없이 페이징하면 페이지마다 순서가 뒤섞일 수 있습니다 (DB는 순서를 보장하지 않음).
                """,
                """
                - 정렬 기준에 **유니크한 컬럼(보통 PK)을 마지막에 추가**하세요. `order by created_at` 만 쓰면 같은 시각 데이터의 순서가 페이지 사이에서 뒤바뀌어 중복/누락이 발생합니다 → `order by created_at desc, id desc`.
                - 컬렉션 fetch join과 페이징을 함께 쓰면 메모리 페이징이 됩니다 (페치 조인 시나리오 3단계 참고).
                - Spring Data JPA의 `Pageable`/`Page` 가 이 API의 래퍼입니다. `Page` 는 count 쿼리를 추가 실행하므로, 전체 수가 필요 없으면 `Slice` (다음 페이지 유무만 확인)를 쓰세요.
                - count 쿼리가 본 쿼리의 조인을 그대로 복사해 느려지는 경우가 많습니다. `@Query(countQuery = ...)` 로 단순화한 count를 따로 지정하세요.
                """,
                """
                - **깊은 페이지(offset이 큰) 성능 문제**: `offset 100000` 은 10만 행을 읽고 버립니다. 운영의 무한 스크롤/대량 목록은 offset 대신 **커서(키셋) 페이징** — `where id < :lastId order by id desc limit 20` — 을 사용하는 것이 표준입니다.
                - 관리자 화면처럼 전체 페이지 수가 필요한 곳만 offset 페이징 + count를 쓰고, 사용자 피드는 커서 페이징 + Slice 패턴으로 나누는 구성이 일반적입니다.
                - 배치에서 페이징으로 전체 테이블을 훑을 때, 데이터를 수정하면서 offset 페이징을 쓰면 행이 밀려 누락이 생깁니다. ID 범위 기반(Zero-offset) 처리로 짜세요.
                """,
                """
                List<Member> page1 = em.createQuery(
                        "select m from Member m order by m.age desc, m.id desc", Member.class)
                        .setFirstResult(0)   // 시작 위치
                        .setMaxResults(3)    // 페이지 크기
                        .getResultList();
                // H2:  ... order by m1_0.age desc, m1_0.id desc offset ? rows fetch first ? rows only
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("1) 1페이지 조회 (0~2)", em -> {
            List<Member> members = em.createQuery(
                            "select m from Member m order by m.age desc, m.id desc", Member.class)
                    .setFirstResult(0)
                    .setMaxResults(3)
                    .getResultList();
            ctx.log("나이 내림차순 1페이지 (SQL의 offset/fetch 구문 확인):");
            members.forEach(m -> ctx.log("  - " + m.getName() + " (" + m.getAge() + "세)"));
        });

        ctx.inTx("2) 2페이지 조회 (3~5)", em -> {
            List<Member> members = em.createQuery(
                            "select m from Member m order by m.age desc, m.id desc", Member.class)
                    .setFirstResult(3)
                    .setMaxResults(3)
                    .getResultList();
            ctx.log("2페이지:");
            members.forEach(m -> ctx.log("  - " + m.getName() + " (" + m.getAge() + "세)"));
        });

        ctx.inTx("3) 전체 카운트 — Page 구현에 필요한 쿼리", em -> {
            Long total = em.createQuery("select count(m) from Member m", Long.class).getSingleResult();
            ctx.log("전체 회원 수: " + total + " (Spring Data JPA의 Page는 이 count 쿼리를 자동 실행)");
            ctx.log("전체 수가 필요 없다면 Slice를 사용해 count 쿼리를 아끼세요.");
        });
    }
}
