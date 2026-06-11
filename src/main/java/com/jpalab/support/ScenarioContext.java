package com.jpalab.support;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;

/**
 * 시나리오 실행 컨텍스트.
 * 각 단계(step)별로 실행된 SQL 과 로그, 예외를 수집해서 화면에 보여줄 수 있게 한다.
 * 학습 목적상 스프링의 @Transactional 대신 EntityManager 와 트랜잭션을 직접 다룬다.
 */
public class ScenarioContext implements AutoCloseable {

    private final EntityManagerFactory emf;
    private final List<StepResult> steps = new ArrayList<>();
    private final List<EntityManager> openedEntityManagers = new ArrayList<>();

    private String currentStepName;
    private List<String> currentLogs;

    public ScenarioContext(EntityManagerFactory emf) {
        this.emf = emf;
    }

    @FunctionalInterface
    public interface ThrowingRunnable {
        void run() throws Exception;
    }

    /**
     * 하나의 단계를 실행한다. 단계 안에서 실행된 SQL 과 발생한 예외를 모두 기록하고,
     * 예외가 발생해도 시나리오는 계속 진행된다 (예외 자체를 체험하는 것이 목적이므로).
     */
    public void step(String name, ThrowingRunnable work) {
        currentStepName = name;
        currentLogs = new ArrayList<>();
        StepResult.ErrorInfo error = null;
        SqlCaptureInspector.start();
        try {
            work.run();
        } catch (Throwable t) {
            error = StepResult.ErrorInfo.from(t);
        }
        List<String> sql = SqlCaptureInspector.drain();
        steps.add(new StepResult(name, currentLogs, sql, error));
        currentStepName = null;
        currentLogs = null;
    }

    /** 새 EntityManager 를 열고 트랜잭션 안에서 작업을 실행한 뒤 커밋한다. 예외 시 롤백. */
    public void inTx(String name, Consumer<EntityManager> work) {
        step(name, () -> {
            EntityManager em = emf.createEntityManager();
            EntityTransaction tx = em.getTransaction();
            tx.begin();
            try {
                work.accept(em);
                tx.commit();
            } catch (RuntimeException e) {
                if (tx.isActive()) {
                    tx.rollback();
                    log("⚠ 예외가 발생해서 트랜잭션이 롤백되었습니다.");
                }
                throw e;
            } finally {
                em.close();
            }
        });
    }

    /** 직접 트랜잭션을 제어하고 싶을 때 사용할 EntityManager. 시나리오 종료 시 자동으로 close 된다. */
    public EntityManager newEntityManager() {
        EntityManager em = emf.createEntityManager();
        openedEntityManagers.add(em);
        return em;
    }

    /** 현재 단계에 로그를 남긴다. */
    public void log(String message) {
        if (currentLogs != null) {
            currentLogs.add(message);
        }
    }

    /** 코드 실행 없이 설명만 담는 단계 */
    public void note(String name, String... messages) {
        step(name, () -> {
            for (String m : messages) {
                log(m);
            }
        });
    }

    public List<StepResult> steps() {
        return steps;
    }

    @Override
    public void close() {
        for (EntityManager em : openedEntityManagers) {
            try {
                if (em.getTransaction().isActive()) {
                    em.getTransaction().rollback();
                }
                if (em.isOpen()) {
                    em.close();
                }
            } catch (Exception ignored) {
            }
        }
    }
}
