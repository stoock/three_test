package com.jpalab;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling // 미사용 세션 DB 자동 정리
public class JpaLabApplication {

    public static void main(String[] args) {
        SpringApplication.run(JpaLabApplication.class, args);
    }
}
