package sep.pksep.app;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import ru.rustore.sdk.pushclient.messaging.exception.RuStorePushClientException;
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage;
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService;
import sep.pksep.app.plugins.RuStorePushPlugin;
import sep.pksep.app.sync.ChatBackgroundSyncScheduler;

public class ChatRuStoreMessagingService extends RuStoreMessagingService {
    @Override
    public void onNewToken(String token) {
        RuStorePushPlugin.dispatchRegistration(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        NotificationChannelHelper.ensureDefaultChannel(this);

        Map<String, String> remoteData = remoteMessage.getData();
        if (remoteData == null || remoteData.isEmpty()) {
            return;
        }

        Map<String, String> data = new HashMap<>(remoteData);
        String messageId = remoteMessage.getMessageId();
        if (messageId != null && !messageId.trim().isEmpty()) {
            data.put("rustore.message_id", messageId);
            data.putIfAbsent("messageId", messageId);
        }

        long receivedAt = System.currentTimeMillis();
        long sentAt = IncomingCallNotificationHelper.parseTimestamp(
            data.get("sentAt"),
            0L
        );
        data.put("receivedAt", String.valueOf(receivedAt));
        if (sentAt > 0L) {
            data.put(
                "deliveryDelayMs",
                String.valueOf(Math.max(0L, receivedAt - sentAt))
            );
        }

        String title = resolveNotificationText(
            remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getTitle()
                : null,
            data.get("notificationTitle"),
            data.get("title")
        );
        String body = resolveNotificationText(
            remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getBody()
                : null,
            data.get("notificationBody"),
            data.get("body")
        );

        RuStorePushPlugin.dispatchPushReceived(messageId, title, body, data);

        String action = data.get("action");
        if ("CLEAR_CHAT_NOTIFICATIONS".equals(action)) {
            ChatNotificationHelper.dismissTopicNotifications(this, data.get("topicId"));
            return;
        }

        if ("DISMISS_INCOMING_CALL".equals(action)) {
            String roomId = data.get("roomId");
            if (roomId != null && !roomId.trim().isEmpty()) {
                IncomingCallNotificationHelper.dismissIncomingCall(
                    this,
                    roomId,
                    IncomingCallNotificationHelper.parseTimestamp(
                        data.get("sentAt"),
                        receivedAt
                    )
                );
            } else {
                IncomingCallNotificationHelper.dismissAllIncomingCalls(this);
            }
            return;
        }

        if (shouldScheduleChatSync(data)) {
            ChatBackgroundSyncScheduler.enqueueFromPush(
                this,
                data.get("topicId"),
                data.get("pts"),
                data.get("eventId"),
                data.get("reason")
            );
        }

        if (ChatBackgroundSyncScheduler.ACTION_CHAT_SYNC.equals(action)) {
            return;
        }

        if (isIncomingDirectCall(data)) {
            handleIncomingCall(data);
            return;
        }

        if (!MainActivity.isAppInForeground()) {
            ChatNotificationHelper.showChatMessage(this, data, title, body);
        }
    }

    @Override
    public void onDeletedMessages() {
        RuStorePushPlugin.dispatchPushDeleted();
    }

    @Override
    public void onError(List<? extends RuStorePushClientException> errors) {
        if (errors == null || errors.isEmpty()) {
            RuStorePushPlugin.dispatchRegistrationError("Неизвестная ошибка RuStore Push");
            return;
        }

        StringBuilder message = new StringBuilder();
        for (RuStorePushClientException error : errors) {
            if (message.length() > 0) {
                message.append('\n');
            }
            message.append(error.getClass().getSimpleName());
            if (error.getMessage() != null) {
                message.append(": ").append(error.getMessage());
            }
        }

        RuStorePushPlugin.dispatchRegistrationError(message.toString());
    }

    private void handleIncomingCall(Map<String, String> data) {
        String roomId = data.get("roomId");
        if (
            roomId == null ||
            roomId.trim().isEmpty() ||
            MainActivity.isAppInForeground() ||
            !IncomingCallNotificationHelper.shouldShowIncomingCall(
                this,
                roomId,
                data.get("sentAt"),
                data.get("expiresAt"),
                System.currentTimeMillis()
            )
        ) {
            return;
        }

        IncomingCallNotificationHelper.showIncomingCall(
            this,
            resolveNotificationText(data.get("callerId"), data.get("fromUserId")),
            data.get("callerName"),
            roomId,
            data.get("topicId"),
            data.get("topicType")
        );
    }

    static String resolveNotificationText(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value;
            }
        }

        return null;
    }

    static boolean isIncomingDirectCall(Map<String, String> data) {
        return data != null && IncomingCallNotificationHelper.isDirectCallPayload(
            data.get("type"),
            data.get("topicType")
        );
    }

    static boolean shouldScheduleChatSync(Map<String, String> data) {
        if (data == null || data.isEmpty()) {
            return false;
        }

        if (
            ChatBackgroundSyncScheduler.ACTION_CHAT_SYNC.equals(data.get("action"))
        ) {
            return true;
        }

        if ("incoming_call".equals(data.get("type")) || isBlank(data.get("topicId"))) {
            return false;
        }

        return !isBlank(data.get("messageId")) ||
            !isBlank(data.get("pts")) ||
            !isBlank(data.get("eventId"));
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

}
