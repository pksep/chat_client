package sep.pksep.app.sync;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.Set;

public final class ChatBackgroundSyncStore {
    private static final String PREFS_NAME = "chat_background_sync";
    private static final String SESSION_PREFS_NAME = "chat_background_sync_session";
    private static final String KEY_SESSION_INITIALIZED = "initialized";
    private static final Object SESSION_LOCK = new Object();
    private static final String KEY_TOKEN = "session.token";
    private static final String KEY_USER_ID = "session.userId";
    private static final String KEY_API_URL = "session.apiUrl";
    private static final String KEY_AUTH_SOURCE = "session.authSource";
    private static final String KEY_ERP_URL = "session.erpUrl";
    private static final String KEY_LAST_PTS = "sync.lastPts";
    private static final String KEY_SYNC_EVENTS = "snapshot.syncEvents";
    private static final String KEY_SYNC_FROM_PTS = "snapshot.syncFromPts";
    private static final String KEY_SYNC_TO_PTS = "snapshot.syncToPts";
    private static final String KEY_TOPICS_SNAPSHOT = "snapshot.topics";
    private static final String KEY_MESSAGES_SNAPSHOT = "snapshot.messagesByTopic";
    private static final String KEY_SNAPSHOT_UPDATED_AT = "snapshot.updatedAt";
    private static final String KEY_SNAPSHOT_USER_ID = "snapshot.userId";
    private static final String KEY_SNAPSHOT_API_URL = "snapshot.apiUrl";
    private static final String KEY_STATUS = "sync.status";
    private static final String KEY_PENDING_HINTS = "sync.pendingHints";
    private static final int MAX_PENDING_TOPIC_IDS = 32;
    private static final int MAX_SNAPSHOT_EVENTS_EXPORT = 100;
    private static final int MAX_SNAPSHOT_MESSAGE_TOPICS_EXPORT = 2;
    private static final int MAX_SNAPSHOT_MESSAGES_PER_TOPIC_EXPORT = 20;

    private ChatBackgroundSyncStore() {}

    public static final class Session {
        public final String token;
        public final String userId;
        public final String apiUrl;
        public final String authSource;
        public final String erpUrl;

        Session(String token, String userId, String apiUrl) {
            this(token, userId, apiUrl, "unknown_shared", "");
        }

        Session(String token, String userId, String apiUrl, String authSource, String erpUrl) {
            this.token = token;
            this.userId = userId;
            this.apiUrl = apiUrl;
            this.authSource = authSource;
            this.erpUrl = erpUrl;
        }

        public boolean isValid() {
            return !isBlank(token) && !isBlank(apiUrl);
        }
    }

    public static final class PendingHints {
        public final Set<String> topicIds;
        public final String pts;
        public final String eventId;
        public final String reason;

        PendingHints(Set<String> topicIds, String pts, String eventId, String reason) {
            this.topicIds = topicIds;
            this.pts = pts;
            this.eventId = eventId;
            this.reason = reason;
        }
    }

    public static boolean saveSession(
        Context context,
        String token,
        String userId,
        String apiUrl
    ) {
        return saveSession(context, token, userId, apiUrl, "unknown_shared", "");
    }

    public static boolean saveSession(Context context, String token, String userId, String apiUrl,
                                      String authSource, String erpUrl) {
        synchronized (SESSION_LOCK) {
            Session next = new Session(trimToEmpty(token), trimToEmpty(userId), normalizeApiUrl(apiUrl),
                trimToEmpty(authSource), normalizeApiUrl(erpUrl));
            if (sameSession(getSession(context), next)) return false;
            saveFastSession(context, next);
            prefs(context)
                .edit()
                .putString(KEY_TOKEN, trimToEmpty(token))
                .putString(KEY_USER_ID, trimToEmpty(userId))
                .putString(KEY_API_URL, next.apiUrl)
                .putString(KEY_AUTH_SOURCE, next.authSource)
                .putString(KEY_ERP_URL, next.erpUrl)
                .apply();

            JSONObject status = newStatus("session_saved");
            putOptValue(status, "userId", trimToNull(userId));
            putOptValue(status, "apiUrl", trimToNull(normalizeApiUrl(apiUrl)));
            putStatus(context, status);
            return true;
        }
    }

