package sep.pksep.app.sync;

import android.content.Context;
import android.util.Log;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

public final class ChatBackgroundSyncScheduler {
    public static final String ACTION_CHAT_SYNC = "CHAT_SYNC";
    public static final String KEY_REASON = "reason";
    public static final String KEY_TOPIC_ID = "topicId";
    public static final String KEY_PTS = "pts";
    public static final String KEY_EVENT_ID = "eventId";

    private static final String TAG = "ChatBackgroundSync";
    private static final String UNIQUE_WORK_NAME = "chat-background-sync";

    private ChatBackgroundSyncScheduler() {}

    public static void enqueueFromPush(
        Context context,
        String topicId,
        String pts,
        String eventId,
        String reason
    ) {
        enqueue(context, normalizeReason(reason, "push"), topicId, pts, eventId);
    }

    public static void enqueue(
        Context context,
        String reason,
        String topicId,
        String pts,
        String eventId
    ) {
        Context appContext = context.getApplicationContext();
        String normalizedReason = normalizeReason(reason, "manual");

        ChatBackgroundSyncStore.appendPendingHint(
            appContext,
            normalizedReason,
            topicId,
            pts,
            eventId
        );
        ChatBackgroundSyncStore.setScheduledStatus(
            appContext,
            normalizedReason,
            topicId,
            pts,
            eventId
        );
        enqueuePendingWork(appContext, normalizedReason, topicId, pts, eventId);
    }

    static void enqueuePendingWork(Context context, String reason) {
        enqueuePendingWork(context, normalizeReason(reason, "coalesced"), null, null, null);
    }

    private static void enqueuePendingWork(
        Context context,
        String reason,
        String topicId,
        String pts,
        String eventId
    ) {
        Data inputData = new Data.Builder()
            .putString(KEY_REASON, reason)
            .putString(KEY_TOPIC_ID, topicId)
            .putString(KEY_PTS, pts)
            .putString(KEY_EVENT_ID, eventId)
            .build();
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(
            ChatBackgroundSyncWorker.class
        )
            .setInputData(inputData)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(UNIQUE_WORK_NAME)
            .build();

        WorkManager
            .getInstance(context.getApplicationContext())
            .enqueueUniqueWork(UNIQUE_WORK_NAME, ExistingWorkPolicy.KEEP, request);

        Log.i(
            TAG,
            "sync scheduled reason=" + reason +
                " topicId=" + topicId +
                " pts=" + pts +
                " eventId=" + eventId
        );
    }

    private static String normalizeReason(String reason, String fallback) {
        return reason == null || reason.trim().isEmpty() ? fallback : reason.trim();
    }
}
