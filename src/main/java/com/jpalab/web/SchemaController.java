package com.jpalab.web;

import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.metamodel.Attribute;
import jakarta.persistence.metamodel.EntityType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 스크래치 패드 옆에 보여줄 엔티티/속성 레퍼런스 */
@RestController
@RequestMapping("/api/schema")
public class SchemaController {

    private final EntityManagerFactory emf;

    public SchemaController(EntityManagerFactory emf) {
        this.emf = emf;
    }

    @GetMapping
    public List<Map<String, Object>> schema() {
        List<Map<String, Object>> entities = new ArrayList<>();
        emf.getMetamodel().getEntities().stream()
                .sorted(Comparator.comparing(EntityType::getName))
                .forEach(entity -> {
                    Map<String, Object> info = new LinkedHashMap<>();
                    info.put("name", entity.getName());
                    List<Map<String, String>> attributes = new ArrayList<>();
                    entity.getAttributes().stream()
                            .sorted(Comparator.comparing(Attribute::getName))
                            .forEach(attr -> attributes.add(Map.of(
                                    "name", attr.getName(),
                                    "type", attr.getJavaType().getSimpleName(),
                                    "kind", attr.isAssociation() ? "연관관계"
                                            : attr.isCollection() ? "컬렉션" : "필드"
                            )));
                    info.put("attributes", attributes);
                    entities.add(info);
                });
        return entities;
    }
}
