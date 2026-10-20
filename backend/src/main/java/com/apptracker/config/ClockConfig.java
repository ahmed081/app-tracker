package com.apptracker.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

@Configuration
public class ClockConfig {

    /** Injected everywhere instead of calling the system time, so tests can control it. */
    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}
