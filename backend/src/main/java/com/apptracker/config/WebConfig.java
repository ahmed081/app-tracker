package com.apptracker.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.filter.ShallowEtagHeaderFilter;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final AppProperties props;

    public WebConfig(AppProperties props) {
        this.props = props;
    }

    /** Lets the web app call the API from another origin (e.g. the Vite dev server). */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(props.corsOrigins().toArray(String[]::new))
                .allowedMethods("GET", "POST")
                .exposedHeaders("ETag");
    }

    /** /api/admin/** requires the X-Admin-Key header. */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new AdminKeyInterceptor(props.adminKey())).addPathPatterns("/api/admin/**");
    }

    /**
     * Adds an ETag to API responses: unchanged data (most requests between two
     * hourly snapshots) is answered with 304 Not Modified.
     */
    @Bean
    public FilterRegistrationBean<ShallowEtagHeaderFilter> etagFilter() {
        FilterRegistrationBean<ShallowEtagHeaderFilter> bean = new FilterRegistrationBean<>(new ShallowEtagHeaderFilter());
        bean.addUrlPatterns("/api/*");
        return bean;
    }

    static final class AdminKeyInterceptor implements HandlerInterceptor {
        private final byte[] key;

        AdminKeyInterceptor(String adminKey) {
            this.key = adminKey == null ? new byte[0] : adminKey.getBytes(StandardCharsets.UTF_8);
        }

        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
                throws Exception {
            if (key.length == 0) {
                response.sendError(HttpServletResponse.SC_FORBIDDEN, "Admin endpoints are disabled (no ADMIN_KEY set)");
                return false;
            }
            String given = request.getHeader("X-Admin-Key");
            byte[] givenBytes = given == null ? new byte[0] : given.getBytes(StandardCharsets.UTF_8);
            if (!MessageDigest.isEqual(key, givenBytes)) {
                response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Missing or wrong X-Admin-Key");
                return false;
            }
            return true;
        }
    }
}
