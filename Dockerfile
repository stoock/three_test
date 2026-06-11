# JPA Lab — 단일 컨테이너 (외부 DB 불필요, 무상태)
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/jpa-lab-*.jar app.jar
ENV PORT=8080
EXPOSE 8080
# Cloud Run 등이 주입하는 PORT 환경변수를 따른다
ENTRYPOINT ["sh", "-c", "java -Dserver.port=${PORT:-8080} -jar app.jar"]
