package sep.pksep.app.sync;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import sep.pksep.app.BuildConfig;

// Ранняя история уведомления перекрывает создание WebView. Список чатов
// синхронизирует сам WebView из IndexedDB, чтобы не дублировать запросы.
public final class ChatStartupHistory {
    private static final ExecutorService IO = Executors.newFixedThreadPool(2);
    private static final ExecutorService CACHE_IO = Executors.newSingleThreadExecutor();
    private static final String CACHE_DIRECTORY = "startup-history";
    // Keep the complete "30 new messages" notification scenario in the
    // native first frame without making the tap wait for a larger payload.
    private static final int STARTUP_MESSAGES_LIMIT = 32;
    private static final int MAX_PENDING_REQUESTS = 3;
    private static final Map<String, Request> pending = new LinkedHashMap<>();
    private static String activeTopicId = "";

    private ChatStartupHistory() {}

    private static final class Request {
        final String topicId;
        final long startedAt;
        final CompletableFuture<Response> result;

        Request(Context context, String topicId) {
            this.topicId = topicId;
            this.startedAt = System.currentTimeMillis();
            this.result = CompletableFuture.supplyAsync(() -> {
                try {
                    // SharedPreferences содержит и историю: загрузка XML не должна блокировать Activity.
                    ChatBackgroundSyncStore.Session session = ChatBackgroundSyncStore.getSession(context);
                    if (!session.isValid() || session.userId == null || session.userId.isEmpty()) return null;
                    mark("history-requested");
                    ChatBackgroundSyncApi api = new ChatBackgroundSyncApi(session, 1500, 1500);
                    JSONArray rows = api.fetchLatestMessages(topicId, STARTUP_MESSAGES_LIMIT);
                    mark("history-received");
                    return new Response(session, rows);
                } catch (Exception error) {
                    // Ошибка раннего запроса оставляет обычный путь HTTP в WebView.
                    mark("history-unavailable");
                    return null;
                }
            }, IO);
            // The fresh response may already be painted while the offline copy
            // is written. A file-system flush must never delay the first frame.
            this.result.thenAcceptAsync(response -> {
                if (response != null) {
                    saveCached(context, response.session, topicId, response.rows);
                }
            }, CACHE_IO);
        }

        Request(String topicId, long startedAt, Response response) {
            this.topicId = topicId;
            this.startedAt = startedAt;
            this.result = CompletableFuture.completedFuture(response);
        }
    }

    private static final class Response {
        final ChatBackgroundSyncStore.Session session;
        final JSONArray rows;

        Response(ChatBackgroundSyncStore.Session session, JSONArray rows) {
            this.session = session;
            this.rows = rows;
        }
    }

    private static void mark(String stage) {
        if (BuildConfig.CHAT_STARTUP_BENCHMARK) {
            android.util.Log.i("ChatStartupBenchmark", stage + " " + System.currentTimeMillis());
        }
    }

    public static synchronized CompletableFuture<JSONArray> start(
        Context context,
        String topicId
    ) {
        String normalizedTopicId = normalizeTopicId(topicId);
        activeTopicId = normalizedTopicId;
        if (normalizedTopicId.isEmpty()) return CompletableFuture.completedFuture(null);
        Request request = getOrStart(context, normalizedTopicId);
        return request.result.handle(
            (response, error) -> error == null && response != null
                ? response.rows
                : null
        );
    }

    public static synchronized void prefetch(
        Context context,
        String notificationTopicId
    ) {
        String normalizedTopicId = normalizeTopicId(notificationTopicId);
        if (normalizedTopicId.isEmpty()) return;
        getOrStart(context, normalizedTopicId);
    }

    public static synchronized void refreshCache(
        Context context,
        String topicId
    ) {
        String normalizedTopicId = normalizeTopicId(topicId);
        if (normalizedTopicId.isEmpty()) return;
        getOrStart(context, normalizedTopicId);
    }

