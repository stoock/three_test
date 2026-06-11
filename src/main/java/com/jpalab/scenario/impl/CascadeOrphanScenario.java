package com.jpalab.scenario.impl;

import com.jpalab.domain.*;
import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.support.ScenarioContext;
import org.springframework.stereotype.Component;

@Component
public class CascadeOrphanScenario implements Scenario {

    @Override
    public ScenarioDoc doc() {
        return new ScenarioDoc(
                "cascade-orphan",
                "연관관계 매핑", 2,
                "영속성 전이(Cascade)와 고아 객체(orphanRemoval)",
                "부모만 persist하면 자식까지 저장되고, 컬렉션에서 빼면 DELETE 되는 것을 확인합니다.",
                """
                **영속성 전이(`cascade`)**: 부모 엔티티에 대한 영속성 작업을 자식에게 전파합니다.
                - `PERSIST`: 부모 persist 시 자식도 persist
                - `REMOVE`: 부모 remove 시 자식도 remove
                - `ALL`: 모든 작업 전파 (PERSIST + REMOVE + MERGE + REFRESH + DETACH)

                **고아 객체 제거(`orphanRemoval = true`)**: 부모와의 연관관계가 끊어진 자식을 \
                자동으로 삭제합니다. 컬렉션에서 `remove()` 만 해도 DELETE SQL이 실행됩니다.

                `cascade = ALL` + `orphanRemoval = true` 를 함께 쓰면 부모가 자식의 생명주기를 \
                완전히 관리하게 됩니다. 자식 리포지토리 없이 부모를 통해서만 저장/삭제하는 \
                도메인 주도 설계의 **애그리거트(Aggregate)** 패턴을 구현할 수 있습니다.
                """,
                """
                - cascade 적용 기준 2가지를 모두 만족할 때만 쓰세요: (1) 자식의 **소유자가 부모 하나뿐**일 때 (Order→OrderItem ⭕, Order→Product ❌), (2) 부모와 자식의 **생명주기가 같을 때**.
                - 다른 곳에서도 참조하는 엔티티에 `cascade = REMOVE` 나 `orphanRemoval` 을 걸면 의도치 않은 삭제 사고가 납니다. Product 같은 공유 엔티티에는 절대 금지.
                - `orphanRemoval = true` 와 `cascade = REMOVE` 의 차이: orphanRemoval은 "관계가 끊기기만 해도" 삭제, REMOVE는 "부모가 삭제될 때만" 전파.
                - 컬렉션 필드는 항상 `new ArrayList<>()` 로 초기화해 두세요. Hibernate가 영속화하면서 내부 컬렉션으로 감싸기 때문에, 영속화 이후 컬렉션을 새 것으로 갈아끼우면 안 됩니다.
                """,
                """
                - 운영에서 가장 흔한 사용처: **주문-주문상품, 게시글-첨부파일, 설문-문항**처럼 부모 없이는 의미가 없는 구성요소 관계. 부모 리포지토리 하나로 전체 그래프를 저장/삭제해 코드가 크게 단순해집니다.
                - 자식 컬렉션을 통째로 교체하는 "전체 삭제 후 재등록" 패턴(`items.clear()` 후 다시 add)은 orphanRemoval과 결합하면 간단하지만 DELETE/INSERT가 많이 발생합니다. 수정 빈도가 높으면 diff 기반 업데이트를 고려하세요.
                - 대량의 자식을 가진 부모를 cascade REMOVE로 지우면 자식을 **한 건씩 DELETE** 합니다. 자식이 수천 건 이상이면 벌크 delete 쿼리로 먼저 자식을 지우는 것이 훨씬 빠릅니다.
                """,
                """
                @Entity
                class Order {
                    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
                    private List<OrderItem> orderItems = new ArrayList<>();
                }

                Order order = new Order(member);
                order.addOrderItem(new OrderItem(laptop, 1_500_000, 1));
                order.addOrderItem(new OrderItem(mouse, 45_000, 2));
                em.persist(order);              // 부모만 persist → INSERT 3건 (cascade)

                order.getOrderItems().remove(0); // 컬렉션에서 제거 → DELETE 1건 (orphanRemoval)
                em.remove(order);                // 부모 삭제 → 남은 자식까지 DELETE (cascade)
                """
        );
    }

    @Override
    public void run(ScenarioContext ctx) {
        Long[] orderId = new Long[1];

        ctx.inTx("1) cascade = ALL — 부모만 persist해도 자식까지 INSERT", em -> {
            Member member = em.createQuery("select m from Member m where m.name = '이백엔드'", Member.class)
                    .getSingleResult();
            Product laptop = em.createQuery("select p from Product p where p.name = '노트북'", Product.class)
                    .getSingleResult();
            Product mouse = em.createQuery("select p from Product p where p.name = '무선 마우스'", Product.class)
                    .getSingleResult();

            Order order = new Order(member);
            order.addOrderItem(new OrderItem(laptop, laptop.getPrice(), 1));
            order.addOrderItem(new OrderItem(mouse, mouse.getPrice(), 2));
            em.persist(order); // OrderItem은 persist 호출 안 함!
            orderId[0] = order.getId();
            ctx.log("em.persist(order) 한 번 → orders 1건 + order_item 2건 INSERT (SQL 확인)");
        });

        ctx.inTx("2) orphanRemoval — 컬렉션에서 제거하면 DELETE", em -> {
            Order order = em.find(Order.class, orderId[0]);
            ctx.log("주문상품 수 (제거 전): " + order.getOrderItems().size());
            order.getOrderItems().remove(0);
            ctx.log("orderItems.remove(0) 만 호출 — em.remove() 호출 없음");
            ctx.log("커밋 시 고아가 된 OrderItem의 DELETE가 실행됩니다 (SQL 확인).");
        });

        ctx.inTx("3) 부모 삭제 — cascade로 남은 자식까지 DELETE", em -> {
            Order order = em.find(Order.class, orderId[0]);
            em.remove(order);
            ctx.log("em.remove(order) → order_item DELETE 후 orders DELETE (순서 확인)");
        });
    }
}
