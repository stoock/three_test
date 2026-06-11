package com.jpalab.support;

import java.util.List;

/** 시나리오의 한 단계 실행 결과 (로그, 실행된 SQL, 발생한 예외) */
public record StepResult(String name, List<String> logs, List<String> sql, ErrorInfo error) {

    public record ErrorInfo(String exceptionType, String message, List<String> causeChain) {

        public static ErrorInfo from(Throwable t) {
            List<String> chain = new java.util.ArrayList<>();
            Throwable cur = t;
            while (cur != null) {
                chain.add(cur.getClass().getName() + (cur.getMessage() != null ? ": " + cur.getMessage() : ""));
                cur = cur.getCause();
            }
            return new ErrorInfo(t.getClass().getSimpleName(), t.getMessage(), chain);
        }
    }
}
