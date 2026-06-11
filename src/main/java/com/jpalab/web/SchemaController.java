package com.jpalab.web;

import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.metamodel.Attribute;
import jakarta.persistence.metamodel.PluralAttribute;
import jakarta.persistence.metamodel.SingularAttribute;
import org.hibernate.engine.spi.SessionFactoryImplementor;
import org.hibernate.persister.entity.AbstractEntityPersister;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 스크래치 패드 옆에 보여줄 엔티티/속성 레퍼런스.
 * JPQL용 이름과 함께, 네이티브 SQL에서 쓸 실제 테이블/컬럼명도 내려준다.
 */
@RestController
@RequestMapping("/api/schema")
public class SchemaController {

    /** 자주 쓰는 순서대로 노출 */
    private static final List<String> ENTITY_ORDER =
            List.of("Member", "Team", "Order", "OrderItem", "Product", "Item", "Book", "Album");

    private final EntityManagerFactory emf;

    public SchemaController(EntityManagerFactory emf) {
        this.emf = emf;
    }

    @GetMapping
    public List<Map<String, Object>> schema() {
        SessionFactoryImplementor sf = emf.unwrap(SessionFactoryImplementor.class);
        List<Map<String, Object>> entities = new ArrayList<>();
        emf.getMetamodel().getEntities().stream()
                .sorted(Comparator.comparingInt(e -> {
                    int i = ENTITY_ORDER.indexOf(e.getName());
                    return i < 0 ? Integer.MAX_VALUE : i;
                }))
                .forEach(entity -> {
                    AbstractEntityPersister persister = resolvePersister(sf, entity.getJavaType());
                    Map<String, Object> info = new LinkedHashMap<>();
                    info.put("name", entity.getName());
                    info.put("table", persister != null ? persister.getTableName() : toSnake(entity.getName()));

                    List<Map<String, Object>> attributes = new ArrayList<>();
                    entity.getAttributes().stream()
                            .sorted(Comparator
                                    .comparingInt(this::attributeRank)
                                    .thenComparing(Attribute::getName))
                            .forEach(attr -> {
                                Map<String, Object> a = new LinkedHashMap<>();
                                boolean isId = attr instanceof SingularAttribute<?, ?> sa && sa.isId();
                                a.put("name", attr.getName());
                                a.put("type", typeName(attr));
                                a.put("kind", attr.isCollection() ? "컬렉션"
                                        : attr.isAssociation() ? "연관관계" : "필드");
                                a.put("isId", isId);
                                a.put("column", resolveColumns(persister, attr, isId));
                                attributes.add(a);
                            });
                    info.put("attributes", attributes);
                    entities.add(info);
                });
        return entities;
    }

    /** 정렬: PK → 일반 필드 → 연관관계 → 컬렉션 */
    private int attributeRank(Attribute<?, ?> attr) {
        if (attr instanceof SingularAttribute<?, ?> sa && sa.isId()) return 0;
        if (attr.isCollection()) return 3;
        if (attr.isAssociation()) return 2;
        return 1;
    }

    private String typeName(Attribute<?, ?> attr) {
        if (attr instanceof PluralAttribute<?, ?, ?> plural) {
            return "List<" + plural.getElementType().getJavaType().getSimpleName() + ">";
        }
        return attr.getJavaType().getSimpleName();
    }

    private AbstractEntityPersister resolvePersister(SessionFactoryImplementor sf, Class<?> type) {
        try {
            return (AbstractEntityPersister) sf.getMappingMetamodel().getEntityDescriptor(type);
        } catch (Exception e) {
            return null;
        }
    }

    /** 속성이 매핑된 실제 컬럼명. 컬렉션(mappedBy)은 이 테이블에 컬럼이 없다. */
    private String resolveColumns(AbstractEntityPersister persister, Attribute<?, ?> attr, boolean isId) {
        if (attr.isCollection()) {
            return "";
        }
        if (persister != null) {
            try {
                String[] cols = isId
                        ? persister.getIdentifierColumnNames()
                        : persister.getPropertyColumnNames(attr.getName());
                if (cols != null && cols.length > 0) {
                    return String.join(", ", cols);
                }
            } catch (Exception ignored) {
                // 모르는 매핑이면 네이밍 전략 추정으로 폴백
            }
        }
        return toSnake(attr.getName()) + (attr.isAssociation() ? "_id" : "");
    }

    /** Spring Boot 기본 네이밍 전략(CamelCase → snake_case) 추정 */
    private String toSnake(String name) {
        return name.replaceAll("([a-z0-9])([A-Z])", "$1_$2").toLowerCase(Locale.ROOT);
    }
}