    private static Request getOrStart(Context context, String topicId) {
        long now = System.currentTimeMillis();
        Request existing = pending.get(topicId);
        if (existing != null && now - existing.startedAt < 10000) {
            mark("history-reused");
            return existing;
        }
        if (existing != null) pending.remove(topicId);

        Iterator<Map.Entry<String, Request>> iterator =
            pending.entrySet().iterator();
        while (iterator.hasNext()) {
            Map.Entry<String, Request> entry = iterator.next();
            if (now - entry.getValue().startedAt >= 10000) iterator.remove();
        }
        while (pending.size() >= MAX_PENDING_REQUESTS) {
            Iterator<String> keys = pending.keySet().iterator();
            if (!keys.hasNext()) break;
            keys.next();
            keys.remove();
        }

        mark("history-scheduled");
        Context applicationContext = context.getApplicationContext();
        if (applicationContext == null) applicationContext = context;
        Request request = new Request(
            applicationContext,
            topicId
        );
        pending.put(topicId, request);
        return request;
    }

    private static String normalizeTopicId(String topicId) {
        return topicId == null ? "" : topicId;
    }

    public static synchronized void adopt(
        Context context,
        String topicId,
        String rawRows,
        long startedAt
    ) {
        String normalizedTopicId = topicId == null ? "" : topicId;
        if (
            rawRows == null ||
            rawRows.isEmpty() ||
            startedAt <= 0 ||
            System.currentTimeMillis() - startedAt >= 10000
        ) return;
        try {
            ChatBackgroundSyncStore.Session session =
                ChatBackgroundSyncStore.getSession(context.getApplicationContext());
            if (!session.isValid()) return;
            activeTopicId = normalizedTopicId;
            pending.put(normalizedTopicId, new Request(
                normalizedTopicId,
                startedAt,
                new Response(session, new JSONArray(rawRows))
            ));
            mark("history-adopted");
        } catch (Exception ignored) {
            // The WebView keeps its normal HTTP path when an oversized or
            // malformed cross-process handoff cannot be adopted.
        }
    }

    public static CompletableFuture<JSONArray> loadCached(
        Context context,
        String topicId
    ) {
        Context applicationContext = context.getApplicationContext();
        String normalizedTopicId = topicId == null ? "" : topicId;
        return CompletableFuture.supplyAsync(
            () -> readCached(applicationContext, normalizedTopicId, -1L),
            CACHE_IO
        );
    }

    public static CompletableFuture<JSONArray> loadRecentCached(
        Context context,
        String topicId,
        long maxAgeMs
    ) {
        Context applicationContext = context.getApplicationContext();
        String normalizedTopicId = normalizeTopicId(topicId);
        return CompletableFuture.supplyAsync(
            () -> readCached(
                applicationContext,
                normalizedTopicId,
                Math.max(0L, maxAgeMs)
            ),
            CACHE_IO
        );
    }

    public static JSONArray readRecentCachedNow(
        Context context,
        String topicId,
        long maxAgeMs
    ) {
        Context applicationContext = context.getApplicationContext();
        if (applicationContext == null) applicationContext = context;
        return readCached(
            applicationContext,
            normalizeTopicId(topicId),
            Math.max(0L, maxAgeMs)
        );
    }

    public static String getCurrentUserId(Context context) {
        ChatBackgroundSyncStore.Session session =
            ChatBackgroundSyncStore.getSession(context.getApplicationContext());
        return session.isValid() && session.userId != null ? session.userId : "";
    }

    static boolean matches(String savedUserId, String savedApiUrl, String savedTopicId,
                           String userId, String apiUrl, String topicId, long ageMs) {
        return ageMs >= 0 && ageMs < 10000 && userId != null && !userId.isEmpty()
            && userId.equals(savedUserId) && normalize(apiUrl).equals(normalize(savedApiUrl))
            && (topicId == null ? "" : topicId).equals(savedTopicId);
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("/+$", "");
    }