    static boolean sameSession(Session current, Session next) {
        return current.token.equals(next.token) && current.userId.equals(next.userId)
            && current.apiUrl.equals(next.apiUrl) && current.authSource.equals(next.authSource)
            && current.erpUrl.equals(next.erpUrl);
    }

    public static void runForSession(Context context, Session expected, Runnable action) {
        synchronized (SESSION_LOCK) {
            Session current = getSession(context);
            if (current.isValid() && current.userId.equals(expected.userId) &&
                current.apiUrl.equals(expected.apiUrl)) action.run();
        }
    }

    static Session saveRefreshedSession(Context context, Session expected, String token) {
        synchronized (SESSION_LOCK) {
            Session current = getSession(context);
            if (!sameSession(current, expected)) return current;
            saveSession(context, token, expected.userId, expected.apiUrl, expected.authSource, expected.erpUrl);
            return getSession(context);
        }
    }

    public static void clearSession(Context context) {
        synchronized (SESSION_LOCK) {
            saveFastSession(context, new Session("", "", ""));
            prefs(context)
                .edit()
                .remove(KEY_TOKEN)
                .remove(KEY_USER_ID)
                .remove(KEY_AUTH_SOURCE)
                .remove(KEY_ERP_URL)
                .remove(KEY_API_URL)
                .remove(KEY_LAST_PTS)
                .remove(KEY_SYNC_EVENTS)
                .remove(KEY_SYNC_FROM_PTS)
                .remove(KEY_SYNC_TO_PTS)
                .remove(KEY_TOPICS_SNAPSHOT)
                .remove(KEY_MESSAGES_SNAPSHOT)
                .remove(KEY_SNAPSHOT_UPDATED_AT)
                .remove(KEY_SNAPSHOT_USER_ID)
                .remove(KEY_SNAPSHOT_API_URL)
                .remove(KEY_PENDING_HINTS)
                .apply();

            putStatus(context, newStatus("session_cleared"));
        }
    }

    public static Session getSession(Context context) {
        synchronized (SESSION_LOCK) {
            SharedPreferences fast = context.getSharedPreferences(SESSION_PREFS_NAME, Context.MODE_PRIVATE);
            if (fast.getBoolean(KEY_SESSION_INITIALIZED, false)) return readSession(fast);
            // Однократная миграция сохраняет авторизацию после обновления APK.
            // Следующие открытия не разбирают XML со всеми снимками переписок.
            Session session = readSession(prefs(context));
            saveFastSession(context, session);
            return session;
        }
    }

    private static Session readSession(SharedPreferences preferences) {
        return new Session(preferences.getString(KEY_TOKEN, ""), preferences.getString(KEY_USER_ID, ""),
            preferences.getString(KEY_API_URL, ""),
            preferences.getString(KEY_AUTH_SOURCE, "unknown_shared"), preferences.getString(KEY_ERP_URL, ""));
    }

    private static void saveFastSession(Context context, Session session) {
        context.getSharedPreferences(SESSION_PREFS_NAME, Context.MODE_PRIVATE).edit()
            .putBoolean(KEY_SESSION_INITIALIZED, true)
            .putString(KEY_TOKEN, session.token)
            .putString(KEY_USER_ID, session.userId)
            .putString(KEY_API_URL, session.apiUrl)
            .putString(KEY_AUTH_SOURCE, session.authSource)
            .putString(KEY_ERP_URL, session.erpUrl)
            .apply();
    }

    public static String getLastPts(Context context) {
        return prefs(context).getString(KEY_LAST_PTS, "");
    }

