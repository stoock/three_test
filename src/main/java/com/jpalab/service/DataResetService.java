package com.jpalab.service;

import com.jpalab.domain.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;
import org.springframework.stereotype.Service;

/**
 * 시나리오를 항상 같은 상태에서 시작할 수 있도록 데이터를 초기화한다.
 * 시나리오 실행 전과 스크래치 패드의 "데이터 초기화" 버튼에서 호출된다.
 */
@Service
public class DataResetService {

    private final EntityManagerFactory emf;

    public DataResetService(EntityManagerFactory emf) {
        this.emf = emf;
    }

    public void reset() {
        EntityManager em = emf.createEntityManager();
        EntityTransaction tx = em.getTransaction();
        tx.begin();
        try {
            em.createQuery("delete from OrderItem").executeUpdate();
            em.createQuery("delete from Order").executeUpdate();
            em.createQuery("delete from Member").executeUpdate();
            em.createQuery("delete from Team").executeUpdate();
            em.createQuery("delete from Product").executeUpdate();
            em.createQuery("delete from Item").executeUpdate();

            Team dev = new Team("개발팀");
            Team design = new Team("디자인팀");
            Team marketing = new Team("마케팅팀");
            em.persist(dev);
            em.persist(design);
            em.persist(marketing);

            Member kim = new Member("김개발", 29, new Address("서울", "테헤란로 1", "06234"));
            Member lee = new Member("이백엔드", 32, new Address("서울", "강남대로 100", "06112"));
            Member park = new Member("박프론트", 27, new Address("성남", "판교역로 235", "13494"));
            Member choi = new Member("최디자인", 31, new Address("서울", "을지로 50", "04534"));
            Member jung = new Member("정마케", 35, new Address("부산", "센텀로 99", "48058"));
            kim.changeTeam(dev);
            lee.changeTeam(dev);
            park.changeTeam(dev);
            choi.changeTeam(design);
            jung.changeTeam(marketing);
            em.persist(kim);
            em.persist(lee);
            em.persist(park);
            em.persist(choi);
            em.persist(jung);

            Product laptop = new Product("노트북", 1_500_000, 10);
            Product keyboard = new Product("기계식 키보드", 120_000, 50);
            Product mouse = new Product("무선 마우스", 45_000, 100);
            em.persist(laptop);
            em.persist(keyboard);
            em.persist(mouse);

            Order order1 = new Order(kim);
            order1.addOrderItem(new OrderItem(laptop, laptop.getPrice(), 1));
            order1.addOrderItem(new OrderItem(mouse, mouse.getPrice(), 2));
            em.persist(order1);

            Order order2 = new Order(choi);
            order2.addOrderItem(new OrderItem(keyboard, keyboard.getPrice(), 1));
            em.persist(order2);

            em.persist(new Book("자바 ORM 표준 JPA 프로그래밍", 43_000, "김영한", "9788960777330"));
            em.persist(new Book("객체지향의 사실과 오해", 20_000, "조영호", "9788998139766"));
            em.persist(new Album("코딩할 때 듣는 노래 Vol.1", 15_000, "Lo-Fi Coder"));

            tx.commit();
        } catch (RuntimeException e) {
            if (tx.isActive()) {
                tx.rollback();
            }
            throw e;
        } finally {
            em.close();
        }
    }
}
