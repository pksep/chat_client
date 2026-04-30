package sep.pksep.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

public final class ChatNotificationHelper {
    private static final String PREFS_NAME = "chat_notifications";
    private static final String PREF_TOPIC_IDS = "topic_ids";
    private static final String TOPIC_KEY_PREFIX = "topic:";

    private ChatNotificationHelper() {}

    public static void showChatMessage(
        Context context,
        Map<String, String> data,
        String title,
        String body
    ) {
        if (context == null || data == null || data.isEmpty()) {
            return;
        }

        NotificationChannelHelper.ensureDefaultChannel(context);

        String topicId = data.get("topicId");
        if (topicId == null || topicId.trim().isEmpty()) {
            topicId = "general";
        }

        int notificationId = buildNotificationId(topicId);
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            notificationId,
            createNotificationIntent(context, data),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            NotificationChannelHelper.DEFAULT_CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_stat_chat)
            .setContentTitle(title != null ? title : "Новое сообщение")
            .setContentText(body != null ? body : "")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE);

        NotificationManagerCompat.from(context).notify(
            topicId,
            notificationId,
            builder.build()
        );

        rememberTopic(context, topicId);
    }

    public static void dismissTopicNotifications(Context context, String topicId) {
        if (context == null || topicId == null || topicId.trim().isEmpty()) {
            return;
        }

        NotificationManagerCompat.from(context).cancel(
            topicId,
            buildNotificationId(topicId)
        );
        forgetTopic(context, topicId);
    }

    public static void dismissAll(Context context) {
        if (context == null) {
            return;
        }

        NotificationManagerCompat manager = NotificationManagerCompat.from(context);
        for (String topicId : getRememberedTopics(context)) {
            manager.cancel(topicId, buildNotificationId(topicId));
        }

        getPreferences(context).edit().clear().apply();
    }

    private static Intent createNotificationIntent(
        Context context,
        Map<String, String> data
    ) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_CLEAR_TOP
        );

        for (Map.Entry<String, String> entry : data.entrySet()) {
            if (entry.getKey() != null && entry.getValue() != null) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
        }

        return intent;
    }

    private static int buildNotificationId(String topicId) {
        return 500000 + Math.abs(topicId.hashCode());
    }

    private static void rememberTopic(Context context, String topicId) {
        SharedPreferences preferences = getPreferences(context);
        Set<String> topics = new HashSet<>(
            preferences.getStringSet(PREF_TOPIC_IDS, new HashSet<>())
        );

        topics.add(topicId);
        preferences.edit()
            .putStringSet(PREF_TOPIC_IDS, topics)
            .putBoolean(TOPIC_KEY_PREFIX + topicId, true)
            .apply();
    }

    private static void forgetTopic(Context context, String topicId) {
        SharedPreferences preferences = getPreferences(context);
        Set<String> topics = new HashSet<>(
            preferences.getStringSet(PREF_TOPIC_IDS, new HashSet<>())
        );

        topics.remove(topicId);
        preferences.edit()
            .putStringSet(PREF_TOPIC_IDS, topics)
            .remove(TOPIC_KEY_PREFIX + topicId)
            .apply();
    }

    private static Set<String> getRememberedTopics(Context context) {
        return new HashSet<>(
            getPreferences(context).getStringSet(PREF_TOPIC_IDS, new HashSet<>())
        );
    }

    private static SharedPreferences getPreferences(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }
}
