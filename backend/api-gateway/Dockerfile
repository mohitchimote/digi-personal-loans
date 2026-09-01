# syntax=docker/dockerfile:1.7

# ---- Build stage ------------------------------------------------------------
# Matches this service's <java.version> in pom.xml.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build

# Dependencies in their own layer — only re-downloaded when pom.xml itself changes.
COPY pom.xml .
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -DskipTests package

# ---- Runtime stage ------------------------------------------------------------
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

COPY --from=build /build/target/api-gateway-1.0.0.jar app.jar

EXPOSE 8080

# api-gateway has no auth filter of its own (it's a pure reverse proxy — see
# ARCHITECTURE.md/DigiLend_Production_Architecture.docx §3.2), so /actuator/health needs no
# permit-list entry the way the six downstream services do.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:8080/actuator/health | grep -q '"status":"UP"' || exit 1

# Java has been container-memory-aware (respects cgroup limits) by default since JDK 10.
# MaxRAMPercentage reserves headroom for non-heap memory (metaspace, threads) within whatever
# container memory limit is set at deploy time.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