    public static synchronized void appendPendingHint(
        Context context,
        String reason,
        String topicId,
        String pts,
        String eventId
    ) {
        JSONObject hints = parseObject(prefs(context).getString(KEY_PENDING_HINTS, ""));
        JSONArray topicIds = hints.optJSONArray("topicIds");

        if (topicIds == null) {
            topicIds = new JSONArray();
        }

        if (!isBlank(topicId) && !contains(topicIds, topicId)) {
            topicIds.put(topicId.trim());
        }

        if (topicIds.length() > MAX_PENDING_TOPIC_IDS) {
            JSONArray trimmed = new JSONArray();
            for (int i = topicIds.length() - MAX_PENDING_TOPIC_IDS; i < topicIds.length(); i++) {
                trimmed.put(topicIds.optString(i));
            }
            topicIds = trimmed;
        }

        putValue(hints, "topicIds", topicIds);

        String nextPts = chooseMaxPts(hints.optString("pts", ""), pts);
        if (!isBlank(nextPts)) {
            putValue(hints, "pts", nextPts);
        }

        if (!isBlank(eventId)) {
            putValue(hints, "eventId", eventId.trim());
        }

        putValue(hints, "reason", isBlank(reason) ? "push" : reason.trim());
        putValue(hints, "updatedAt", nowIso());

        prefs(context).edit().putString(KEY_PENDING_HINTS, hints.toString()).apply();
    }

    public static synchronized PendingHints consumePendingHints(Context context) {
        SharedPreferences prefs = prefs(context);
        JSONObject hints = parseObject(prefs.getString(KEY_PENDING_HINTS, ""));
        prefs.edit().remove(KEY_PENDING_HINTS).apply();

        Set<String> topicIds = new LinkedHashSet<>();
        JSONArray topicIdsJson = hints.optJSONArray("topicIds");

        if (topicIdsJson != null) {
            for (int i = 0; i < topicIdsJson.length(); i++) {
                String topicId = topicIdsJson.optString(i, "");
                if (!isBlank(topicId)) {
                    topicIds.add(topicId.trim());
                }
            }
        }

        return new PendingHints(
            topicIds,
            hints.optString("pts", ""),
            hints.optString("eventId", ""),
            hints.optString("reason", "background")
        );
    }

    public static boolean hasPendingHints(Context context) {
        JSONObject hints = parseObject(prefs(context).getString(KEY_PENDING_HINTS, ""));
        JSONArray topicIds = hints.optJSONArray("topicIds");

        return !isBlank(hints.optString("reason", "")) ||
            !isBlank(hints.optString("pts", "")) ||
            !isBlank(hints.optString("eventId", "")) ||
            (topicIds != null && topicIds.length() > 0);
    }

    public static void setScheduledStatus(
        Context context,
        String reason,
        String topicId,
        String pts,
        String eventId
    ) {
        JSONObject status = newStatus("scheduled");
        putOptValue(status, "reason", trimToNull(reason));
        putOptValue(status, "topicId", trimToNull(topicId));
        putOptValue(status, "pts", trimToNull(pts));
        putOptValue(status, "eventId", trimToNull(eventId));
        putStatus(context, status);
    }

    public static void setStartedStatus(Context context, PendingHints hints, int attempt) {
        JSONObject status = newStatus("started");
        putValue(status, "attempt", attempt);
        putOptValue(status, "reason", trimToNull(hints.reason));
        putValue(status, "topicIds", new JSONArray(hints.topicIds));
        putOptValue(status, "pts", trimToNull(hints.pts));
        putOptValue(status, "eventId", trimToNull(hints.eventId));
        putStatus(context, status);
    }

