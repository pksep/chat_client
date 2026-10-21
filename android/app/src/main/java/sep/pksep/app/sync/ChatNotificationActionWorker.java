package sep.pksep.app.sync;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.OutOfQuotaPolicy;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONException;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import sep.pksep.app.ChatNotificationHelper;

public final class ChatNotificationActionWorker extends Worker {
    public static final String ACTION_REPLY = "reply";
    public static final String ACTION_MARK_READ = "mark_read";
    public static final String ACTION_REACT = "react";

    private static final String TAG = "ChatNotificationAction";
    private static final String KEY_ACTION = "action";
    private static final String KEY_TOPIC_ID = "topicId";
    private static final String KEY_MESSAGE_ID = "messageId";
    private static final String KEY_REPLY_TEXT = "replyText";
    private static final String KEY_CLIENT_ID = "clientId";
    private static final String KEY_EMOJI = "emoji";

    public ChatNotificationActionWorker(
        @NonNull Context appContext,
        @NonNull WorkerParameters workerParams
    ) {
        super(appContext, workerParams);
    }

    public static boolean enqueueReply(
        Context context,
        String topicId,
        String messageId,
        String replyText,
        String clientId
    ) {
        return enqueue(
            context,
            ACTION_REPLY,
            topicId,
            messageId,
            replyText,
            clientId,
            null,
            "chat-notification-reply-" + clientId
        );
    }

    public static boolean enqueueMarkRead(
        Context context,
        String topicId,
        String messageId
    ) {
        return enqueue(
            context,
            ACTION_MARK_READ,
            topicId,
            messageId,
            null,
            null,
            null,
            "chat-notification-read-" + topicId + "-" + messageId
        );
    }

    public static boolean enqueueReaction(
        Context context,
        String topicId,
        String messageId,
        String emoji
    ) {
        return enqueue(
            context,
            ACTION_REACT,
            topicId,
            messageId,
            null,
            null,
            emoji,
            "chat-notification-reaction-" + topicId + "-" + messageId + "-" +
                Integer.toHexString(emoji.hashCode())
        );
    }

    private static boolean enqueue(
        Context context,
        String action,
        String topicId,
        String messageId,
        String replyText,
        String clientId,
        String emoji,
        String uniqueWorkName
    ) {
        try {
            Data input = new Data.Builder()
                .putString(KEY_ACTION, action)
                .putString(KEY_TOPIC_ID, topicId)
                .putString(KEY_MESSAGE_ID, messageId)
                .putString(KEY_REPLY_TEXT, replyText)
                .putString(KEY_CLIENT_ID, clientId)
                .putString(KEY_EMOJI, emoji)
                .build();
            Constraints constraints = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(
                ChatNotificationActionWorker.class
            )
                .setInputData(input)
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    10,
                    TimeUnit.SECONDS
                )
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build();

            WorkManager
                .getInstance(context.getApplicationContext())
                .enqueueUniqueWork(
                    uniqueWorkName,
                    ExistingWorkPolicy.KEEP,
                    request
                );
            return true;
        } catch (RuntimeException error) {
            Log.e(
                TAG,
                "Не удалось поставить действие уведомления в очередь",
                error
            );
            return false;
        }
    }

    @NonNull
    @Override
    public Result doWork() {
        String action = getInputData().getString(KEY_ACTION);
        String topicId = getInputData().getString(KEY_TOPIC_ID);
        String messageId = getInputData().getString(KEY_MESSAGE_ID);
        ChatBackgroundSyncStore.Session session =
            ChatBackgroundSyncStore.getSession(getApplicationContext());

        if (
            !session.isValid() ||
            isBlank(topicId) ||
            isBlank(action)
        ) {
            return Result.failure();
        }

        ChatBackgroundSyncApi api = new ChatBackgroundSyncApi(session);

        try {
            if (ACTION_REPLY.equals(action)) {
                String replyText = getInputData().getString(KEY_REPLY_TEXT);
                String clientId = getInputData().getString(KEY_CLIENT_ID);

                if (isBlank(replyText) || isBlank(clientId)) {
                    return Result.failure();
                }

                api.sendNotificationReply(
                    topicId,
                    replyText.trim(),
                    clientId,
                    isUuid(messageId) ? messageId : null
                );

                if (isUuid(messageId)) {
                    api.markNotificationRead(topicId, messageId);
                }

                ChatNotificationHelper.completeInlineReply(
                    getApplicationContext(),
                    topicId,
                    replyText.trim()
                );
            } else if (ACTION_MARK_READ.equals(action)) {
                if (isBlank(messageId)) {
                    return Result.failure();
                }

                api.markNotificationRead(topicId, messageId);
                ChatNotificationHelper.dismissTopicNotifications(
                    getApplicationContext(),
                    topicId
                );
            } else if (ACTION_REACT.equals(action)) {
                String emoji = getInputData().getString(KEY_EMOJI);

                if (!isUuid(messageId) || isBlank(emoji)) {
                    return Result.failure();
                }

                api.setNotificationReaction(topicId, messageId, emoji);
                ChatNotificationHelper.dismissTopicNotifications(
                    getApplicationContext(),
                    topicId
                );
            } else {
                return Result.failure();
            }
            ChatBackgroundSyncScheduler.enqueue(
                getApplicationContext(),
                "notification_action",
                topicId,
                null,
                null
            );
            return Result.success();
        } catch (ChatBackgroundSyncApi.ApiException error) {
            return error.isRetryable() ? Result.retry() : Result.failure();
        } catch (IOException error) {
            return Result.retry();
        } catch (JSONException error) {
            return Result.failure();
        }
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
