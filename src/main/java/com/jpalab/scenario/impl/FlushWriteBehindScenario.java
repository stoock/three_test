package com.jpalab.scenario.impl;

import com.jpalab.domain.Address;
import com.jpalab.domain.Member;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class FlushWriteBehindScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "flush-write-behind",
                "영속성 컨텍스트", 3,
                "쓰기 지연과 플러시 (Flush)",
                "persist 해도 INSERT가 바로 안 나가는 것, JPQL 실행 전 자동 플러시되는 것을 확인합니다.",
                """
                **쓰기 지연(transactional write-behind)**: `persist()`, `remove()`, 변경 감지로 만들어진 SQL은 \
                즉시 DB로 보내지 않고 영속성 컨텍스트 내부의 **쓰기 지연 SQL 저장소**에 모아둡니다.

                **플러시(flush)** 는 이렇게 모아둔 변경 내용을 DB에 **동기화**하는 작업입니다. 플러시가 일어나는 시점:
                1. **트랜잭션 커밋 직전** — 자동
                2. **JPQL/네이티브 쿼리 실행 직전** — 자동 (방금 persist한 데이터가 쿼리 결과에 포함되도록 보장하기 위해)
                3. `em.flush()` 직접 호출

                중요한 오해 바로잡기:
                - 플러시는 **커밋이 아닙니다**. SQL을 보낼 뿐, 트랜잭션이 롤백되면 모두 취소됩니다.
                - 플러시해도 영속성 컨텍스트(1차 캐시)는 **비워지지 않습니다**. 비우는 것은 `clear()` 입니다.

                `FlushModeType.AUTO` (기본값) 가 위 동작이고, `COMMIT` 으로 바꾸면 커밋 때만 플러시합니다.
                """,
                """
                - SQL이 내가 호출한 순서대로 즉시 나가지 않는다는 것을 모르면 디버깅할 때 크게 혼란스럽습니다. "로그에 INSERT가 왜 여기서 나오지?"의 답은 대부분 플러시 타이밍입니다.
                - ID 전략이 `IDENTITY` 면 쓰기 지연이 사실상 무력화됩니다 — `persist()` 즉시 INSERT가 나갑니다. **대량 INSERT 배치 성능이 중요하면 SEQUENCE 전략 + `hibernate.jdbc.batch_size`** 조합을 쓰세요.
                - `em.flush()` 를 수동 호출하는 경우는 드뭅니다. 주로 (1) 테스트에서 SQL 실행을 강제할 때, (2) DB 제약조건 위반을 빨리 발견하고 싶을 때 정도입니다.
                """,
                """
                - 운영에서 쓰기 지연의 가치는 **JDBC 배치**와 결합할 때 큽니다: `hibernate.jdbc.batch_size=50` (+ `order_inserts=true`, `order_updates=true`) 설정 시 모아둔 INSERT를 묶어서 전송해 대량 저장이 수~수십 배 빨라집니다.
                - 같은 트랜잭션에서 "저장 후 바로 목록 조회" 같은 코드가 있을 때, JPQL 직전 자동 플러시 덕분에 방금 저장한 데이터가 조회에 포함됩니다. 이 동작에 의존하는 코드가 꽤 많으니 FlushMode를 함부로 COMMIT으로 바꾸면 안 됩니다.
                - 아주 큰 배치 작업(수십만 건)에서는 N건마다 `flush()` + `clear()` 를 호출해 영속성 컨텍스트가 무한히 커지는 것(메모리 누수처럼 보이는 현상)을 막는 패턴이 표준입니다.
                """,
                """
                em.persist(memberA);
                em.persist(memberB);
                em.persist(memberC);
                // 여기까지 INSERT 없음! (시퀀스 채번만 일어남)

                Long count = em.createQuery("select count(m) from Member m", Long.class)
                               .getSingleResult();
                // JPQL 직전 자동 플러시 → INSERT 3건이 먼저 실행된 후 SELECT 실행
                // count 에는 방금 persist 한 3명이 포함된다

                tx.commit(); // 남은 변경이 있으면 이 시점에 플러시 후 커밋
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("1) persist 3건 — JPQL 실행 직전 자동 플러시", em -> {
            em.persist(new Member("회원A", 20, new Address("서울", "A로 1", "00001")));
            em.persist(new Member("회원B", 21, new Address("서울", "B로 2", "00002")));
            em.persist(new Member("회원C", 22, new Address("서울", "C로 3", "00003")));
            ctx.log("persist() 3번 호출 완료 — 이 시점까지 실행된 SQL은 시퀀스 채번뿐, INSERT는 없음");

            Long count = em.createQuery("select count(m) from Member m", Long.class).getSingleResult();
            ctx.log("JPQL count 실행 → 직전에 자동 플러시! SQL 목록에서 INSERT 3건이 SELECT보다 먼저인 것 확인");
            ctx.log("count 결과: " + count + "명 (방금 persist한 3명 포함)");
        });

        ctx.inTx("2) flush()는 커밋이 아니다 — 플러시 후 롤백", em -> {
            em.persist(new Member("롤백될회원", 30, new Address("서울", "X로 9", "99999")));
            em.flush();
            ctx.log("flush() 직접 호출 → INSERT가 즉시 실행됨 (SQL 확인)");
            ctx.log("하지만 이제 일부러 예외를 던져 롤백시킵니다...");
            throw new IllegalStateException("일부러 발생시킨 예외 — flush된 INSERT도 롤백됩니다");
        });

        ctx.inTx("3) 정말 롤백되었는지 확인", em -> {
            Long count = em.createQuery(
                    "select count(m) from Member m where m.name = '롤백될회원'", Long.class).getSingleResult();
            ctx.log("'롤백될회원' 수: " + count + " — flush는 SQL 전송일 뿐, 커밋 전 롤백되면 모두 취소됩니다.");
        });
    }
}
