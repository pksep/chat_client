package sep.pksep.app.sync;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import sep.pksep.app.BuildConfig;

/** Свежие ответы запускаются одновременно с созданием WebView и потребляются один раз. */
public final class ChatStartupReads {
    private static final String PREFS = "chat_startup_reads";
    private static final int MAX_READS = 5;
    private static final String FULL_TOPICS_ENDPOINT =
        "/topics?page=1&limit=50&scope=chats&includeUnread=true&includeSync=true";
    private static final long MAX_AGE_MS = 10_000L;
    private static final long SYNC_RETRY_DELAY_MS = 5 * 60_000L;
    private static final ExecutorService IO = Executors.newFixedThreadPool(MAX_READS);
    private static final Map<String, CompletableFuture<JSONObject>> pending = new LinkedHashMap<>();
    private static ChatBackgroundSyncStore.Session session;
    private static long startedAt;

    public static final class Read {
        public final JSONObject data;
        public final long startedAt;

        private Read(JSONObject data, long startedAt) {
            this.data = data;
            this.startedAt = startedAt;
        }
    }

    private ChatStartupReads() {}

    public static void start(Context context) {
        Context app = context.getApplicationContext();
        IO.execute(() -> {
            try {
                ChatBackgroundSyncStore.Session saved = ChatBackgroundSyncStore.getSession(app);
                if (!saved.isValid() || saved.userId.isEmpty()) return;
                SharedPreferences preferences = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
                JSONObject plan = new JSONObject(preferences.getString("plan", "{}"));
                boolean sameAccount = saved.userId.equals(plan.optString("userId")) &&
                    saved.apiUrl.equals(plan.optString("apiUrl"));
                JSONArray endpoints = sameAccount ? plan.optJSONArray("endpoints") : null;
                boolean useFullTopics = sameAccount && useFullTopicsUntilRetry(
                    saved.apiUrl, preferences.getString("syncFallbackApi", ""),
                    preferences.getLong("syncRetryAt", 0L), System.currentTimeMillis()
                );
                if (endpoints == null) endpoints = new JSONArray()
                    .put("/users?page=1&limit=200")
                    .put(FULL_TOPICS_ENDPOINT);
                synchronized (ChatStartupReads.class) {
                    pending.clear();
                    session = saved;
                    startedAt = System.currentTimeMillis();
                    for (int i = 0; i < endpoints.length() && pending.size() < MAX_READS; i++) {
                        String endpoint = endpoints.optString(i);
                        if (!isAllowed(endpoint) || pending.containsKey(endpoint)) continue;
                        if (useFullTopics && endpoint.startsWith("/topics/sync?")) {
                            pending.put(endpoint, CompletableFuture.completedFuture(
                                new JSONObject().put("reset", true)
                            ));
                            scheduleFullTopics(app, saved);
                        } else schedule(app, saved, endpoint);
                    }
                }
            } catch (Exception invalidPlan) {
                // Повреждённый план не влияет на обычный HTTP-путь клиента.
            }
        });
    }

    private static void schedule(Context app, ChatBackgroundSyncStore.Session saved, String endpoint) {
        pending.put(endpoint, CompletableFuture.supplyAsync(() -> {
            try {
                mark("startup-read-requested");
                JSONObject result = new ChatBackgroundSyncApi(saved, 1200, 3000).fetchStartupRead(endpoint);
                mark("startup-read-received");
                if (endpoint.startsWith("/topics/sync?") && result.optBoolean("reset", false)) {
                    synchronized (ChatStartupReads.class) {
                        if (session == saved) scheduleFullTopics(app, saved);
                    }
                }
                if (endpoint.startsWith("/topics?page=1&") && !result.has("sync") && hasServiceTopics(result)) {
                    JSONObject meta = result.optJSONObject("meta");
                    int pages = meta == null ? 1 : meta.optInt("totalPages", 1);
                    synchronized (ChatStartupReads.class) {
                        if (session == saved) for (int page = 2; page <= Math.min(pages, 4); page++) {
                            String next = "/topics?page=" + page + "&limit=50&scope=chats";
                            if (!pending.containsKey(next)) schedule(app, saved, next);
                        }
                    }
                }
                return result;
            } catch (ChatBackgroundSyncApi.ApiException rejected) {
                if (shouldResetSync(endpoint, rejected.statusCode)) {
                    synchronized (ChatStartupReads.class) {
                        if (session != saved) return null;
                        app.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                            .putString("syncFallbackApi", saved.apiUrl)
                            .putLong("syncRetryAt", System.currentTimeMillis() + SYNC_RETRY_DELAY_MS)
                            .apply();
                        scheduleFullTopics(app, saved);
                    }
                    // Не повторяем в WebView уже отклонённую сервером дельту.
                    // Клиент заберёт свежий полный ответ через обычный fallback.
                    try {
                        return new JSONObject().put("reset", true);
                    } catch (Exception invalidResponse) {
                        return null;
                    }
                }
                return null;
            } catch (Exception unavailable) {
                return null;
            }
        }, IO));
    }

    private static void scheduleFullTopics(Context app, ChatBackgroundSyncStore.Session saved) {
        if (!pending.containsKey(FULL_TOPICS_ENDPOINT)) schedule(app, saved, FULL_TOPICS_ENDPOINT);
    }

