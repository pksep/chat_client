package sep.pksep.app.sync;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import sep.pksep.app.BuildConfig;

final class ChatBackgroundSyncApi {
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 20000;

    interface SessionRefresher {
        ChatBackgroundSyncStore.Session current(ChatBackgroundSyncStore.Session expected) throws IOException;
        ChatBackgroundSyncStore.Session refresh(ChatBackgroundSyncStore.Session expired) throws IOException;
    }

    private ChatBackgroundSyncStore.Session session;
    private SessionRefresher sessionRefresher;
    private final int connectTimeoutMs;
    private final int readTimeoutMs;

    ChatBackgroundSyncApi(ChatBackgroundSyncStore.Session session) {
        this(session, CONNECT_TIMEOUT_MS, READ_TIMEOUT_MS);
    }

    ChatBackgroundSyncApi(ChatBackgroundSyncStore.Session session, int connectTimeoutMs, int readTimeoutMs) {
        this.session = session;
        this.connectTimeoutMs = connectTimeoutMs;
        this.readTimeoutMs = readTimeoutMs;
    }

    ChatBackgroundSyncApi(ChatBackgroundSyncStore.Session session, SessionRefresher refresher) {
        this(session);
        sessionRefresher = refresher;
    }

    SyncEventsResult fetchSyncEvents(String pts, int limit)
        throws IOException, JSONException {
        StringBuilder endpoint = new StringBuilder("/sync/events?limit=")
            .append(Math.max(1, limit));

        if (pts != null && !pts.trim().isEmpty()) {
            endpoint
                .append("&pts=")
                .append(URLEncoder.encode(pts.trim(), StandardCharsets.UTF_8.name()));
        }

        Object payload = getJson(endpoint.toString());

        if (!(payload instanceof JSONObject)) {
            return SyncEventsResult.empty(pts);
        }

        JSONObject data = (JSONObject) payload;
        JSONArray events = data.optJSONArray("events");

        return new SyncEventsResult(
            data.optString("fromPts", pts),
            data.optString("toPts", pts),
            events != null ? events : new JSONArray(),
            data.optBoolean("hasMore", false)
        );
    }

    JSONArray fetchStartupTopics(int limit) throws IOException, JSONException {
        int pageSize = Math.max(1, Math.min(limit, 50));
        return requireRows(getJson("/topics?page=1&limit=" + pageSize + "&scope=chats"));
    }

    JSONArray fetchTopics(int limit) throws IOException, JSONException {
        int pageSize = Math.max(1, Math.min(limit, 50));
        Map<String, JSONObject> topics = new LinkedHashMap<>();
        for (int page = 1; ; page++) {
            Object payload = getJson("/topics?page=" + page + "&limit=" + pageSize + "&scope=sidebar");
            JSONArray rows = requireRows(payload);
            int previousSize = topics.size();
            for (int index = 0; index < rows.length(); index++) {
                JSONObject topic = rows.getJSONObject(index);
                topics.put(topic.getString("id"), topic);
            }
            JSONObject response = payload instanceof JSONObject ? (JSONObject) payload : null;
            JSONObject meta = response != null ? response.optJSONObject("meta") : null;
            int totalPages = meta != null ? meta.optInt("totalPages", -1)
                : response != null ? response.optInt("totalPages", -1) : -1;
            int total = meta != null ? meta.optInt("totalItems", -1)
                : response != null ? response.optInt("total", -1) : -1;
            boolean hasNext = totalPages >= 0 ? page < totalPages
                : total >= 0 ? (long) page * pageSize < total : rows.length() >= pageSize;
            if (!hasNext) return new JSONArray(topics.values());
            if (topics.size() == previousSize)
                throw new IOException("Сервер вернул повторную или пустую страницу чатов");
        }
    }

    JSONArray fetchLatestMessages(String topicId, int limit)
        throws IOException, JSONException {
        String encodedTopicId = URLEncoder.encode(
            topicId,
            StandardCharsets.UTF_8.name()
        );

        Object payload = getJson(
            "/messages/topic/" + encodedTopicId + "?limit=" + Math.max(1, limit) + "&newMessages=true"
        );

        return requireRows(payload);
    }

    static JSONArray requireRows(Object payload) throws IOException {
        if (payload instanceof JSONArray) return (JSONArray) payload;
        if (payload instanceof JSONObject) {
            JSONArray rows = ((JSONObject) payload).optJSONArray("data");
            if (rows != null) return rows;
        }
        throw new IOException("Сервер вернул некорректный список чата");
    }

    private void markStartupRequest(String stage) {
        if (BuildConfig.CHAT_STARTUP_BENCHMARK && connectTimeoutMs == 1500) {
            android.util.Log.i("ChatStartupBenchmark", stage + " " + System.currentTimeMillis());
        }
    }

