package sep.pksep.app;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;

import android.Manifest;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import androidx.core.app.NotificationCompat;
import java.util.HashMap;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import sep.pksep.app.sync.ChatBackgroundSyncStore;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 35}, manifest = Config.NONE, application = Application.class)
public class ChatNotificationWearableTest {
    private static final String TOPIC_ID = "38c90203-28b3-426d-86ce-360057309396";
    private static final String MESSAGE_ID = "2fe06b6c-5a59-48e7-8568-3dbf75c2e252";
    private Application context;
    private NotificationManager manager;

    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        shadowOf(context).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        // Запрос ранней истории ограничен loopback; production в тесте не используется.
        ChatBackgroundSyncStore.saveSession(context, "test-token", "me", "http://127.0.0.1:9");
        manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private Map<String, String> data(String topicType) {
        Map<String, String> data = new HashMap<>();
        data.put("topicId", TOPIC_ID);
        data.put("messageId", MESSAGE_ID);
        data.put("topicType", topicType);
        data.put("senderName", "Давид");
        data.put("senderUserId", "peer");
        data.put("stateAt", "1792684800000");
        return data;
    }

    private Notification notification() {
        assertEquals(1, shadowOf(manager).getAllNotifications().size());
        return shadowOf(manager).getAllNotifications().get(0);
    }

    @Test public void directMessageHasStandardFieldsAndCanBeBridgedToWatch() {
        ChatNotificationHelper.showChatMessage(context, data("DM"), "Давид", "<b>Привет</b>");
        Notification notification = notification();
        assertEquals(Notification.CATEGORY_MESSAGE, notification.category);
        assertEquals(0, notification.flags & Notification.FLAG_LOCAL_ONLY);
        assertEquals(0, notification.flags & Notification.FLAG_ONGOING_EVENT);
        assertEquals("Давид", notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertEquals("Привет", notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        assertEquals(TOPIC_ID, new NotificationCompat.WearableExtender(notification).getDismissalId());
        assertEquals(NotificationManager.IMPORTANCE_DEFAULT,
            manager.getNotificationChannel(notification.getChannelId()).getImportance());
        NotificationCompat.MessagingStyle style =
            NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification);
        assertNotNull(style);
        assertEquals(1, style.getMessages().size());
        assertEquals("peer", style.getMessages().get(0).getPerson().getKey());
        NotificationCompat.Action reply = NotificationCompat.getAction(notification, 0);
        assertEquals(NotificationCompat.Action.SEMANTIC_ACTION_REPLY, reply.getSemanticAction());
        assertTrue(reply.getRemoteInputs()[0].getAllowFreeFormInput());
        assertFalse(reply.getShowsUserInterface());
    }

    @Test public void recoveredGroupHasPlainTextAndHistoryForBothKindsOfWatchReader() throws Exception {
        Map<String, String> data = data("GROUP");
        data.put("conversationTitle", "Тестовая группа");
        data.put("unreadCount", "40");
        JSONArray messages = new JSONArray().put(new JSONObject()
            .put("id", MESSAGE_ID).put("senderUserId", "peer")
            .put("senderUser", new JSONObject().put("initials", "Давид"))
            .put("text", "<b>Привет</b>").put("createdAt", "2026-10-22T16:00:00Z"));
        ChatNotificationHelper.showChatMessage(context, data, "Тестовая группа", "<b>Привет</b>", messages);
        Notification notification = notification();
        String title = notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString();
        assertTrue(title.contains("Тестовая группа"));
        assertTrue(title.contains("Давид"));
        assertTrue(notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString().contains("Привет"));
        assertEquals(40, notification.number);
        NotificationCompat.MessagingStyle style =
            NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification);
        assertTrue(style.isGroupConversation());
        assertEquals("Тестовая группа", style.getConversationTitle().toString());
        assertEquals("Привет", style.getMessages().get(0).getText().toString());
        assertEquals(0, notification.flags & Notification.FLAG_LOCAL_ONLY);
    }

    @Test public void attachmentHasNonemptyTextForWatchCompanionApps() {
        ChatNotificationHelper.showChatMessage(context, data("DM"), null, "<p> </p>");
        Notification notification = notification();
        assertEquals("Давид", notification.extras.getCharSequence(Notification.EXTRA_TITLE).toString());
        assertEquals("Вложение", notification.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
    }

    @Test public void recoveryDoesNotAlertTheWatchAgainForTheSameMessage() throws Exception {
        Map<String, String> data = data("DM");
        ChatNotificationHelper.showChatMessage(context, data, "Давид", "Привет");
        JSONArray messages = new JSONArray().put(new JSONObject()
            .put("id", MESSAGE_ID).put("senderUserId", "peer").put("text", "Привет")
            .put("createdAt", "2026-10-22T16:00:00Z"));
        ChatNotificationHelper.showChatMessage(context, data, "Давид", "Привет", messages);
        assertNotEquals(0, notification().flags & Notification.FLAG_ONLY_ALERT_ONCE);
        manager.cancel(TOPIC_ID, 0);
        ChatNotificationHelper.showChatMessage(context, data, "Давид", "Привет", messages);
        assertEquals(0, shadowOf(manager).getAllNotifications().size());
    }
}
