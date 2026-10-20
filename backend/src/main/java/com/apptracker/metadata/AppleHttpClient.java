package com.apptracker.metadata;

import com.apptracker.config.AppProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.ProxySelector;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;

/**
 * Every call to Apple goes through here: timeouts, a descriptive User-Agent,
 * at most one request per {@code min-interval-ms}, and retries on network
 * errors, 429 and 5xx (never on other 4xx). Never throws on HTTP problems.
 */
@Component
public class AppleHttpClient {

    public record Response(boolean ok, Integer status, String contentType, String body, String error, int attempts) {
    }

    private final HttpClient client;
    private final AppProperties.Apple config;
    private long lastRequestAt = 0;

    public AppleHttpClient(AppProperties props) {
        this.config = props.apple();
        this.client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .followRedirects(HttpClient.Redirect.NORMAL)
                .proxy(ProxySelector.getDefault())
                .build();
    }

    public String baseUrl() {
        return config.baseUrl().replaceAll("/+$", "");
    }

    static boolean isRetryable(Integer status) {
        return status == null || status == 429 || status >= 500;
    }

    public Response getText(String url) {
        List<Integer> delays = config.retryDelaysSeconds() == null ? List.of() : config.retryDelaysSeconds();
        int attempts = 0;
        Response last = new Response(false, null, null, null, "not attempted", 0);

        while (true) {
            attempts++;
            throttle();
            Long retryAfterMs = null;
            try {
                HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                        .timeout(Duration.ofSeconds(config.timeoutSeconds()))
                        .header("User-Agent", config.userAgent())
                        .header("Accept", "application/json, text/javascript, */*")
                        .GET()
                        .build();
                HttpResponse<String> res = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
                boolean ok = res.statusCode() >= 200 && res.statusCode() < 300;
                String contentType = res.headers().firstValue("content-type").orElse(null);
                last = new Response(ok, res.statusCode(), contentType, res.body(), ok ? null : "HTTP " + res.statusCode(), attempts);
                if (ok || !isRetryable(res.statusCode())) return last;
                retryAfterMs = res.headers().firstValue("retry-after").map(AppleHttpClient::parseRetryAfter).orElse(null);
            } catch (IOException e) {
                last = new Response(false, null, null, null, "network: " + e.getMessage(), attempts);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return new Response(false, null, null, null, "interrupted", attempts);
            }

            if (attempts > delays.size()) {
                return new Response(false, last.status(), last.contentType(), last.body(),
                        last.error() + " after " + attempts + " attempts", attempts);
            }
            sleep(retryAfterMs != null ? retryAfterMs : delays.get(attempts - 1) * 1000L);
        }
    }

    private static Long parseRetryAfter(String value) {
        try {
            return Math.max(0, Long.parseLong(value.trim()) * 1000);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private synchronized void throttle() {
        long wait = lastRequestAt + config.minIntervalMs() - System.currentTimeMillis();
        if (wait > 0) sleep(wait);
        lastRequestAt = System.currentTimeMillis();
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
