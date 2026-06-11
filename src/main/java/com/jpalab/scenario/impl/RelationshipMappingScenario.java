package com.jpalab.scenario.impl;

import com.jpalab.domain.Address;
import com.jpalab.domain.Member;
import com.jpalab.domain.Team;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class RelationshipMappingScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "relationship-mapping",
                "연관관계 매핑", 1,
                "연관관계 매핑과 연관관계의 주인",
                "다대일/일대다 양방향 매핑에서 누가 FK를 관리하는지, 왜 양쪽 다 값을 넣어야 하는지 확인합니다.",
                """
                객체는 **참조**로, 테이블은 **외래 키(FK)** 로 연관을 맺습니다. 이 차이를 매핑하는 것이 연관관계 매핑입니다.

                - `@ManyToOne`: 다대일. FK가 있는 쪽(Member.team → MEMBER.team_id). 가장 많이 사용.
                - `@OneToMany(mappedBy = "...")`: 일대다의 반대 방향. 읽기 전용 거울.
                - 그 외 `@OneToOne`, `@ManyToMany` 가 있습니다.

                **연관관계의 주인(owner)**: 테이블의 FK는 하나인데 객체의 참조는 양쪽에 둘 수 있으므로, \
                둘 중 **FK를 관리(등록/수정)할 쪽**을 정해야 합니다.
                - 주인: FK가 있는 테이블에 매핑된 쪽 = `@ManyToOne` 쪽 (mappedBy 없는 쪽)
                - 주인이 아닌 쪽: `mappedBy` 로 주인을 지정. **읽기만 가능**, 값을 넣어도 FK에 반영 안 됨.

                양방향 관계에서는 주인에만 값을 넣어도 DB는 정상이지만, 같은 영속성 컨텍스트 안에서 \
                반대쪽 컬렉션을 조회하면 비어 있는 객체 상태 불일치가 생깁니다. 그래서 **양쪽에 모두 값을 \
                설정하는 연관관계 편의 메서드**를 만드는 것이 정석입니다.
                """,
                """
                - 모든 연관관계는 **`fetch = FetchType.LAZY`** 로 시작하세요. `@ManyToOne`, `@OneToOne` 의 기본값은 EAGER라서 명시적으로 LAZY를 지정해야 합니다.
                - `@ManyToMany` 는 실무에서 사용 금지에 가깝습니다. 중간 테이블에 컬럼(등록일, 수량 등)을 추가할 수 없으므로, **중간 엔티티를 직접 만들어 `@OneToMany` + `@ManyToOne` 으로 풀어내세요.**
                - 일대다 단방향(`@OneToMany` + `@JoinColumn`)은 FK가 반대 테이블에 있어서 INSERT 후 별도의 UPDATE가 추가 실행됩니다. 다대일 양방향을 권장합니다.
                - 편의 메서드는 한쪽에만 만들고(보통 주인 쪽 또는 비즈니스상 중심인 쪽), 기존 관계 제거 로직까지 포함하세요 (`changeTeam` 처럼).
                """,
                """
                - 운영 도메인 설계의 일반 원칙: 우선 **단방향 `@ManyToOne` 만**으로 시작하고, "팀에서 회원 목록을 객체 그래프로 탐색해야 하는" 요구가 실제로 생길 때만 양방향을 추가합니다. 양방향은 관리 포인트(편의 메서드, 무한루프 toString/JSON)가 늘어납니다.
                - 양방향 엔티티를 그대로 JSON 직렬화하면 무한 루프가 발생합니다. 컨트롤러에서는 엔티티가 아닌 DTO로 변환해서 반환하는 것이 표준입니다.
                - FK 컬럼에는 DB 레벨 FK 제약조건을 걸지 말지 팀 정책이 갈립니다. 정합성이 중요한 금융/커머스는 걸고, 대량 쓰기 성능과 유연성이 중요한 곳은 인덱스만 거는 경우도 많습니다.
                """,
                """
                @Entity
                class Member {
                    @ManyToOne(fetch = FetchType.LAZY)  // 연관관계의 주인 (FK 관리)
                    @JoinColumn(name = "team_id")
                    private Team team;

                    public void changeTeam(Team team) {       // 연관관계 편의 메서드
                        if (this.team != null) this.team.getMembers().remove(this);
                        this.team = team;
                        if (team != null) team.getMembers().add(this);
                    }
                }

                @Entity
                class Team {
                    @OneToMany(mappedBy = "team")  // 주인 아님 — 읽기 전용 거울
                    private List<Member> members = new ArrayList<>();
                }
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("1) 다대일 저장 — 주인(Member.team)에 값을 넣으면 FK가 저장됨", em -> {
            Team team = em.createQuery("select t from Team t where t.name = '개발팀'", Team.class)
                    .getSingleResult();
            Member member = new Member("신규입사자", 25, new Address("서울", "성수이로 1", "04780"));
            member.changeTeam(team);
            em.persist(member);
            ctx.log("member.changeTeam(개발팀) 후 persist → INSERT의 team_id 컬럼에 FK가 들어갑니다.");
        });

        ctx.inTx("2) 주인이 아닌 쪽에만 값을 넣으면? — FK 반영 안 됨 ❌", em -> {
            Team team = em.createQuery("select t from Team t where t.name = '마케팅팀'", Team.class)
                    .getSingleResult();
            Member member = new Member("잘못저장된회원", 28, new Address("서울", "어딘가 1", "00000"));
            em.persist(member);
            team.getMembers().add(member); // 주인이 아닌 쪽(mappedBy)만 변경 — 무시된다!
            ctx.log("team.getMembers().add(member) 만 호출 — Member.team 은 그대로 null");
            ctx.log("INSERT SQL의 team_id가 null인 것을 확인하세요 (UPDATE도 없음).");
        });

        ctx.inTx("3) 2)의 결과 확인 — 마케팅팀 소속이 아님", em -> {
            Member m = em.createQuery("select m from Member m where m.name = '잘못저장된회원'", Member.class)
                    .getSingleResult();
            ctx.log("잘못저장된회원의 team = " + (m.getTeam() == null ? "null ❌" : m.getTeam().getName()));
            ctx.log("→ 연관관계의 주인(@ManyToOne 쪽)에 값을 설정해야 FK가 저장됩니다.");
        });

        ctx.inTx("4) 양방향 객체 그래프 탐색", em -> {
            Team team = em.createQuery("select t from Team t where t.name = '개발팀'", Team.class)
                    .getSingleResult();
            ctx.log("개발팀 회원 목록 (team.getMembers() 접근 시 지연 로딩 SELECT 실행):");
            team.getMembers().forEach(m -> ctx.log("  - " + m.getName() + " (" + m.getAge() + "세)"));
        });
    }
}
