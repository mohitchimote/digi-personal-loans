package com.digibank.rule.mandates;

import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.test.context.TestPropertySource;

import java.lang.annotation.*;

/** A JPA slice on an in-memory database, with the placeholders the real application.yml expects filled in.
 * Production is MySQL, which tests do not have: H2 catches mapping and rule mistakes, not dialect ones. */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@DataJpaTest
@TestPropertySource(properties = {
        "DB_USERNAME=sa", "DB_PASSWORD=", "JWT_SECRET=test-secret-test-secret-test-secret-0123456789",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "eureka.client.enabled=false"
})
public @interface RuleDbTest {}