    private static File cacheFile(Context context, String topicId) {
        File directory = new File(context.getFilesDir(), CACHE_DIRECTORY);
        if (!directory.exists()) directory.mkdirs();
        String safeTopicId = topicId == null || topicId.isEmpty()
            ? "topics"
            : topicId.replaceAll("[^0-9a-zA-Z-]", "_");
        return new File(directory, safeTopicId + ".json");
    }

    private static void saveCached(
        Context context,
        ChatBackgroundSyncStore.Session session,
        String topicId,
        JSONArray rows
    ) {
        try {
            JSONObject payload = new JSONObject()
                .put("userId", session.userId)
                .put("apiUrl", normalize(session.apiUrl))
                .put("topicId", topicId)
                .put("savedAt", System.currentTimeMillis())
                .put("data", rows);
            Files.write(
                cacheFile(context, topicId).toPath(),
                payload.toString().getBytes(StandardCharsets.UTF_8)
            );
        } catch (Exception ignored) {
            // Кеш нужен только для быстрого офлайн-экрана; основной запуск не блокируем.
        }
    }

    private static JSONArray readCached(
        Context context,
        String topicId,
        long maxAgeMs
    ) {
        try {
            File file = cacheFile(context, topicId);
            if (!file.isFile()) return null;
            JSONObject payload = new JSONObject(
                new String(
                    Files.readAllBytes(file.toPath()),
                    StandardCharsets.UTF_8
                )
            );
            if (maxAgeMs >= 0L) {
                long savedAt = payload.optLong("savedAt", 0L);
                long ageMs = System.currentTimeMillis() - savedAt;
                if (savedAt <= 0L || ageMs < 0L || ageMs > maxAgeMs) {
                    return null;
                }
            }
            ChatBackgroundSyncStore.Session session =
                ChatBackgroundSyncStore.getSession(context);
            if (
                !session.isValid() ||
                !session.userId.equals(payload.optString("userId")) ||
                !normalize(session.apiUrl).equals(
                    normalize(payload.optString("apiUrl"))
                ) ||
                !topicId.equals(payload.optString("topicId"))
            ) {
                return null;
            }
            return payload.optJSONArray("data");
        } catch (Exception ignored) {
            return null;
        }
    }

    public static synchronized CompletableFuture<JSONObject> prepare(Context context) {
        Request request = pending.remove(activeTopicId);
        if (request == null) return CompletableFuture.completedFuture(null);
        return request.result.handle((response, error) -> {
            if (error != null || response == null) return null;
            ChatBackgroundSyncStore.Session current = ChatBackgroundSyncStore.getSession(context);
            if (!current.isValid() || !current.token.equals(response.session.token) ||
                !matches(response.session.userId, response.session.apiUrl, request.topicId,
                    current.userId, current.apiUrl, request.topicId,
                    System.currentTimeMillis() - request.startedAt)) return null;
            try {
                return new JSONObject().put("available", true)
                    .put("userId", current.userId).put("apiUrl", current.apiUrl)
                    .put("topicId", request.topicId).put("startedAt", request.startedAt)
                    .put("data", response.rows);
            } catch (Exception invalidResponse) {
                return null;
            }
        });
    }

    public static synchronized CompletableFuture<JSONArray> take(Context context, String userId,
                                                                  String apiUrl, String topicId) {
        String normalizedTopicId = normalizeTopicId(topicId);
        Request request = pending.remove(normalizedTopicId);
        if (request == null) return CompletableFuture.completedFuture(null);
        return request.result.handle((response, error) -> {
            if (error != null || response == null || !matches(response.session.userId, response.session.apiUrl,
                    request.topicId, userId, apiUrl, topicId, System.currentTimeMillis() - request.startedAt)) return null;
            ChatBackgroundSyncStore.Session current = ChatBackgroundSyncStore.getSession(context);
            return current.isValid() && matches(current.userId, current.apiUrl,
                request.topicId, userId, apiUrl, topicId, System.currentTimeMillis() - request.startedAt)
                ? response.rows : null;
        });
    }
}
