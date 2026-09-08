package sep.pksep.app.sync;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ChatBackgroundSyncApiTest {
    @Test
    public void retriesOnlyTransientHttpFailures() {
        assertTrue(apiError(408).isRetryable());
        assertTrue(apiError(429).isRetryable());
        assertTrue(apiError(500).isRetryable());
        assertTrue(apiError(503).isRetryable());

        assertFalse(apiError(400).isRetryable());
        assertFalse(apiError(401).isRetryable());
        assertFalse(apiError(403).isRetryable());
        assertFalse(apiError(404).isRetryable());
    }

    private ChatBackgroundSyncApi.ApiException apiError(int statusCode) {
        return new ChatBackgroundSyncApi.ApiException(statusCode, "test");
    }
}
