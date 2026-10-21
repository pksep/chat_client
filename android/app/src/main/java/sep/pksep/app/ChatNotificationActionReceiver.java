package sep.pksep.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

import androidx.core.app.RemoteInput;

import java.util.UUID;

import sep.pksep.app.sync.ChatNotificationActionWorker;

public final class ChatNotificationActionReceiver extends BroadcastReceiver {
    // Входные данные WorkManager ограничены 10 КБ, включая многобайтный текст.
    private static final int MAX_REPLY_TEXT_LENGTH = 3000;

    public static final String ACTION_REPLY =
        "sep.pksep.app.action.CHAT_NOTIFICATION_REPLY";
    public static final String ACTION_MARK_READ =
        "sep.pksep.app.action.CHAT_NOTIFICATION_MARK_READ";
    public static final String ACTION_REACT =
        "sep.pksep.app.action.CHAT_NOTIFICATION_REACT";
    public static final String EXTRA_TOPIC_ID = "chat.topic_id";
    public static final String EXTRA_MESSAGE_ID = "chat.message_id";
    public static final String EXTRA_EMOJI = "chat.emoji";
    public static final String REMOTE_INPUT_REPLY = "chat.reply_text";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) {
            return;
        }

        String topicId = intent.getStringExtra(EXTRA_TOPIC_ID);
        String messageId = intent.getStringExtra(EXTRA_MESSAGE_ID);

        if (isBlank(topicId)) {
            return;
        }

        if (ACTION_REPLY.equals(intent.getAction())) {
            Bundle results = RemoteInput.getResultsFromIntent(intent);
            CharSequence reply = results != null
                ? results.getCharSequence(REMOTE_INPUT_REPLY)
                : null;
            String replyText = reply != null ? reply.toString().trim() : "";

            if (replyText.isEmpty()) {
                return;
            }

            if (replyText.length() > MAX_REPLY_TEXT_LENGTH) {
                Toast.makeText(
                    context.getApplicationContext(),
                    "Ответ слишком длинный. Откройте чат и отправьте его там.",
                    Toast.LENGTH_LONG
                ).show();
                return;
            }

            boolean enqueued = ChatNotificationActionWorker.enqueueReply(
                context,
                topicId,
                messageId,
                replyText,
                UUID.randomUUID().toString()
            );

            if (enqueued) {
                ChatNotificationHelper.completeInlineReply(
                    context,
                    topicId,
                    replyText
                );
            } else {
                showEnqueueError(context);
            }
            return;
        }

        if (ACTION_MARK_READ.equals(intent.getAction()) && !isBlank(messageId)) {
            boolean enqueued = ChatNotificationActionWorker.enqueueMarkRead(
                context,
                topicId,
                messageId
            );

            if (enqueued) {
                ChatNotificationHelper.dismissTopicNotifications(
                    context,
                    topicId
                );
            } else {
                showEnqueueError(context);
            }
            return;
        }

        if (ACTION_REACT.equals(intent.getAction()) && !isBlank(messageId)) {
            String emoji = intent.getStringExtra(EXTRA_EMOJI);

            if (!isAllowedReaction(emoji)) {
                return;
            }

            boolean enqueued = ChatNotificationActionWorker.enqueueReaction(
                context,
                topicId,
                messageId,
                emoji
            );

            if (!enqueued) showEnqueueError(context);
        }
    }

    private static void showEnqueueError(Context context) {
        Toast.makeText(
            context.getApplicationContext(),
            "Не удалось выполнить действие. Откройте чат и повторите.",
            Toast.LENGTH_LONG
        ).show();
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static boolean isAllowedReaction(String value) {
        return "\u2764\uFE0F".equals(value) || "\uD83D\uDC4D".equals(value);
    }
}