    public static void setCompletedStatus(
        Context context,
        PendingHints hints,
        int topicCount,
        int messageTopicCount,
        int eventCount,
        String toPts,
        JSONObject messageErrors
    ) {
        JSONObject status = newStatus("completed");
        putOptValue(status, "reason", trimToNull(hints.reason));
        putValue(status, "topicIds", new JSONArray(hints.topicIds));
        putOptValue(status, "pts", trimToNull(hints.pts));
        putOptValue(status, "eventId", trimToNull(hints.eventId));
        putOptValue(status, "toPts", trimToNull(toPts));
        putValue(status, "eventCount", eventCount);
        putValue(status, "topicCount", topicCount);
        putValue(status, "messageTopicCount", messageTopicCount);
        putValue(status, "messageErrors", messageErrors);
        putStatus(context, status);
    }

    public static void setFailedStatus(
        Context context,
        PendingHints hints,
        String error,
        boolean retryable
    ) {
        JSONObject status = newStatus("failed");
        putOptValue(status, "reason", trimToNull(hints.reason));
        putValue(status, "topicIds", new JSONArray(hints.topicIds));
        putOptValue(status, "pts", trimToNull(hints.pts));
        putOptValue(status, "eventId", trimToNull(hints.eventId));
        putOptValue(status, "error", trimToNull(error));
        putValue(status, "retryable", retryable);
        putStatus(context, status);
    }

    public static void saveSnapshot(
        Context context,
        String userId,
        String apiUrl,
        String pts,
        String fromPts,
        String toPts,
        JSONArray syncEvents,
        JSONArray topics,
        JSONObject messagesByTopic
    ) {
        String nextPts = chooseMaxPts(chooseMaxPts(getLastPts(context), pts), toPts);
        SharedPreferences.Editor editor = prefs(context)
            .edit()
            .putString(KEY_USER_ID, trimToEmpty(userId))
            .putString(KEY_SNAPSHOT_USER_ID, trimToEmpty(userId))
            .putString(KEY_SNAPSHOT_API_URL, normalizeApiUrl(apiUrl))
            .putString(KEY_SYNC_EVENTS, syncEvents != null ? syncEvents.toString() : "[]")
            .putString(KEY_SYNC_FROM_PTS, trimToEmpty(fromPts))
            .putString(KEY_SYNC_TO_PTS, trimToEmpty(toPts))
            .putString(KEY_TOPICS_SNAPSHOT, topics != null ? topics.toString() : "[]")
            .putString(
                KEY_MESSAGES_SNAPSHOT,
                messagesByTopic != null ? messagesByTopic.toString() : "{}"
            )
            .putString(KEY_SNAPSHOT_UPDATED_AT, nowIso());

        if (!isBlank(nextPts)) {
            editor.putString(KEY_LAST_PTS, nextPts);
        }

        editor.apply();
    }

    public static JSONObject getSnapshot(Context context) {
        SharedPreferences prefs = prefs(context);
        JSONObject snapshot = new JSONObject();
        JSONArray topics = parseArray(prefs.getString(KEY_TOPICS_SNAPSHOT, ""));
        JSONArray syncEvents = tailArray(
            parseArray(prefs.getString(KEY_SYNC_EVENTS, "")),
            MAX_SNAPSHOT_EVENTS_EXPORT
        );
        JSONObject messagesByTopic = trimMessagesByTopic(
            parseObject(prefs.getString(KEY_MESSAGES_SNAPSHOT, "")),
            MAX_SNAPSHOT_MESSAGE_TOPICS_EXPORT,
            MAX_SNAPSHOT_MESSAGES_PER_TOPIC_EXPORT
        );
        boolean available =
            syncEvents.length() > 0 || topics.length() > 0 || messagesByTopic.length() > 0;

        putValue(snapshot, "available", available);
        putOptValue(snapshot, "userId", trimToNull(prefs.getString(KEY_USER_ID, "")));
        putOptValue(snapshot, "snapshotUserId", trimToNull(prefs.getString(KEY_SNAPSHOT_USER_ID, "")));
        putOptValue(snapshot, "snapshotApiUrl", trimToNull(prefs.getString(KEY_SNAPSHOT_API_URL, "")));
        putOptValue(snapshot, "lastPts", trimToNull(prefs.getString(KEY_LAST_PTS, "")));
        putOptValue(snapshot, "fromPts", trimToNull(prefs.getString(KEY_SYNC_FROM_PTS, "")));
        putOptValue(snapshot, "toPts", trimToNull(prefs.getString(KEY_SYNC_TO_PTS, "")));
        putValue(snapshot, "events", syncEvents);
        putValue(snapshot, "topics", topics);
        putValue(snapshot, "messagesByTopic", messagesByTopic);
        putValue(snapshot, "status", getStatus(context));
        putOptValue(
            snapshot,
            "updatedAt",
            trimToNull(prefs.getString(KEY_SNAPSHOT_UPDATED_AT, ""))
        );

        return snapshot;
    }

