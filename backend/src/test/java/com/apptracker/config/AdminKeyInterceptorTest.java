package com.apptracker.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AdminKeyInterceptorTest {

    private static boolean allowed(WebConfig.AdminKeyInterceptor i, String method, String key) throws Exception {
        MockHttpServletRequest req = new MockHttpServletRequest(method, "/api/watch");
        if (key != null) req.addHeader("X-Admin-Key", key);
        MockHttpServletResponse res = new MockHttpServletResponse();
        boolean ok = i.preHandle(req, res, new Object());
        if (!ok) assertEquals(401, res.getStatus());
        return ok;
    }

    @Test
    void watchlistReadsStayOpenAndWritesNeedTheKey() throws Exception {
        var watch = new WebConfig.AdminKeyInterceptor("secret", true);
        assertTrue(allowed(watch, "GET", null));
        assertTrue(allowed(watch, "OPTIONS", null));
        assertFalse(allowed(watch, "POST", null));
        assertFalse(allowed(watch, "PUT", "wrong"));
        assertTrue(allowed(watch, "PUT", "secret"));

        var manage = new WebConfig.AdminKeyInterceptor("secret", false);
        assertFalse(allowed(manage, "GET", null));
        assertTrue(allowed(new WebConfig.AdminKeyInterceptor("", false), "POST", null));   // no ADMIN_KEY: open
    }
}
