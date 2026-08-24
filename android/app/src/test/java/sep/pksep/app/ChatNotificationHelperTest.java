package sep.pksep.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

public class ChatNotificationHelperTest {
    @Test
    public void usesTopicIdAsNotificationTag() {
        Map<String, String> data = new HashMap<>();
        data.put("topicId", "topic-id");
        data.put("tag", "legacy-tag");

        assertEquals("topic-id", ChatNotificationHelper.resolveNotificationTag(data));
    }

    @Test
    public void acceptsExplicitTagWhenTopicIdIsMissing() {
        Map<String, String> data = new HashMap<>();
        data.put("tag", "topic-tag");

        assertEquals("topic-tag", ChatNotificationHelper.resolveNotificationTag(data));
    }
}
