package sep.pksep.app;

import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;

public final class ChatNotificationDismissalHelper {
    private static final String PREFS_NAME = "chat_notification_state";
    private static final String CLEARED_AT_PREFIX = "cleared_at:";
    private static final String LATEST_AT_PREFIX = "latest_at:";

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
        dismissTopicNotification(context, topicId, System.currentTimeMillis());
    }

    public static void dismissTopicNotification(
        Context context,
        String topicId,
        long stateAt
    ) {
        if (context == null || isBlank(topicId)) {
            return;
        }

        String normalizedTopicId = topicId.trim();
        SharedPreferences preferences = prefs(context);
        long normalizedStateAt = stateAt > 0L
            ? stateAt
            : System.currentTimeMillis();
        long clearedAt = Math.max(
            preferences.getLong(clearedAtKey(normalizedTopicId), 0L),
            normalizedStateAt
        );
        long latestAt = preferences.getLong(latestAtKey(normalizedTopicId), 0L);
        SharedPreferences.Editor editor = preferences.edit().putLong(
            clearedAtKey(normalizedTopicId),
            clearedAt
        );

        if (latestAt <= clearedAt) {
            editor.remove(normalizedTopicId).apply();
            cancelTopicNotification(context, normalizedTopicId);
        } else {
            editor.apply();
        }
    }

    public static boolean shouldShowMessageNotification(
        Context context,
        String topicId,
        String stateAt,
        String sentAt
    ) {
        if (context == null || isBlank(topicId)) {
            return true;
        }

        long eventAt = parseTimestamp(stateAt, parseTimestamp(sentAt, 0L));
        if (eventAt <= 0L) {
            return true;
        }

        String normalizedTopicId = topicId.trim();
        SharedPreferences preferences = prefs(context);
        long clearedAt = preferences.getLong(clearedAtKey(normalizedTopicId), 0L);
        long latestAt = preferences.getLong(latestAtKey(normalizedTopicId), 0L);

        if (!isMessageNotificationCurrent(eventAt, clearedAt, latestAt)) {
            return false;
        }

        return true;
    }

    public static void recordDisplayed(Context context, String topicId, String stateAt, String sentAt) {
        long eventAt = parseTimestamp(stateAt, parseTimestamp(sentAt, 0L));
        if (eventAt <= 0L || isBlank(topicId)) return;
        SharedPreferences preferences = prefs(context);
        String key = latestAtKey(topicId.trim());
        preferences.edit().putLong(key, Math.max(eventAt, preferences.getLong(key, 0L))).apply();
    }

    public static boolean canRefreshDisplayed(Context context, String topicId, String stateAt) {
        long eventAt = parseTimestamp(stateAt, 0L);
        SharedPreferences preferences = prefs(context);
        return eventAt > preferences.getLong(clearedAtKey(topicId), 0L)
            && eventAt == preferences.getLong(latestAtKey(topicId), 0L);
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

    static boolean isMessageNotificationCurrent(
        long eventAt,
        long clearedAt,
        long latestAt
    ) {
        return eventAt <= 0L || (eventAt > clearedAt && eventAt > latestAt);
    }

    private static long parseTimestamp(String value, long fallback) {
        if (isBlank(value)) {
            return fallback;
        }

        try {
            long parsed = Long.parseLong(value.trim());
            return parsed > 0L ? parsed : fallback;
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static String clearedAtKey(String topicId) {
        return CLEARED_AT_PREFIX + topicId;
    }

    private static String latestAtKey(String topicId) {
        return LATEST_AT_PREFIX + topicId;
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