    public static JSONObject getStatus(Context context) {
        return parseObject(prefs(context).getString(KEY_STATUS, ""));
    }

    private static SharedPreferences prefs(Context context) {
        return context
            .getApplicationContext()
            .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    private static JSONObject newStatus(String state) {
        JSONObject status = new JSONObject();
        putValue(status, "state", state);
        putValue(status, "updatedAt", nowIso());
        return status;
    }

    private static void putStatus(Context context, JSONObject status) {
        prefs(context).edit().putString(KEY_STATUS, status.toString()).apply();
    }

    private static JSONObject parseObject(String raw) {
        if (isBlank(raw)) {
            return new JSONObject();
        }

        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }

    private static JSONArray parseArray(String raw) {
        if (isBlank(raw)) {
            return new JSONArray();
        }

        try {
            return new JSONArray(raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static boolean contains(JSONArray values, String value) {
        for (int i = 0; i < values.length(); i++) {
            if (value.equals(values.optString(i))) {
                return true;
            }
        }

        return false;
    }

    private static JSONArray tailArray(JSONArray source, int maxItems) {
        JSONArray result = new JSONArray();

        if (source == null || maxItems <= 0) {
            return result;
        }

        int start = Math.max(0, source.length() - maxItems);
        for (int i = start; i < source.length(); i++) {
            result.put(source.opt(i));
        }

        return result;
    }

    private static JSONObject trimMessagesByTopic(
        JSONObject source,
        int maxTopics,
        int maxMessagesPerTopic
    ) {
        JSONObject result = new JSONObject();

        if (source == null || maxTopics <= 0 || maxMessagesPerTopic <= 0) {
            return result;
        }

        Iterator<String> keys = source.keys();
        int topicCount = 0;

        while (keys.hasNext() && topicCount < maxTopics) {
            String topicId = keys.next();
            JSONArray messages = source.optJSONArray(topicId);

            if (messages == null || messages.length() == 0) {
                continue;
            }

            putValue(result, topicId, tailArray(messages, maxMessagesPerTopic));
            topicCount += 1;
        }

        return result;
    }

    private static String chooseMaxPts(String currentPts, String incomingPts) {
        if (isBlank(incomingPts)) {
            return trimToEmpty(currentPts);
        }

        if (isBlank(currentPts)) {
            return incomingPts.trim();
        }

        try {
            long current = Long.parseLong(currentPts.trim());
            long incoming = Long.parseLong(incomingPts.trim());
            return incoming > current ? incomingPts.trim() : currentPts.trim();
        } catch (NumberFormatException ignored) {
            return incomingPts.trim();
        }
    }

    private static String normalizeApiUrl(String apiUrl) {
        String normalized = trimToEmpty(apiUrl);

        while (normalized.endsWith("/")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }

        return normalized;
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static String trimToNull(String value) {
        String trimmed = trimToEmpty(value);
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private static String nowIso() {
        return java.time.Instant.now().toString();
    }

    private static JSONObject putValue(JSONObject object, String key, Object value) {
        try {
            object.put(key, value);
        } catch (JSONException ignored) {
        }

        return object;
    }

    private static JSONObject putOptValue(JSONObject object, String key, Object value) {
        try {
            object.putOpt(key, value);
        } catch (JSONException ignored) {
        }

        return object;
    }
}
