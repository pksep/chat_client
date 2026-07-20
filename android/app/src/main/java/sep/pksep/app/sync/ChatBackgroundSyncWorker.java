package sep.pksep.app.sync;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

public class ChatBackgroundSyncWorker extends Worker {
    private static final String TAG = "ChatBackgroundSync";
    private static final int DEFAULT_MAX_MESSAGE_TOPICS = 2;
    private static final int TARGETED_MAX_MESSAGE_TOPICS = 4;
    private static final int FOREGROUND_MAX_MESSAGE_TOPICS = 1;
    private static final int DEFAULT_MESSAGE_LIMIT = 32;
    private static final int TARGETED_MESSAGE_LIMIT = 128;
    private static final int FOREGROUND_MESSAGE_LIMIT = 180;
    private static final int DEFAULT_SYNC_EVENTS_LIMIT = 150;
    private static final int TARGETED_SYNC_EVENTS_LIMIT = 300;
    private static final int FOREGROUND_SYNC_EVENTS_LIMIT = 75;
    private static final int TOPICS_LIMIT = 999;

    public ChatBackgroundSyncWorker(
        @NonNull Context context,
        @NonNull WorkerParameters workerParams
    ) {
        super(context, workerParams);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        ChatBackgroundSyncStore.PendingHints hints =
            mergeInputHints(ChatBackgroundSyncStore.consumePendingHints(context));
        ChatBackgroundSyncStore.Session session =
            ChatBackgroundSyncStore.getSession(context);
        String lastPts = ChatBackgroundSyncStore.getLastPts(context);

        if (!session.isValid()) {
            ChatBackgroundSyncStore.setFailedStatus(
                context,
                hints,
                "Native chat session is missing",
                false
            );
            Log.w(TAG, "sync skipped: native chat session is missing");
            return Result.success();
        }

        ChatBackgroundSyncStore.setStartedStatus(
            context,
            hints,
            getRunAttemptCount()
        );
        Log.i(
            TAG,
            "sync started reason=" + hints.reason +
                " topics=" + hints.topicIds.size() +
                " pts=" + hints.pts +
                " lastPts=" + lastPts
        );

        try {
            ChatBackgroundSyncApi api = new ChatBackgroundSyncApi(session);
            ChatBackgroundSyncApi.SyncEventsResult syncEvents =
                fetchSyncEventsOrFallback(api, lastPts, getSyncEventsLimit(hints));
            JSONArray topics = api.fetchTopics(TOPICS_LIMIT);
            JSONObject messagesByTopic = new JSONObject();
            JSONObject messageErrors = new JSONObject();
            List<String> topicIds = resolvePriorityTopicIds(
                hints,
                syncEvents.events,
                topics,
                getMaxMessageTopics(hints),
                shouldIncludeRecentTopicFallback(hints)
            );
            int messageLimit = getMessageLimit(hints);

            for (String topicId : topicIds) {
                try {
                    putValue(
                        messagesByTopic,
                        topicId,
                        api.fetchLatestMessages(topicId, messageLimit)
                    );
                } catch (ChatBackgroundSyncApi.ApiException error) {
                    if (error.isAuthError()) {
                        throw error;
                    }
                    putValue(messageErrors, topicId, error.getMessage());
                } catch (IOException | JSONException error) {
                    putValue(messageErrors, topicId, error.getMessage());
                }
            }

            ChatBackgroundSyncStore.saveSnapshot(
                context,
                session.userId,
                hints.pts,
                syncEvents.fromPts,
                syncEvents.toPts,
                syncEvents.events,
                topics,
                messagesByTopic
            );
            ChatBackgroundSyncStore.setCompletedStatus(
                context,
                hints,
                topics.length(),
                messagesByTopic.length(),
                syncEvents.events.length(),
                syncEvents.toPts,
                messageErrors
            );
            Log.i(
                TAG,
                "sync completed topics=" + topics.length() +
                    " messageTopics=" + messagesByTopic.length() +
                    " events=" + syncEvents.events.length() +
                    " toPts=" + syncEvents.toPts
            );

            enqueueFollowUpIfNeeded(context);
            return Result.success();
        } catch (ChatBackgroundSyncApi.ApiException error) {
            boolean retryable = !error.isAuthError();
            ChatBackgroundSyncStore.setFailedStatus(
                context,
                hints,
                error.getMessage(),
                retryable
            );
            Log.w(TAG, "sync failed: " + error.getMessage());
            enqueueFollowUpIfNeeded(context);
            return retryable ? Result.retry() : Result.success();
        } catch (IOException | JSONException error) {
            ChatBackgroundSyncStore.setFailedStatus(
                context,
                hints,
                error.getMessage(),
                true
            );
            Log.w(TAG, "sync failed: " + error.getMessage());
            enqueueFollowUpIfNeeded(context);
            return Result.retry();
        }
    }

    private void enqueueFollowUpIfNeeded(Context context) {
        if (ChatBackgroundSyncStore.hasPendingHints(context)) {
            ChatBackgroundSyncScheduler.enqueuePendingWork(context, "coalesced");
        }
    }

