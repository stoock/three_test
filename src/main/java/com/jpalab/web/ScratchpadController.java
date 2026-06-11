package com.jpalab.web;

import com.jpalab.service.DataResetService;
import com.jpalab.support.SqlCaptureInspector;
import com.jpalab.support.StepResult;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.Query;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 스크래치 패드: JPQL / 네이티브 SQL 을 직접 입력해 실행하고
 * 결과·실행된 SQL·예외를 그대로 확인할 수 있다.
 */
@RestController
@RequestMapping("/api/scratchpad")
public class ScratchpadController {

    private static final int MAX_ROWS = 200;

    private final EntityManagerFactory emf;
    private final DataResetService dataResetService;

    public ScratchpadController(EntityManagerFactory emf, DataResetService dataResetService) {
        this.emf = emf;
        this.dataResetService = dataResetService;
    }

    public record ScratchpadRequest(String type, String query) {
    }

    @PostMapping
    public Map<String, Object> execute(@RequestBody ScratchpadRequest request) {
        String query = request.query() == null ? "" : request.query().trim();
        if (query.isEmpty()) {
            return Map.of("error", Map.of("exceptionType", "EmptyQuery", "message", "쿼리를 입력하세요.",
                    "causeChain", List.of()));
        }
        boolean nativeSql = "sql".equalsIgnoreCase(request.type());

        Map<String, Object> response = new LinkedHashMap<>();
        EntityManager em = emf.createEntityManager();
        EntityTransaction tx = em.getTransaction();
        SqlCaptureInspector.start();
        try {
            tx.begin();
            Query q = nativeSql ? em.createNativeQuery(query) : em.createQuery(query);
            if (isSelect(query)) {
                q.setMaxResults(MAX_ROWS);
                List<?> resultList = q.getResultList();
                response.put("resultType", "rows");
                response.put("rowCount", resultList.size());
                response.put("rows", toRows(resultList));
                if (resultList.size() == MAX_ROWS) {
                    response.put("notice", "결과가 " + MAX_ROWS + "행으로 잘렸습니다.");
                }
            } else {
                int affected = q.executeUpdate();
                response.put("resultType", "update");
                response.put("affectedRows", affected);
            }
            tx.commit();
        } catch (Throwable t) {
            if (tx.isActive()) {
                tx.rollback();
            }
            response.put("error", StepResult.ErrorInfo.from(t));
        } finally {
            response.put("executedSql", SqlCaptureInspector.drain());
            em.close();
        }
        return response;
    }

    @PostMapping("/reset")
    public Map<String, Object> reset() {
        dataResetService.reset();
        return Map.of("message", "데이터가 초기 상태로 복원되었습니다.");
    }

    private boolean isSelect(String query) {
        String lower = query.toLowerCase(Locale.ROOT);
        return lower.startsWith("select") || lower.startsWith("from") || lower.startsWith("with")
                || lower.startsWith("show") || lower.startsWith("explain");
    }

    /** 결과를 화면에 보여줄 수 있는 문자열 행으로 변환 */
    private List<List<String>> toRows(List<?> resultList) {
        List<List<String>> rows = new ArrayList<>();
        for (Object result : resultList) {
            List<String> row = new ArrayList<>();
            if (result instanceof Object[] columns) {
                for (Object col : columns) {
                    row.add(stringify(col));
                }
            } else {
                row.add(stringify(result));
            }
            rows.add(row);
        }
        return rows;
    }

    private String stringify(Object value) {
        return value == null ? "null" : String.valueOf(value);
    }
}
