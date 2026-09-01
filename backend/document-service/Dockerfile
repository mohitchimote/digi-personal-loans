# syntax=docker/dockerfile:1.7

# ---- Build stage ------------------------------------------------------------
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

COPY --from=build /build/target/document-service-1.0.0.jar app.jar

# document.storage.path (./document-store, relative to the working directory) holds generated PDFs
# and customer uploads on local disk today (the production target is object storage — see
# DigiLend_Production_Architecture.docx §7.3). Needs a real, writable directory before dropping
# root, and a volume mount in compose/your orchestrator so files survive a container restart.
RUN mkdir -p /app/document-store && chown -R spring:spring /app
USER spring:spring

EXPOSE 8085

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD wget -qO- http://localhost:8085/actuator/health | grep -q '"status":"UP"' || exit 1

# Java has been container-memory-aware (respects cgroup limits) by default since JDK 10.
# MaxRAMPercentage reserves headroom for non-heap memory (metaspace, threads) within whatever
# container memory limit is set at deploy time.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
