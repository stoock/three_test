package com.jpalab.scenario.impl;

import com.jpalab.domain.Address;
import com.jpalab.domain.Book;
import com.jpalab.domain.Item;
import com.jpalab.domain.Member;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class EmbeddedInheritanceScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "embedded-inheritance",
                "연관관계 매핑", 3,
                "임베디드 타입과 상속 매핑",
                "값 타입(@Embeddable)이 컬럼으로 펼쳐지는 것과, 상속 구조가 한 테이블로 매핑되는 것을 확인합니다.",
                """
                **임베디드 타입(`@Embeddable` / `@Embedded`)** 은 새로운 값 타입을 직접 정의하는 기능입니다. \
                `Address(city, street, zipcode)` 처럼 관련 필드를 객체로 묶으면, 테이블에는 그대로 \
                컬럼으로 펼쳐져 저장되지만(테이블 구조 변화 없음) 객체지향적으로는 응집된 타입을 갖게 됩니다.

                값 타입은 식별자가 없고 **값으로만 비교**되므로, 공유 참조 부작용을 막기 위해 \
                **불변(immutable)으로 설계**하는 것이 원칙입니다 (setter 없이 생성자로만 값 설정).

                **상속 관계 매핑** 전략 3가지:
                - `SINGLE_TABLE` (기본값): 한 테이블 + 구분 컬럼(`@DiscriminatorColumn`, dtype). 조인이 없어 빠르지만 자식 컬럼이 모두 nullable.
                - `JOINED`: 부모/자식 각각 테이블. 정규화되고 깔끔하지만 조회 시 조인 필요.
                - `TABLE_PER_CLASS`: 자식마다 완전한 테이블. 부모 타입 조회 시 UNION이 필요해서 **권장하지 않습니다.**
                """,
                """
                - 임베디드 타입은 불변으로! setter를 제공하면 여러 엔티티가 같은 Address 인스턴스를 공유할 때 한쪽 수정이 다른 쪽에 전파되는 사고가 납니다. 값을 바꾸려면 **새 인스턴스로 통째로 교체**하세요.
                - 한 엔티티에 같은 임베디드 타입을 두 번 쓰면 컬럼명이 충돌합니다 → `@AttributeOverrides` 로 컬럼명을 재정의하세요 (예: homeAddress, workAddress).
                - 상속 전략 선택 기준: 자식 타입이 적고 단순하면 SINGLE_TABLE, 자식별 컬럼이 많고 데이터 정합성이 중요하면 JOINED. 일단 SINGLE_TABLE로 시작해서 필요할 때 바꾸는 접근도 많습니다.
                - 상속보다 `@MappedSuperclass` 가 적합한 경우: 테이블과 무관하게 **공통 필드(생성일, 수정일 등)만 물려주고 싶을 때**. 운영에서는 `BaseEntity` + Auditing 조합으로 거의 모든 프로젝트에서 사용합니다.
                """,
                """
                - 운영에서 임베디드 타입의 대표 활용: 주소(Address), 기간(Period), 금액(Money). 검증 로직과 포맷팅을 값 타입 안에 응집시켜 도메인 코드가 깨끗해집니다.
                - 거의 모든 운영 프로젝트가 사용하는 패턴:
                  `@MappedSuperclass` + `@EntityListeners(AuditingEntityListener.class)` 로 만든 BaseEntity에 `createdAt`, `updatedAt`, `createdBy` 를 두고 전 엔티티가 상속.
                - 상속 매핑은 결제수단(카드/계좌이체/포인트), 알림(이메일/SMS/푸시)처럼 **타입별 동작이 다른 도메인**에 효과적입니다. 단, 타입이 계속 늘어나는 도메인이라면 상속 대신 구성(composition)이나 별도 테이블 설계를 검토하세요.
                """,
                """
                @Embeddable
                class Address { private String city; private String street; private String zipcode; }

                @Entity
                class Member {
                    @Embedded private Address address;  // MEMBER 테이블에 city/street/zipcode 컬럼으로 펼쳐짐
                }

                @Entity
                @Inheritance(strategy = InheritanceType.SINGLE_TABLE)
                @DiscriminatorColumn(name = "dtype")
                abstract class Item { ... }

                @Entity @DiscriminatorValue("BOOK")  class Book extends Item { String author; }
                @Entity @DiscriminatorValue("ALBUM") class Album extends Item { String artist; }

                List<Item> items = em.createQuery("select i from Item i", Item.class).getResultList();
                // 다형 조회 — Book, Album이 함께 조회된다
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        ctx.inTx("1) 임베디드 타입 — 객체로 묶고 컬럼으로 펼친다", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            ctx.log("member.getAddress() = " + member.getAddress());
            ctx.log("SELECT SQL을 보면 별도 테이블/조인 없이 member 테이블의 city, street, zipcode 컬럼입니다.");
        });

        ctx.inTx("2) 값 교체는 새 인스턴스로", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '김개발'", Member.class)
                    .getSingleResult();
            member.setAddress(new Address("제주", "첨단로 242", "63309"));
            ctx.log("address 필드를 새 Address 인스턴스로 통째로 교체 → 변경 감지로 UPDATE 실행");
        });

        ctx.inTx("3) 상속 매핑 — 부모 타입으로 다형 조회", em -> {
            List<Item> items = em.createQuery("select i from Item i", Item.class).getResultList();
            for (Item item : items) {
                ctx.log("  - [" + item.getClass().getSimpleName() + "] " + item.getName() + " (" + item.getPrice() + "원)");
            }
            ctx.log("SINGLE_TABLE 전략: 테이블 1개를 조회하며 dtype 컬럼으로 타입을 구분합니다.");
        });

        ctx.inTx("4) 자식 타입만 조회 — dtype 조건이 자동 추가", em -> {
            List<Book> books = em.createQuery("select b from Book b", Book.class).getResultList();
            books.forEach(b -> ctx.log("  - " + b.getName() + " / 저자: " + b.getAuthor()));
            ctx.log("SQL의 where 절에 dtype='BOOK' 조건이 자동으로 붙은 것을 확인하세요.");
        });
    }
}
