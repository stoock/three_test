package com.jpalab.web;

import com.jpalab.scenario.Scenario;
import com.jpalab.scenario.ScenarioDoc;
import com.jpalab.service.DataResetService;
import com.jpalab.support.ScenarioContext;
import com.jpalab.support.StepResult;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/scenarios")
public class ScenarioController {

    /** 사이드바에 노출되는 학습 순서 */
    private static final List<String> CATEGORY_ORDER = List.of(
            "영속성 컨텍스트", "연관관계 매핑", "지연 로딩과 성능", "동시성과 락", "JPQL과 벌크 연산");

    private final Map<String, Scenario> scenarios = new LinkedHashMap<>();
    private final EntityManagerFactory emf;
    private final DataResetService dataResetService;

    public ScenarioController(List<Scenario> scenarioList, EntityManagerFactory emf,
                              DataResetService dataResetService) {
        scenarioList.stream()
                .sorted(Comparator.comparing((Scenario s) -> {
                            int idx = CATEGORY_ORDER.indexOf(s.doc().category());
                            return idx < 0 ? Integer.MAX_VALUE : idx;
                        })
                        .thenComparing(s -> s.doc().order()))
                .forEach(s -> scenarios.put(s.doc().id(), s));
        this.emf = emf;
        this.dataResetService = dataResetService;
    }

    @GetMapping
    public List<ScenarioDoc> list() {
        return scenarios.values().stream().map(Scenario::doc).toList();
    }

    @PostMapping("/{id}/run")
    public Map<String, Object> run(@PathVariable String id) {
        Scenario scenario = scenarios.get(id);
        if (scenario == null) {
            throw new IllegalArgumentException("존재하지 않는 시나리오: " + id);
        }
        dataResetService.reset(); // 항상 동일한 데이터 상태에서 시작
        try (ScenarioContext ctx = new ScenarioContext(emf)) {
            scenario.run(ctx);
            List<StepResult> steps = ctx.steps();
            return Map.of("scenarioId", id, "steps", steps);
        }
    }
}
