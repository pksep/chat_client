package sep.pksep.app;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;

import java.util.HashMap;
import java.util.Map;

import sep.pksep.app.sync.ChatBackgroundSyncScheduler;

public class ChatFirebaseMessagingService extends FirebaseMessagingService {
    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        NotificationChannelHelper.ensureDefaultChannel(this);

        if (MainActivity.isAppInForeground()) {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        }

        Map<String, String> remoteData = remoteMessage.getData();
        if (remoteData == null || remoteData.isEmpty()) {
            return;
        }

        Map<String, String> data = new HashMap<>(remoteData);
        String messageId = remoteMessage.getMessageId();
        if (messageId != null && !messageId.trim().isEmpty()) {
            data.putIfAbsent("messageId", messageId);
        }

        String action = data.get("action");
        if ("CLEAR_CHAT_NOTIFICATIONS".equals(action)) {
            ChatNotificationHelper.dismissTopicNotifications(this, data.get("topicId"));
            return;
        }

        if ("DISMISS_INCOMING_CALL".equals(action)) {
            String roomId = data.get("roomId");
            if (roomId != null && !roomId.trim().isEmpty()) {
                IncomingCallNotificationHelper.dismissIncomingCall(this, roomId);
            } else {
                IncomingCallNotificationHelper.dismissAllIncomingCalls(this);
            }
            return;
        }

        if (ChatRuStoreMessagingService.shouldScheduleChatSync(data)) {
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

        if ("incoming_call".equals(data.get("type"))) {
            showIncomingCall(data);
            return;
        }

        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (notification == null && !MainActivity.isAppInForeground()) {
            ChatNotificationHelper.showChatMessage(
                this,
                data,
                ChatRuStoreMessagingService.resolveNotificationText(
                    data.get("notificationTitle"),
                    data.get("title")
                ),
                ChatRuStoreMessagingService.resolveNotificationText(
                    data.get("notificationBody"),
                    data.get("body")
                )
            );
        }
    }

    private void showIncomingCall(Map<String, String> data) {
        String roomId = data.get("roomId");
        if (
            roomId == null ||
            roomId.trim().isEmpty() ||
            MainActivity.isAppInForeground()
        ) {
            return;
        }

        IncomingCallNotificationHelper.showIncomingCall(
            this,
            ChatRuStoreMessagingService.resolveNotificationText(
                data.get("callerId"),
                data.get("fromUserId")
            ),
            data.get("callerName"),
            roomId,
            data.get("topicId"),
            data.get("topicType")
        );
    }
}
