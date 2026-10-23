package sep.pksep.app.sync;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;
import org.json.JSONObject;

public class ChatStartupReadsTest {
    @Test
    public void rejectedDeltaUsesFreshFullReadsOnlyUntilTheSameServerCanBeRetried() {
        assertTrue(ChatStartupReads.useFullTopicsUntilRetry("https://api.test", "https://api.test", 301000, 1000));
        assertFalse(ChatStartupReads.useFullTopicsUntilRetry("https://api.test", "https://other.test", 301000, 1000));
        assertFalse(ChatStartupReads.useFullTopicsUntilRetry("https://api.test", "https://api.test", 1000, 1000));
        assertFalse(ChatStartupReads.useFullTopicsUntilRetry("https://api.test", "https://api.test", 301001, 1000));
        assertFalse(ChatStartupReads.useFullTopicsUntilRetry("", "", 301000, 1000));
    }

    @Test
    public void rejectedDeltaFallsBackWithoutRepeatingAuthenticationOrTransientFailures() {
        for (int status : new int[] {400, 404, 405, 501}) {
            assertTrue(ChatStartupReads.shouldResetSync("/topics/sync?version=1", status));
            assertFalse(ChatStartupReads.shouldResetSync("/topics?page=1", status));
        }
        for (int status : new int[] {200, 401, 403, 408, 429, 500, 503}) {
            assertFalse(ChatStartupReads.shouldResetSync("/topics/sync?version=1", status));
        }
    }

    @Test
    public void onlyPrefetchesLegacyPagesWhenServicesAreMixedIntoMainList() throws Exception {
        assertFalse(ChatStartupReads.hasServiceTopics(new JSONObject("{\"data\":[{\"id\":\"dm\"}]}")));
        assertTrue(ChatStartupReads.hasServiceTopics(new JSONObject("{\"data\":[{\"group\":{\"description\":\"sep-chat:external-inquiry:v1\"}}]}")));
        assertTrue(ChatStartupReads.hasServiceTopics(new JSONObject("{\"data\":[{\"group\":{\"description\":\"sep-chat:call-topic:v1:room:user\"}}]}")));
    }

    @Test
    public void onlyAllowsBoundedRelativeDirectoryReads() {
        assertTrue(ChatStartupReads.isAllowed("/topics?page=1&limit=50&scope=chats&includeSync=true"));
        assertTrue(ChatStartupReads.isAllowed("/topics/sync?version=1&pts=20&syncedAt=2026-10-20T12%3A00%3A00.000Z"));
        assertTrue(ChatStartupReads.isAllowed("/users?page=1&limit=200"));
        assertFalse(ChatStartupReads.isAllowed("https://example.com/topics?page=1"));
        assertFalse(ChatStartupReads.isAllowed("/topics/../messages?page=1"));
        assertFalse(ChatStartupReads.isAllowed("/messages?page=1"));
        assertFalse(ChatStartupReads.isAllowed("/topics?page=1\r\nX-Test: value"));
    }

    @Test
    public void requiresSameAccountServerAndCurrentLaunch() {
        assertTrue(ChatStartupReads.matches("token", "https://api.test", "token", "https://api.test/", 9999));
        assertFalse(ChatStartupReads.matches("token", "https://api.test", "next-token", "https://api.test", 0));
        assertFalse(ChatStartupReads.matches("token", "https://api.test", "token", "https://other.test", 0));
        assertFalse(ChatStartupReads.matches("token", "https://api.test", "token", "https://api.test", 10000));
        assertFalse(ChatStartupReads.matches("token", "https://api.test", "token", "https://api.test", -1));
    }
}
