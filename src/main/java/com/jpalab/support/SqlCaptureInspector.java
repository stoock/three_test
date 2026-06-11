package com.jpalab.support;

import org.hibernate.resource.jdbc.spi.StatementInspector;

import java.util.ArrayList;
import java.util.List;

/**
 * Hibernate 가 실행하는 모든 SQL 을 가로채서 현재 스레드 버퍼에 기록한다.
 * 시나리오 실행기와 스크래치 패드가 "실제로 실행된 SQL" 을 화면에 보여주기 위해 사용한다.
 */
public class SqlCaptureInspector implements StatementInspector {

    private static final ThreadLocal<List<String>> BUFFER = new ThreadLocal<>();

    public static void start() {
        BUFFER.set(new ArrayList<>());
    }

    public static List<String> drain() {
        List<String> captured = BUFFER.get();
        BUFFER.remove();
        return captured == null ? List.of() : captured;
    }

    @Override
    public String inspect(String sql) {
        List<String> buffer = BUFFER.get();
        if (buffer != null) {
            buffer.add(sql);
        }
        return sql;
    }
}
