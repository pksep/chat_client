package sep.pksep.app;

import android.Manifest;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.RingtoneManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class ChatNotificationHelper {
    private static final int CHAT_NOTIFICATION_ID = 0;
    private static final String EXTRA_RUSTORE_MESSAGE_ID = "rustore.message_id";
    private static final AtomicInteger REQUEST_CODE_PROVIDER =
        new AtomicInteger((int) System.currentTimeMillis());

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

        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return;
        }

        NotificationChannelHelper.ensureDefaultChannel(context);

        String topicId = resolveNotificationTag(data);
        int requestCode = REQUEST_CODE_PROVIDER.incrementAndGet();
        Intent intent = context
            .getPackageManager()
            .getLaunchIntentForPackage(context.getPackageName());
        if (intent == null) {
            intent = new Intent(context, MainActivity.class);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);

        for (Map.Entry<String, String> entry : data.entrySet()) {
            if (entry.getKey() != null && entry.getValue() != null) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
        }

        intent.putExtra(
            EXTRA_RUSTORE_MESSAGE_ID,
            firstNonEmpty(data.get("messageId"), data.get(EXTRA_RUSTORE_MESSAGE_ID), topicId)
        );
        PendingIntent contentIntent = PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            NotificationChannelHelper.DEFAULT_CHANNEL_ID
        )
            .setSmallIcon(R.drawable.ic_stat_chat)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setAutoCancel(true)
            .setContentIntent(contentIntent);

        if (!isBlank(title)) {
            builder.setContentTitle(title);
        }

        if (!isBlank(body)) {
            builder
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        String messageId = firstNonEmpty(
            data.get("messageId"),
            data.get(EXTRA_RUSTORE_MESSAGE_ID)
        );
        ChatNotificationDismissalHelper.trackTopicNotification(
            context,
            topicId,
            messageId
        );
        NotificationManagerCompat.from(context).notify(
            topicId,
            CHAT_NOTIFICATION_ID,
            builder.build()
        );
    }

    public static void dismissTopicNotifications(Context context, String topicId) {
        ChatNotificationDismissalHelper.dismissTopicNotification(context, topicId);
    }

    public static void dismissMessageNotification(
        Context context,
        String topicId,
        String messageId
    ) {
        ChatNotificationDismissalHelper.dismissTopicNotificationIfMessageMatches(
            context,
            topicId,
            messageId
        );
    }

    public static void dismissAll(Context context) {
        if (context == null) {
            return;
        }

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.cancelAll();
        }
        ChatNotificationDismissalHelper.clearTrackedNotifications(context);
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value;
            }
        }

        return null;
    }

    static String resolveNotificationTag(Map<String, String> data) {
        if (data == null) {
            return "general";
        }

        return firstNonEmpty(data.get("topicId"), data.get("tag"), "general");
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
