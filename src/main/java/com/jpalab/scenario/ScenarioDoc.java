package com.jpalab.scenario;

/**
 * 시나리오 문서.
 *
 * @param id         URL 에 쓰이는 식별자
 * @param category   사이드바 분류
 * @param order      카테고리 내 정렬 순서
 * @param title      제목
 * @param summary    한 줄 요약
 * @param concept    공식적인 개념 설명 (JPA 명세/하이버네이트 기준)
 * @param tips       실무 팁
 * @param production 운영 환경에서 자주 사용되는 방법
 * @param code       실행 버튼이 수행하는 코드의 핵심부
 */
public record ScenarioDoc(
        String id,
        String category,
        int order,
        String title,
        String summary,
        String concept,
        String tips,
        String production,
        String code
) {
}
