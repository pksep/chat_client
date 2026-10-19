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
import androidx.core.app.RemoteInput;
import androidx.core.content.ContextCompat;

import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import sep.pksep.app.sync.ChatStartupHistory;
import sep.pksep.app.sync.ChatBackgroundSyncStore;

public final class ChatNotificationHelper {
    public static final String ACTION_OPEN_CHAT_NOTIFICATION =
        "sep.pksep.app.action.OPEN_CHAT_NOTIFICATION";
    private static final int CHAT_NOTIFICATION_ID = 0;
    private static final String EXTRA_MESSAGE_ID = "messageId";
    private static final String EXTRA_NOTIFICATION_BODY = "notificationBody";
    private static final String EXTRA_NOTIFICATION_TITLE = "notificationTitle";
    private static final String EXTRA_RUSTORE_MESSAGE_ID = "rustore.message_id";
    private static final String EXTRA_TOPIC_ID = "topicId";
    private static final AtomicInteger REQUEST_CODE_PROVIDER =
        new AtomicInteger((int) System.currentTimeMillis());

    private ChatNotificationHelper() {}

    public static void showChatMessage(
        Context context,
        Map<String, String> data,
        String title,
        String body
    ) {
        if (
            context == null || data == null || data.isEmpty() ||
            !ChatBackgroundSyncStore.getSession(context).isValid()
        ) {
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
        ChatApplication.rememberNotificationTopic(context, topicId);
        ChatStartupHistory.refreshCache(context, topicId);
        int requestCode = REQUEST_CODE_PROVIDER.incrementAndGet();
        // The launcher paints the fresh server response while Chromium starts
        // behind its native frame.
        Class<?> launchActivity = LaunchAppearance.isDark(context)
            ? DarkNotificationTapLaunchActivity.class
            : NotificationTapLaunchActivity.class;
        Intent intent = new Intent(context, launchActivity)
            .setAction(ACTION_OPEN_CHAT_NOTIFICATION)
            .addFlags(
                Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP
            );

        for (Map.Entry<String, String> entry : data.entrySet()) {
            if (entry.getKey() != null && entry.getValue() != null) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
        }

        // Always include the normalized values. Some background payloads use
        // only `tag`, so copying the original map is not enough for the very
        // early MainActivity navigation path.
        intent.putExtra(EXTRA_TOPIC_ID, topicId);

        String messageId = firstNonEmpty(
            data.get(EXTRA_MESSAGE_ID),
            data.get(EXTRA_RUSTORE_MESSAGE_ID)
        );
        if (!isBlank(messageId)) {
            intent.putExtra(EXTRA_MESSAGE_ID, messageId);
        }
        if (!isBlank(title)) {
            intent.putExtra(EXTRA_NOTIFICATION_TITLE, title);
        }
        if (!isBlank(body)) {
            intent.putExtra(EXTRA_NOTIFICATION_BODY, body);
        }

        intent.putExtra(
            EXTRA_RUSTORE_MESSAGE_ID,
            firstNonEmpty(messageId, topicId)
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
            .setSmallIcon(R.drawable.notification_statusbar_chat_bubbles_2026)
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

        if (isUuid(topicId)) {
            builder.addAction(createReplyAction(context, topicId, messageId));

            if (isUuid(messageId)) {
                builder.addAction(createLikeAction(context, topicId, messageId));
                builder.addAction(createMarkReadAction(context, topicId, messageId));
            }
        }

        ChatNotificationDismissalHelper.trackTopicNotification(
            context,
            topicId,
            messageId
        );
        NotificationManagerCompat.from(context).notify(
            topicId,
            CHAT_NOTIFICATION_ID,
            NotificationBrandIconHelper.build(context, builder)
        );
    }

    private static NotificationCompat.Action createReplyAction(
        Context context,
        String topicId,
        String messageId
    ) {
        RemoteInput remoteInput = new RemoteInput.Builder(
            ChatNotificationActionReceiver.REMOTE_INPUT_REPLY
        )
            .setLabel("Ответить")
            .setAllowFreeFormInput(true)
            .build();
        Intent actionIntent = new Intent(
            context,
            ChatNotificationActionReceiver.class
        )
            .setAction(ChatNotificationActionReceiver.ACTION_REPLY)
            .putExtra(ChatNotificationActionReceiver.EXTRA_TOPIC_ID, topicId)
            .putExtra(ChatNotificationActionReceiver.EXTRA_MESSAGE_ID, messageId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            flags |= PendingIntent.FLAG_MUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_PROVIDER.incrementAndGet(),
            actionIntent,
            flags
        );

        return new NotificationCompat.Action.Builder(
            R.drawable.notification_statusbar_chat_bubbles_2026,
            "Ответить",
            pendingIntent
        )
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(true)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .build();
    }

    private static NotificationCompat.Action createMarkReadAction(
        Context context,
        String topicId,
        String messageId
    ) {
        Intent actionIntent = new Intent(
            context,
            ChatNotificationActionReceiver.class
        )
            .setAction(ChatNotificationActionReceiver.ACTION_MARK_READ)
            .putExtra(ChatNotificationActionReceiver.EXTRA_TOPIC_ID, topicId)
            .putExtra(ChatNotificationActionReceiver.EXTRA_MESSAGE_ID, messageId);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_PROVIDER.incrementAndGet(),
            actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Action.Builder(
            R.drawable.notification_statusbar_chat_bubbles_2026,
            "Прочитано",
            pendingIntent
        )
            .setSemanticAction(
                NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ
            )
            .setShowsUserInterface(false)
            .build();
    }

    private static NotificationCompat.Action createLikeAction(
        Context context,
        String topicId,
        String messageId
    ) {
        String heart = "\u2764\uFE0F";
        Intent actionIntent = new Intent(
            context,
            ChatNotificationActionReceiver.class
        )
            .setAction(ChatNotificationActionReceiver.ACTION_REACT)
            .putExtra(ChatNotificationActionReceiver.EXTRA_TOPIC_ID, topicId)
            .putExtra(ChatNotificationActionReceiver.EXTRA_MESSAGE_ID, messageId)
            .putExtra(ChatNotificationActionReceiver.EXTRA_EMOJI, heart);

        PendingIntent pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_PROVIDER.incrementAndGet(),
            actionIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        return new NotificationCompat.Action.Builder(
            R.drawable.notification_statusbar_chat_bubbles_2026,
            "Нравится",
            pendingIntent
        )
            .setShowsUserInterface(false)
            .build();
    }

    public static void dismissTopicNotifications(Context context, String topicId) {
        ChatNotificationDismissalHelper.dismissTopicNotification(context, topicId);
    }

    public static void completeInlineReply(
        Context context,
        String topicId,
        String replyText
    ) {
        if (
            context == null || isBlank(topicId) || isBlank(replyText) ||
            !ChatBackgroundSyncStore.getSession(context).isValid()
        ) {
            return;
        }

        NotificationChannelHelper.ensureDefaultChannel(context);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
            context,
            NotificationChannelHelper.DEFAULT_CHANNEL_ID
        )
            .setSmallIcon(R.drawable.notification_statusbar_chat_bubbles_2026)
            .setContentTitle("Ответ отправлен")
            .setContentText(replyText.trim())
            .setRemoteInputHistory(new CharSequence[] { replyText.trim() })
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setAutoCancel(true);

        NotificationManagerCompat notificationManager =
            NotificationManagerCompat.from(context);
        String normalizedTopicId = topicId.trim();

        // Direct reply временно продлевает жизнь исходного уведомления.
        // Обновление снимает это системное состояние, после чего уведомление
        // можно закрыть без зависшего индикатора отправки.
        notificationManager.notify(
            normalizedTopicId,
            CHAT_NOTIFICATION_ID,
            NotificationBrandIconHelper.build(context, builder)
        );
        ChatNotificationDismissalHelper.dismissTopicNotification(
            context,
            normalizedTopicId
        );
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

    private static boolean isUuid(String value) {
        if (isBlank(value)) {
            return false;
        }

        try {
            java.util.UUID.fromString(value.trim());
            return true;
        } catch (IllegalArgumentException ignored) {
            return false;
        }
    }
}