    private ChatBackgroundSyncApi.SyncEventsResult fetchSyncEventsOrFallback(
        ChatBackgroundSyncApi api,
        String lastPts,
        int limit
    ) throws IOException, JSONException {
        try {
            return api.fetchSyncEvents(lastPts, limit);
        } catch (ChatBackgroundSyncApi.ApiException error) {
            if (error.isNotFound()) {
                Log.w(TAG, "sync events endpoint missing, using REST snapshot fallback");
                return ChatBackgroundSyncApi.SyncEventsResult.empty(lastPts);
            }

            throw error;
        }
    }

    private ChatBackgroundSyncStore.PendingHints mergeInputHints(
        ChatBackgroundSyncStore.PendingHints hints
    ) {
        Set<String> topicIds = new LinkedHashSet<>(hints.topicIds);
        String inputTopicId = getInputData().getString(
            ChatBackgroundSyncScheduler.KEY_TOPIC_ID
        );
        String inputPts = getInputData().getString(ChatBackgroundSyncScheduler.KEY_PTS);
        String inputEventId = getInputData().getString(
            ChatBackgroundSyncScheduler.KEY_EVENT_ID
        );
        String inputReason = getInputData().getString(
            ChatBackgroundSyncScheduler.KEY_REASON
        );

        if (!isBlank(inputTopicId)) {
            topicIds.add(inputTopicId.trim());
        }

        return new ChatBackgroundSyncStore.PendingHints(
            topicIds,
            !isBlank(hints.pts) ? hints.pts : trimToEmpty(inputPts),
            !isBlank(hints.eventId) ? hints.eventId : trimToEmpty(inputEventId),
            !isBlank(hints.reason) ? hints.reason : trimToEmpty(inputReason)
        );
    }

    private List<String> resolvePriorityTopicIds(
        ChatBackgroundSyncStore.PendingHints hints,
        JSONArray syncEvents,
        JSONArray topics,
        int maxMessageTopics,
        boolean includeRecentTopicFallback
    ) {
        Set<String> topicIds = new LinkedHashSet<>(hints.topicIds);
        List<String> recentTopicIds = new ArrayList<>();

        for (int i = 0; i < syncEvents.length(); i++) {
            JSONObject event = syncEvents.optJSONObject(i);
            if (event == null) {
                continue;
            }

            String topicId = event.optString("topicId", "");
            if (!topicId.trim().isEmpty()) {
                topicIds.add(topicId.trim());
            }

            if (topicIds.size() >= maxMessageTopics) {
                return new ArrayList<>(topicIds).subList(0, maxMessageTopics);
            }
        }

        for (int i = 0; i < topics.length(); i++) {
            JSONObject topic = topics.optJSONObject(i);
            if (topic == null) {
                continue;
            }

            String topicId = topic.optString("id", "");
            if (topicId.trim().isEmpty()) {
                continue;
            }

            if (isPriorityTopic(topic)) {
                topicIds.add(topicId);
            } else if (
                includeRecentTopicFallback &&
                    topic.has("lastMessage") &&
                    !topic.isNull("lastMessage")
            ) {
                recentTopicIds.add(topicId);
            }

            if (topicIds.size() >= maxMessageTopics) {
                return new ArrayList<>(topicIds).subList(0, maxMessageTopics);
            }
        }

        for (String topicId : recentTopicIds) {
            topicIds.add(topicId);
            if (topicIds.size() >= maxMessageTopics) {
                break;
            }
        }

        return new ArrayList<>(topicIds).subList(
            0,
            Math.min(topicIds.size(), maxMessageTopics)
        );
    }

    private int getMaxMessageTopics(ChatBackgroundSyncStore.PendingHints hints) {
        if (isForegroundReason(hints.reason)) {
            return FOREGROUND_MAX_MESSAGE_TOPICS;
        }

        if (!hints.topicIds.isEmpty()) {
            return TARGETED_MAX_MESSAGE_TOPICS;
        }

        return DEFAULT_MAX_MESSAGE_TOPICS;
    }

    private int getMessageLimit(ChatBackgroundSyncStore.PendingHints hints) {
        if (isForegroundReason(hints.reason)) {
            return FOREGROUND_MESSAGE_LIMIT;
        }

        if (!hints.topicIds.isEmpty()) {
            return TARGETED_MESSAGE_LIMIT;
        }

        return DEFAULT_MESSAGE_LIMIT;
    }

    private int getSyncEventsLimit(ChatBackgroundSyncStore.PendingHints hints) {
        if (isForegroundReason(hints.reason)) {
            return FOREGROUND_SYNC_EVENTS_LIMIT;
        }

        if (!hints.topicIds.isEmpty()) {
            return TARGETED_SYNC_EVENTS_LIMIT;
        }

        return DEFAULT_SYNC_EVENTS_LIMIT;
    }

    private boolean shouldIncludeRecentTopicFallback(
        ChatBackgroundSyncStore.PendingHints hints
    ) {
        return !hints.topicIds.isEmpty();
    }

    private boolean isForegroundReason(String reason) {
        if (reason == null) {
            return false;
        }

        String normalized = reason.trim();
        return "initialize-chat".equals(normalized) ||
            "app-visible".equals(normalized) ||
            "window-focus".equals(normalized) ||
            "browser-online".equals(normalized) ||
            "native-app-active".equals(normalized) ||
            "native-resume".equals(normalized);
    }

    private boolean isPriorityTopic(JSONObject topic) {
        return topic.optInt("unreadMessageCount", 0) > 0 ||
            topic.optBoolean("taggedMe", false) ||
            topic.optBoolean("hasUnreadReaction", false);
    }

    private void putValue(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }
}