    void sendNotificationReply(
        String topicId,
        String text,
        String clientId,
        String replyMessageId
    ) throws IOException, JSONException {
        JSONObject payload = new JSONObject();
        payload.put("text", text);
        payload.put("clientId", clientId);
        if (replyMessageId != null && !replyMessageId.trim().isEmpty()) {
            payload.put("replyMessageId", replyMessageId.trim());
        }
        postJson(
            "/messages/topic/" + encodePathSegment(topicId) + "/reply",
            payload
        );
    }

    void setNotificationReaction(
        String topicId,
        String messageId,
        String emoji
    ) throws IOException, JSONException {
        JSONObject payload = new JSONObject();
        payload.put("messageId", messageId);
        payload.put("emoji", emoji);
        postJson(
            "/messages/topic/" + encodePathSegment(topicId) + "/reaction",
            payload
        );
    }

    void markNotificationRead(String topicId, String messageId)
        throws IOException, JSONException {
        JSONObject payload = new JSONObject();
        payload.put("messageId", messageId);
        postJson(
            "/messages/topic/" + encodePathSegment(topicId) + "/read",
            payload
        );
    }

    JSONObject fetchStartupRead(String path) throws IOException, JSONException {
        if (!ChatStartupReads.isAllowed(path)) throw new IOException("Недопустимый стартовый запрос");
        Object result = getJson(path);
        if (!(result instanceof JSONObject)) throw new IOException("Некорректный стартовый ответ");
        return (JSONObject) result;
    }

    private Object getJson(String path) throws IOException, JSONException {
        String raw = get(path);

        if (raw.trim().isEmpty()) {
            return new JSONObject();
        }

        return new JSONTokener(raw).nextValue();
    }

    private void postJson(String path, JSONObject payload) throws IOException {
        request("POST", path, payload != null ? payload.toString() : "{}");
    }

    private String get(String path) throws IOException {
        return request("GET", path, null);
    }

    private String request(String method, String path, String body)
        throws IOException {
        if (sessionRefresher != null) session = sessionRefresher.current(session);
        try {
            return requestOnce(method, path, body);
        } catch (ApiException error) {
            if (error.statusCode != 401 || sessionRefresher == null) throw error;
            session = sessionRefresher.refresh(session);
            session = sessionRefresher.current(session);
            return requestOnce(method, path, body);
        }
    }

    private String requestOnce(String method, String path, String body) throws IOException {
        HttpURLConnection connection = null;

        try {
            URL url = new URL(session.apiUrl + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(connectTimeoutMs);
            connection.setReadTimeout(readTimeoutMs);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + session.token);

            if (body != null) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true);
                connection.setFixedLengthStreamingMode(bytes.length);
                connection.setRequestProperty(
                    "Content-Type",
                    "application/json; charset=UTF-8"
                );

                try (OutputStream output = connection.getOutputStream()) {
                    output.write(bytes);
                }
            }

            markStartupRequest("history-connection-start");
            int statusCode = connection.getResponseCode();
            markStartupRequest("history-headers");
            InputStream stream = statusCode >= 400
                ? connection.getErrorStream()
                : connection.getInputStream();
            String responseBody = readBody(stream);
            markStartupRequest("history-body");

            if (statusCode >= 400) {
                throw new ApiException(statusCode, responseBody);
            }

            return responseBody;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private String encodePathSegment(String value) throws IOException {
        return URLEncoder.encode(value, StandardCharsets.UTF_8.name());
    }

    private String readBody(InputStream stream) throws IOException {
        if (stream == null) {
            return "";
        }

        StringBuilder builder = new StringBuilder();

        try (
            BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8)
            )
        ) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }

        return builder.toString();
    }

    static final class ApiException extends IOException {
        final int statusCode;
        final String responseBody;

        ApiException(int statusCode, String body) {
            super("HTTP " + statusCode + (body == null || body.isEmpty() ? "" : ": " + body));
            this.statusCode = statusCode;
            this.responseBody = body;
        }

        boolean isAuthError() {
            return statusCode == 401 || statusCode == 403;
        }

        boolean isRetryable() {
            return statusCode == 408 || statusCode == 429 || statusCode >= 500;
        }

        boolean isNotFound() {
            return statusCode == 404;
        }
    }

    static final class SyncEventsResult {
        final String fromPts;
        final String toPts;
        final JSONArray events;
        final boolean hasMore;

        SyncEventsResult(String fromPts, String toPts, JSONArray events, boolean hasMore) {
            this.fromPts = fromPts;
            this.toPts = toPts;
            this.events = events;
            this.hasMore = hasMore;
        }

        static SyncEventsResult empty(String pts) {
            return new SyncEventsResult(pts, pts, new JSONArray(), false);
        }
    }
}
