package com.digibank.application.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Enables @Async (see EmailClient.send) — port of worker/src/routes/applications.ts's
 * ExecutionContext.waitUntil usage: a notification email has no bearing on the correctness of
 * the state change it's attached to, so it's dispatched on a background thread instead of being
 * awaited inline inside a @Transactional decisioning method. A small bounded pool (rather than
 * Spring's default SimpleAsyncTaskExecutor, which is unbounded) caps how much concurrent email
 * traffic this can generate — proportionate to DigiLend's actual volume, not a guess at scale.
 */
@Configuration
@EnableAsync
public class AsyncConfig {

    @Bean(name = "emailTaskExecutor")
    public Executor emailTaskExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("email-async-");
        executor.initialize();
        return executor;
    }
}
