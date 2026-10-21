package sep.pksep.app.sync;

import android.content.Context;
import android.webkit.CookieManager;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

final class ChatNotificationSessionRefresher implements ChatBackgroundSyncApi.SessionRefresher {
    private static final Object REFRESH_LOCK = new Object();

    interface SessionStore {
        ChatBackgroundSyncStore.Session get();
        ChatBackgroundSyncStore.Session save(ChatBackgroundSyncStore.Session expected, String token);
    }

    interface Cookies {
        String get(String url);
        void set(String url, String cookie);
    }

    private final SessionStore store;
    private final Cookies cookies;

    ChatNotificationSessionRefresher(Context context) {
        this(new SessionStore() {
            public ChatBackgroundSyncStore.Session get() {
                return ChatBackgroundSyncStore.getSession(context);
            }
            public ChatBackgroundSyncStore.Session save(ChatBackgroundSyncStore.Session expected, String token) {
                return ChatBackgroundSyncStore.saveRefreshedSession(context, expected, token);
            }
        }, new Cookies() {
            public String get(String url) { return CookieManager.getInstance().getCookie(url); }
            public void set(String url, String cookie) {
                CookieManager manager = CookieManager.getInstance();
                manager.setCookie(url, cookie);
                manager.flush();
            }
        });
    }

    ChatNotificationSessionRefresher(SessionStore store, Cookies cookies) {
        this.store = store;
        this.cookies = cookies;
    }

    public ChatBackgroundSyncStore.Session current(ChatBackgroundSyncStore.Session expected) throws IOException {
        ChatBackgroundSyncStore.Session current = store.get();
        if (!current.isValid() || expected.userId.isEmpty() || !expected.userId.equals(current.userId)
            || !expected.apiUrl.equals(current.apiUrl)) throw unauthorized();
        return current;
    }

    public ChatBackgroundSyncStore.Session refresh(ChatBackgroundSyncStore.Session expired) throws IOException {
        synchronized (REFRESH_LOCK) {
            ChatBackgroundSyncStore.Session active = current(expired);
            if (!active.token.equals(expired.token)) return active;
            try {
                JSONObject result;
                if ("erp_bootstrap".equals(active.authSource)) {
                    result = refreshErp(active);
                } else {
                    try {
                        result = request(active.apiUrl + "/auth/refresh", "POST", null, true);
                    } catch (ChatBackgroundSyncApi.ApiException error) {
                        if (error.statusCode != 401 || !"unknown_shared".equals(active.authSource)
                            || !"CHAT_REFRESH_MISSING".equals(errorCode(error))) throw error;
                        result = refreshErp(active);
                    }
                }
                String token = result.optString("accessToken", result.optString("token", ""));
                if (token.isEmpty()) throw new IOException("Сервис авторизации не вернул токен");
                JSONObject user = request(active.apiUrl + "/auth/session", "GET", token, false);
                if (!active.userId.equals(user.optString("id"))) throw unauthorized();
                // Выход или смена аккаунта во время запроса не должны восстанавливать старую сессию.
                store.save(active, token);
                return current(active);
            } catch (JSONException error) {
                throw new IOException("Некорректный ответ авторизации", error);
            }
        }
    }

    private JSONObject refreshErp(ChatBackgroundSyncStore.Session session) throws IOException, JSONException {
        if (session.erpUrl.isEmpty()) throw unauthorized();
        return request(session.erpUrl + "/api/auth/session", "GET", null, true);
    }

    private String errorCode(ChatBackgroundSyncApi.ApiException error) {
        try { return new JSONObject(error.responseBody).optString("code"); }
        catch (JSONException ignored) { return ""; }
    }

    private JSONObject request(String url, String method, String token, boolean useCookies)
        throws IOException, JSONException {
        URL target = new URL(url);
        if (!"https".equals(target.getProtocol()) && !"http".equals(target.getProtocol())) throw unauthorized();
        HttpURLConnection connection = (HttpURLConnection) target.openConnection();
        try {
            connection.setRequestMethod(method);
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(20000);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if (useCookies) {
                String cookie = cookies.get(url);
                if (cookie != null && !cookie.isEmpty()) connection.setRequestProperty("Cookie", cookie);
            }
            int status = connection.getResponseCode();
            if (useCookies) {
                for (Map.Entry<String, List<String>> header : connection.getHeaderFields().entrySet()) {
                    if ("Set-Cookie".equalsIgnoreCase(header.getKey())) {
                        for (String cookie : header.getValue()) cookies.set(url, cookie);
                    }
                }
            }
            java.io.InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            String body;
            if (stream == null) body = "";
            else try (java.io.InputStream input = stream) {
                java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                body = new String(output.toByteArray(), StandardCharsets.UTF_8);
            }
            if (status < 200 || status >= 300) throw new ChatBackgroundSyncApi.ApiException(status, body);
            return new JSONObject(body);
        } finally {
            connection.disconnect();
        }
    }

    private static ChatBackgroundSyncApi.ApiException unauthorized() {
        return new ChatBackgroundSyncApi.ApiException(401, "Требуется актуальная сессия того же пользователя");
    }
}
