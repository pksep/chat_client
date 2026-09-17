package sep.pksep.app.sync;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class ChatStartupHistoryTest {
    @Test
    public void separatesUsersServersAndTopics() {
        assertTrue(matches("user", "https://chat.test/", "topic", 100));
        assertFalse(matches("other-user", "https://chat.test", "topic", 100));
        assertFalse(matches("user", "https://other.test", "topic", 100));
        assertFalse(matches("user", "https://chat.test", "other-topic", 100));
        assertFalse(matches("", "https://chat.test", "topic", 100));
    }

    @Test
    public void rejectsStaleRequestsAndClockRollback() {
        assertTrue(matches("user", "https://chat.test", "topic", 9999));
        assertFalse(matches("user", "https://chat.test", "topic", 10000));
        assertFalse(matches("user", "https://chat.test", "topic", -1));
    }

    private boolean matches(String userId, String apiUrl, String topicId, long ageMs) {
        return ChatStartupHistory.matches("user", "https://chat.test", "topic", userId, apiUrl, topicId, ageMs);
    }
}
