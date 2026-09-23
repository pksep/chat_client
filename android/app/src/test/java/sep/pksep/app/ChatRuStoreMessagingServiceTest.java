package sep.pksep.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

public class ChatRuStoreMessagingServiceTest {
    @Test
    public void usesDataTextWhenDataOnlyNotificationObjectIsEmpty() {
        assertEquals(
            "Имя отправителя",
            ChatRuStoreMessagingService.resolveNotificationText(
                "",
                "Имя отправителя",
                "Устаревшее поле"
            )
        );
    }

    @Test
    public void prefersSdkNotificationTextWhenPresent() {
        assertEquals(
            "SDK title",
            ChatRuStoreMessagingService.resolveNotificationText(
                "SDK title",
                "Data title"
            )
        );
    }

    @Test
    public void schedulesSyncForExplicitSilentPush() {
        Map<String, String> data = new HashMap<>();
        data.put("action", "CHAT_SYNC");
        data.put("topicId", "topic-id");

        assertTrue(ChatRuStoreMessagingService.shouldScheduleChatSync(data));
    }

    @Test
    public void schedulesSyncForVisibleChatNotification() {
        Map<String, String> data = new HashMap<>();
        data.put("topicId", "topic-id");
        data.put("messageId", "message-id");
        data.put("pts", "42");

        assertTrue(ChatRuStoreMessagingService.shouldScheduleChatSync(data));
    }

    @Test
    public void doesNotScheduleChatSyncForIncomingCall() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "incoming_call");
        data.put("topicId", "topic-id");
        data.put("eventId", "event-id");

        assertFalse(ChatRuStoreMessagingService.shouldScheduleChatSync(data));
    }

    @Test
    public void treatsOnlyDirectCallPayloadAsIncomingCall() {
        Map<String, String> directCall = new HashMap<>();
        directCall.put("type", "incoming_call");
        directCall.put("topicType", "DM");

        Map<String, String> groupCall = new HashMap<>();
        groupCall.put("type", "incoming_call");
        groupCall.put("topicType", "GROUP");

        assertTrue(ChatRuStoreMessagingService.isIncomingDirectCall(directCall));
        assertFalse(ChatRuStoreMessagingService.isIncomingDirectCall(groupCall));
    }

    @Test
    public void keepsLegacyIncomingCallWithoutTopicTypeWorking() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "incoming_call");

        assertTrue(ChatRuStoreMessagingService.isIncomingDirectCall(data));
    }

    @Test
    public void acceptsFreshIncomingCall() {
        long now = 1_000_000L;

        assertTrue(
            IncomingCallNotificationHelper.isIncomingCallFresh(
                String.valueOf(now - 5_000L),
                String.valueOf(now + 55_000L),
                0L,
                now
            )
        );
    }

    @Test
    public void rejectsExpiredIncomingCall() {
        long now = 1_000_000L;

        assertFalse(
            IncomingCallNotificationHelper.isIncomingCallFresh(
                String.valueOf(now - 61_000L),
                String.valueOf(now - 1_000L),
                0L,
                now
            )
        );
    }

    @Test
    public void rejectsIncomingCallOlderThanDismissEvent() {
        long now = 1_000_000L;
        long sentAt = now - 10_000L;

        assertFalse(
            IncomingCallNotificationHelper.isIncomingCallFresh(
                String.valueOf(sentAt),
                String.valueOf(now + 50_000L),
                sentAt + 1_000L,
                now
            )
        );
    }

    @Test
    public void keepsLegacyIncomingCallWithoutTimingMetadataWorking() {
        assertTrue(
            IncomingCallNotificationHelper.isIncomingCallFresh(
                null,
                null,
                0L,
                1_000_000L
            )
        );
    }

    @Test
    public void rejectsLegacyIncomingCallAfterDismissEvent() {
        assertFalse(
            IncomingCallNotificationHelper.isIncomingCallFresh(
                null,
                null,
                999_000L,
                1_000_000L
            )
        );
    }

    @Test
    public void doesNotScheduleChatSyncWithoutTopicHint() {
        Map<String, String> data = new HashMap<>();
        data.put("messageId", "message-id");

        assertFalse(ChatRuStoreMessagingService.shouldScheduleChatSync(data));
    }
}
