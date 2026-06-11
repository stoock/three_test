package com.jpalab.service;

import com.jpalab.domain.*;
import jakarta.annotation.PreDestroy;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.boot.MetadataSources;
import org.hibernate.boot.registry.StandardServiceRegistryBuilder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Comparator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 브라우저 세션마다 독립된 H2 인메모리 DB(+EntityManagerFactory)를 제공한다.
 * 여러 사람이 동시에 접속해도 서로의 시나리오 실행/스크래치패드 데이터가 섞이지 않는다.
 * 일정 시간 사용하지 않은 세션 DB는 자동으로 닫아 메모리를 회수한다.
 */
@Service
public class LabDatabaseManager {

    private static final Logger log = LoggerFactory.getLogger(LabDatabaseManager.class);

    private static final long IDLE_TIMEOUT_MS = 30 * 60 * 1000L; // 30분 미사용 시 정리
    private static final int MAX_SESSIONS = 50;                  // 동시 세션 상한 (초과 시 가장 오래된 것 정리)

    private final DataResetService dataResetService;
    private final Map<String, LabDb> databases = new ConcurrentHashMap<>();

    public LabDatabaseManager(DataResetService dataResetService) {
        this.dataResetService = dataResetService;
    }

    private record LabDb(EntityManagerFactory emf, String url, AtomicLong lastAccess) {
    }

    public EntityManagerFactory emfFor(String sessionId) {
        return access(sessionId).emf();
    }

    /** H2 콘솔 접속 등에 안내할 세션 전용 JDBC URL */
    public String jdbcUrlFor(String sessionId) {
        return access(sessionId).url();
    }

    private LabDb access(String sessionId) {
        LabDb db = databases.computeIfAbsent(sessionId, this::create);
        db.lastAccess().set(System.currentTimeMillis());
        return db;
    }

    private LabDb create(String sessionId) {
        if (databases.size() >= MAX_SESSIONS) {
            evictOldest();
        }
        String dbName = "lab_" + sanitize(sessionId);
        String url = "jdbc:h2:mem:" + dbName + ";DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=1500";

        SessionFactory sessionFactory = new MetadataSources(
                new StandardServiceRegistryBuilder()
                        .applySetting("hibernate.connection.url", url)
                        .applySetting("hibernate.connection.driver_class", "org.h2.Driver")
                        .applySetting("hibernate.connection.username", "sa")
                        .applySetting("hibernate.connection.password", "")
                        .applySetting("hibernate.connection.pool_size", "5")
                        .applySetting("hibernate.hbm2ddl.auto", "create")
                        .applySetting("hibernate.session_factory.statement_inspector",
                                com.jpalab.support.SqlCaptureInspector.class.getName())
                        .build())
                .addAnnotatedClass(Member.class)
                .addAnnotatedClass(Team.class)
                .addAnnotatedClass(Order.class)
                .addAnnotatedClass(OrderItem.class)
                .addAnnotatedClass(Product.class)
                .addAnnotatedClass(Item.class)
                .addAnnotatedClass(Book.class)
                .addAnnotatedClass(Album.class)
                .buildMetadata()
                .buildSessionFactory();

        dataResetService.reset(sessionFactory); // 첫 접속 시 시드 데이터 준비
        log.info("세션 DB 생성: {} (활성 세션 {}개)", dbName, databases.size() + 1);
        return new LabDb(sessionFactory, url, new AtomicLong(System.currentTimeMillis()));
    }

    private String sanitize(String sessionId) {
        String safe = sessionId.replaceAll("[^a-zA-Z0-9]", "");
        return safe.length() > 24 ? safe.substring(0, 24) : safe;
    }

    @Scheduled(fixedDelay = 60_000)
    public void evictIdle() {
        long deadline = System.currentTimeMillis() - IDLE_TIMEOUT_MS;
        databases.entrySet().removeIf(e -> {
            if (e.getValue().lastAccess().get() < deadline) {
                close(e.getKey(), e.getValue());
                return true;
            }
            return false;
        });
    }

    private void evictOldest() {
        databases.entrySet().stream()
                .min(Comparator.comparingLong(e -> e.getValue().lastAccess().get()))
                .ifPresent(e -> {
                    databases.remove(e.getKey());
                    close(e.getKey(), e.getValue());
                });
    }

    private void close(String sessionId, LabDb db) {
        try {
            db.emf().close();
            // DB_CLOSE_DELAY=-1 로 살아있는 인메모리 DB의 메모리를 명시적으로 회수
            try (Connection c = DriverManager.getConnection(db.url(), "sa", "")) {
                c.createStatement().execute("SHUTDOWN");
            }
            log.info("세션 DB 정리: {}", sessionId);
        } catch (Exception e) {
            log.warn("세션 DB 정리 실패: {}", sessionId, e);
        }
    }

    @PreDestroy
    public void closeAll() {
        databases.forEach(this::close);
        databases.clear();
    }
}
