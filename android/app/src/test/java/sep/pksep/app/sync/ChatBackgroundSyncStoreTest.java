package sep.pksep.app.sync;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class ChatBackgroundSyncStoreTest {
    @Test
    public void skipsPersistenceOnlyForTheSameCredentials() {
        ChatBackgroundSyncStore.Session current = new ChatBackgroundSyncStore.Session("token", "user", "https://chat.test/api");
        assertTrue(ChatBackgroundSyncStore.sameSession(current,
            new ChatBackgroundSyncStore.Session("token", "user", "https://chat.test/api")));
        assertFalse(ChatBackgroundSyncStore.sameSession(current,
            new ChatBackgroundSyncStore.Session("renewed", "user", "https://chat.test/api")));
        assertFalse(ChatBackgroundSyncStore.sameSession(current,
            new ChatBackgroundSyncStore.Session("token", "another-user", "https://chat.test/api")));
        assertFalse(ChatBackgroundSyncStore.sameSession(current,
            new ChatBackgroundSyncStore.Session("token", "user", "https://other.test/api")));
    }
}
