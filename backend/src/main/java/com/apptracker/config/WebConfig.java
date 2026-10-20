package com.apptracker.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.http.HttpMethod;
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
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE")
                .exposedHeaders("ETag");
    }

    /**
     * /api/admin/** and /api/manage/** require the X-Admin-Key header when ADMIN_KEY
     * is set. With no ADMIN_KEY they are open (the owner's choice until the server is public).
     */
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new AdminKeyInterceptor(props.adminKey()))
                .addPathPatterns("/api/admin/**", "/api/manage/**");
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
            if (key.length == 0) return true;
            if (HttpMethod.OPTIONS.matches(request.getMethod())) return true;   // CORS preflight carries no headers
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
