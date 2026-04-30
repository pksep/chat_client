package sep.pksep.app;

import android.app.ActivityManager;
import android.content.Context;
import android.os.Process;

import java.util.List;
import java.util.Map;

import ru.rustore.sdk.pushclient.messaging.exception.RuStorePushClientException;
import ru.rustore.sdk.pushclient.messaging.model.RemoteMessage;
import ru.rustore.sdk.pushclient.messaging.service.RuStoreMessagingService;
import sep.pksep.app.plugins.RustorePushPlugin;

public class ChatRuStoreMessagingService extends RuStoreMessagingService {
    @Override
    public void onNewToken(String token) {
        RustorePushPlugin.dispatchRegistration(token);
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        NotificationChannelHelper.ensureDefaultChannel(this);

        Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) {
            return;
        }

        RustorePushPlugin.dispatchPushReceived(
            remoteMessage.getMessageId(),
            remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getTitle()
                : data.get("title"),
            remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getBody()
                : data.get("body"),
            data
        );

        String action = data.get("action");
        if ("CLEAR_CHAT_NOTIFICATIONS".equals(action)) {
            ChatNotificationHelper.dismissTopicNotifications(this, data.get("topicId"));
            return;
        }

        String type = data.get("type");
        if ("incoming_call".equals(type)) {
            handleIncomingCall(data);
            return;
        }

        if (isAppInForeground()) {
            return;
        }

        String title =
            remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getTitle()
                : data.get("title");
        String body =
            remoteMessage.getNotification() != null
                ? remoteMessage.getNotification().getBody()
                : data.get("body");

        ChatNotificationHelper.showChatMessage(this, data, title, body);
    }

    @Override
    public void onDeletedMessages() {
        RustorePushPlugin.dispatchPushDeleted();
    }

    @Override
    public void onError(List<? extends RuStorePushClientException> errors) {
        if (errors == null || errors.isEmpty()) {
            RustorePushPlugin.dispatchRegistrationError("Unknown RuStore push error");
            return;
        }

        StringBuilder builder = new StringBuilder();
        for (RuStorePushClientException error : errors) {
            if (builder.length() > 0) {
                builder.append('\n');
            }
            builder.append(error.getClass().getSimpleName());
            if (error.getMessage() != null) {
                builder.append(": ").append(error.getMessage());
            }
        }

        RustorePushPlugin.dispatchRegistrationError(builder.toString());
    }

    private void handleIncomingCall(Map<String, String> data) {
        String roomId = data.get("roomId");
        if (roomId == null || roomId.trim().isEmpty()) {
            return;
        }

        if (isAppInForeground()) {
            return;
        }

        String callerId = firstNonEmpty(data.get("callerId"), data.get("fromUserId"));
        String callerName = data.get("callerName");
        String topicId = data.get("topicId");
        String topicType = data.get("topicType");

        IncomingCallNotificationHelper.showIncomingCall(
            this,
            callerId,
            callerName,
            roomId,
            topicId,
            topicType
        );
    }

    private String firstNonEmpty(String first, String second) {
        if (first != null && !first.trim().isEmpty()) {
            return first;
        }
        return second;
    }

    private boolean isAppInForeground() {
        ActivityManager activityManager =
            (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
        if (activityManager == null) {
            return false;
        }

        List<ActivityManager.RunningAppProcessInfo> appProcesses =
            activityManager.getRunningAppProcesses();
        if (appProcesses == null) {
            return false;
        }

        int currentPid = Process.myPid();

        for (ActivityManager.RunningAppProcessInfo appProcess : appProcesses) {
            if (
                appProcess.pid == currentPid &&
                appProcess.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
            ) {
                return true;
            }
        }

        return false;
    }
}
