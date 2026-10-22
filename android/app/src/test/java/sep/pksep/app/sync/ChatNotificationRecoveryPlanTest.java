package sep.pksep.app.sync;

import static org.junit.Assert.*;
import org.junit.Test;
import org.json.JSONArray;
import org.json.JSONObject;

public class ChatNotificationRecoveryPlanTest {
    private JSONObject topic() throws Exception {
        return new JSONObject("{\"id\":\"topic\",\"type\":\"DM\",\"unreadMessageCount\":40,\"info\":{\"isMute\":false}}");
    }

    private JSONObject message(String id, String date) throws Exception {
        return new JSONObject().put("id", id).put("createdAt", date).put("senderUserId", "peer")
            .put("isReadByMe", false).put("text", "Текст").put("senderUser", new JSONObject().put("initials", "Давид"));
    }

    @Test public void restoresUnreadAfterOfflinePeriodEvenWhenOlderThanProviderTtl() throws Exception {
        JSONObject message = message("missed", "2026-09-01T16:26:41.283Z");
        ChatNotificationRecoveryPlan plan = ChatNotificationRecoveryPlan.build("me", topic(), new JSONArray().put(message));
        assertNotNull(plan);
        assertEquals("missed", plan.data.get("messageId"));
        assertEquals("40", plan.data.get("unreadCount"));
        assertEquals("Давид", plan.title);
    }

    @Test public void readOwnDeletedAndSystemMessagesNeverBecomeNotifications() throws Exception {
        JSONArray messages = new JSONArray()
            .put(message("own", "2026-10-22T10:00:00Z").put("senderUserId", "me"))
            .put(message("read", "2026-10-22T10:00:00Z").put("isReadByMe", true))
            .put(message("deleted", "2026-10-22T10:00:00Z").put("deletedAt", "2026-10-22T10:01:00Z"))
            .put(message("system", "2026-10-22T10:00:00Z").put("isSystem", true))
            .put(message("unknown", "2026-10-22T10:00:00Z").put("isReadByMe", JSONObject.NULL));
        assertNull(ChatNotificationRecoveryPlan.build("me", topic(), messages));
    }

    @Test public void latestUnreadIsIndependentOfResponseOrderAndOwnRecentMessages() throws Exception {
        JSONArray messages = new JSONArray()
            .put(message("new", "2026-10-22T10:02:00Z"))
            .put(message("old", "2026-10-22T10:00:00Z"))
            .put(message("own", "2026-10-22T11:00:00Z").put("senderUserId", "me"));
        ChatNotificationRecoveryPlan plan = ChatNotificationRecoveryPlan.build("me", topic(), messages);
        assertEquals("new", plan.data.get("messageId"));
        assertEquals("old", plan.messages.getJSONObject(0).getString("id"));
        assertEquals(2, plan.messages.length());
    }

    @Test public void wearableHistoryIsBoundedButCountIncludesAllMissedMessages() throws Exception {
        JSONArray messages = new JSONArray();
        for (int i = 0; i < 40; i++) messages.put(message(String.format("id-%02d", i), "2026-10-22T10:00:00Z"));
        ChatNotificationRecoveryPlan plan = ChatNotificationRecoveryPlan.build("me", topic(), messages);
        assertEquals(25, plan.messages.length());
        assertEquals("id-39", plan.data.get("messageId"));
        assertEquals("40", plan.data.get("unreadCount"));
    }

    @Test public void mutedChatOnlyRestoresUnreadMentions() throws Exception {
        JSONObject topic = topic().put("type", "GROUP").put("name", "Группа")
            .put("info", new JSONObject().put("isMute", true));
        assertFalse(ChatNotificationRecoveryPlan.shouldFetch(topic));
        topic.put("taggedMe", true);
        JSONArray messages = new JSONArray()
            .put(message("mention", "2026-10-22T10:00:00Z").put("taggedMe", true))
            .put(message("ordinary", "2026-10-22T10:01:00Z"));
        ChatNotificationRecoveryPlan plan = ChatNotificationRecoveryPlan.build("me", topic, messages);
        assertEquals("mention", plan.data.get("messageId"));
        assertEquals("Группа", plan.title);
        assertEquals(1, plan.messages.length());
    }

    @Test public void emptyOrReadTopicNeverRestoresNotification() throws Exception {
        assertFalse(ChatNotificationRecoveryPlan.shouldFetch(topic().put("unreadMessageCount", 0)));
        assertNull(ChatNotificationRecoveryPlan.build("me", topic(), new JSONArray()));
        assertNull(ChatNotificationRecoveryPlan.build("me", topic(), new JSONArray().put(message("bad", "invalid"))));
    }
}
