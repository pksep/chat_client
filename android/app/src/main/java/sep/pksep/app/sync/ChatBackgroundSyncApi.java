package sep.pksep.app.sync;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URLEncoder;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class ChatBackgroundSyncApi {
    private static final int CONNECT_TIMEOUT_MS = 15000;
    private static final int READ_TIMEOUT_MS = 20000;

    private final ChatBackgroundSyncStore.Session session;

    ChatBackgroundSyncApi(ChatBackgroundSyncStore.Session session) {
        this.session = session;
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

    JSONArray fetchTopics(int limit) throws IOException, JSONException {
        Object payload = getJson("/topics?page=1&limit=" + Math.max(1, limit));

        if (payload instanceof JSONArray) {
            return (JSONArray) payload;
        }

        if (payload instanceof JSONObject) {
            JSONArray data = ((JSONObject) payload).optJSONArray("data");
            return data != null ? data : new JSONArray();
        }

        return new JSONArray();
    }

    JSONArray fetchLatestMessages(String topicId, int limit)
        throws IOException, JSONException {
        String encodedTopicId = URLEncoder.encode(
            topicId,
            StandardCharsets.UTF_8.name()
        );

        Object payload = getJson(
            "/messages/topic/" + encodedTopicId + "?limit=" + Math.max(1, limit)
        );

        if (payload instanceof JSONArray) {
            return (JSONArray) payload;
        }

        if (payload instanceof JSONObject) {
            JSONArray data = ((JSONObject) payload).optJSONArray("data");
            return data != null ? data : new JSONArray();
        }

        return new JSONArray();
    }

    private Object getJson(String path) throws IOException, JSONException {
        String raw = get(path);

        if (raw.trim().isEmpty()) {
            return new JSONObject();
        }

        return new JSONTokener(raw).nextValue();
    }

    private String get(String path) throws IOException {
        HttpURLConnection connection = null;

        try {
            URL url = new URL(session.apiUrl + path);
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + session.token);

            int statusCode = connection.getResponseCode();
            InputStream stream = statusCode >= 400
                ? connection.getErrorStream()
                : connection.getInputStream();
            String body = readBody(stream);

            if (statusCode >= 400) {
                throw new ApiException(statusCode, body);
            }

            return body;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
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

        ApiException(int statusCode, String body) {
            super("HTTP " + statusCode + (body == null || body.isEmpty() ? "" : ": " + body));
            this.statusCode = statusCode;
        }

        boolean isAuthError() {
            return statusCode == 401 || statusCode == 403;
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
