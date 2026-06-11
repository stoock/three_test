package com.jpalab.scenario;

import com.jpalab.support.ScenarioContext;

/** 실행 가능한 학습 시나리오 */
public interface Scenario {

    ScenarioDoc doc();

    void run(ScenarioContext ctx);
}
