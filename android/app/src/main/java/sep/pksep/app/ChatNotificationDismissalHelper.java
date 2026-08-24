package sep.pksep.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;

public final class ChatNotificationDismissalHelper {
    private static final String PREFS_NAME = "chat_notification_state";

    private ChatNotificationDismissalHelper() {}

    public static void trackTopicNotification(
        Context context,
        String topicId,
        String messageId
    ) {
        if (
            context == null ||
            isBlank(topicId) ||
            isBlank(messageId)
        ) {
            return;
        }

        prefs(context)
            .edit()
            .putString(topicId.trim(), messageId.trim())
            .apply();
    }

    public static void dismissTopicNotification(Context context, String topicId) {
        if (context == null || isBlank(topicId)) {
            return;
        }

        String normalizedTopicId = topicId.trim();
        prefs(context).edit().remove(normalizedTopicId).apply();
        cancelTopicNotification(context, normalizedTopicId);
    }

    public static void dismissTopicNotificationIfMessageMatches(
        Context context,
        String topicId,
        String deletedMessageId
    ) {
        if (
            context == null ||
            isBlank(topicId) ||
            isBlank(deletedMessageId)
        ) {
            return;
        }

        String normalizedTopicId = topicId.trim();
        String currentMessageId = prefs(context).getString(normalizedTopicId, "");

        if (!shouldDismissMessageNotification(currentMessageId, deletedMessageId)) {
            return;
        }

        prefs(context).edit().remove(normalizedTopicId).apply();
        cancelTopicNotification(context, normalizedTopicId);
    }

    public static void clearTrackedNotifications(Context context) {
        if (context != null) {
            prefs(context).edit().clear().apply();
        }
    }

    static boolean shouldDismissMessageNotification(
        String currentMessageId,
        String deletedMessageId
    ) {
        return !isBlank(currentMessageId) &&
            !isBlank(deletedMessageId) &&
            currentMessageId.trim().equals(deletedMessageId.trim());
    }

    private static void cancelTopicNotification(Context context, String topicId) {
        NotificationManager notificationManager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (notificationManager != null) {
            notificationManager.cancel(topicId, 0);
        }
    }

    private static SharedPreferences prefs(Context context) {
        return context
            .getApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