    static boolean useFullTopicsUntilRetry(String apiUrl, String fallbackApi, long retryAt, long now) {
        return apiUrl != null && !apiUrl.isEmpty() && apiUrl.equals(fallbackApi) &&
            retryAt > now && retryAt - now <= SYNC_RETRY_DELAY_MS;
    }

    static boolean shouldResetSync(String endpoint, int statusCode) {
        return endpoint != null && endpoint.startsWith("/topics/sync?") &&
            (statusCode == 400 || statusCode == 404 || statusCode == 405 || statusCode == 501);
    }

    static boolean hasServiceTopics(JSONObject response) {
        JSONArray rows = response.optJSONArray("data");
        if (rows == null) return false;
        for (int i = 0; i < rows.length(); i++) {
            JSONObject topic = rows.optJSONObject(i);
            JSONObject group = topic == null ? null : topic.optJSONObject("group");
            String description = group == null ? "" : group.optString("description");
            if (description.startsWith("sep-chat:call-topic:v1:") ||
                description.equals("sep-chat:external-inquiry:v1")) return true;
        }
        return false;
    }

    public static void savePlan(Context context, String token, String apiUrl, JSONArray endpoints) {
        ChatBackgroundSyncStore.Session saved = ChatBackgroundSyncStore.getSession(context);
        if (!saved.isValid() || !saved.token.equals(token) || !saved.apiUrl.equals(normalize(apiUrl))) return;
        JSONArray allowed = new JSONArray();
        for (int i = 0; i < endpoints.length() && allowed.length() < MAX_READS; i++) {
            String endpoint = endpoints.optString(i);
            if (isAllowed(endpoint)) allowed.put(endpoint);
        }
        if (allowed.length() == 0) return;
        try {
            JSONObject plan = new JSONObject().put("userId", saved.userId)
                .put("apiUrl", saved.apiUrl).put("endpoints", allowed);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString("plan", plan.toString()).apply();
        } catch (Exception invalidPlan) { }
    }

    public static synchronized CompletableFuture<Read> take(
        Context context, String token, String apiUrl, String endpoint
    ) {
        ChatBackgroundSyncStore.Session saved = session;
        long requestStartedAt = startedAt;
        if (saved == null || !matches(saved.token, saved.apiUrl, token, apiUrl,
            System.currentTimeMillis() - startedAt)) return CompletableFuture.completedFuture(null);
        CompletableFuture<JSONObject> request = pending.remove(endpoint);
        if (request == null) return CompletableFuture.completedFuture(null);
        return request.thenApply(result -> {
            ChatBackgroundSyncStore.Session current = ChatBackgroundSyncStore.getSession(context);
            synchronized (ChatStartupReads.class) {
                return result != null && session == saved &&
                    ChatBackgroundSyncStore.sameSession(saved, current) &&
                    matches(saved.token, saved.apiUrl, token, apiUrl,
                        System.currentTimeMillis() - requestStartedAt)
                    ? new Read(result, requestStartedAt) : null;
            }
        });
    }

    public static synchronized CompletableFuture<JSONObject> prepare(Context context, String token) {
        ChatBackgroundSyncStore.Session saved = session;
        long requestStartedAt = startedAt;
        if (saved == null || !matches(saved.token, saved.apiUrl, token, saved.apiUrl,
            System.currentTimeMillis() - requestStartedAt)) return CompletableFuture.completedFuture(null);
        Map<String, CompletableFuture<Read>> reads = new LinkedHashMap<>();
        for (String endpoint : new java.util.ArrayList<>(pending.keySet())) {
            // Медленная необязательная страница не задерживает готовые ответы.
            // Незавершённые запросы SDK заберёт отдельно, когда они понадобятся.
            if (!pending.get(endpoint).isDone()) continue;
            reads.put(endpoint, take(context, token, saved.apiUrl, endpoint));
        }
        return CompletableFuture.allOf(reads.values().toArray(new CompletableFuture<?>[0]))
            .thenApply(ignored -> {
                synchronized (ChatStartupReads.class) {
                    if (session != saved || !ChatBackgroundSyncStore.sameSession(saved,
                        ChatBackgroundSyncStore.getSession(context)) ||
                        !matches(saved.token, saved.apiUrl, token, saved.apiUrl,
                            System.currentTimeMillis() - requestStartedAt)) return null;
                    try {
                        JSONObject data = new JSONObject();
                        for (Map.Entry<String, CompletableFuture<Read>> entry : reads.entrySet()) {
                            Read read = entry.getValue().getNow(null);
                            if (read != null) data.put(entry.getKey(), read.data);
                        }
                        return new JSONObject().put("available", true).put("apiUrl", saved.apiUrl)
                            .put("startedAt", requestStartedAt).put("reads", data);
                    } catch (Exception invalidResponse) {
                        return null;
                    }
                }
            });
    }

    static boolean isAllowed(String endpoint) {
        return endpoint != null && endpoint.length() < 1000 &&
            endpoint.matches("^/(topics(?:/sync)?|users)\\?[a-zA-Z0-9_%=&.:-]+$");
    }

    static boolean matches(String savedToken, String savedApi, String token, String api, long age) {
        return token != null && !token.isEmpty() && token.equals(savedToken)
            && normalize(api).equals(savedApi) && age >= 0 && age < MAX_AGE_MS;
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("/+$", "");
    }

    private static void mark(String stage) {
        if (BuildConfig.CHAT_STARTUP_BENCHMARK)
            android.util.Log.i("ChatStartupBenchmark", stage + " " + System.currentTimeMillis());
    }
}
