package sep.pksep.app.sync;

import static org.junit.Assert.*;

import org.junit.Test;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class ChatNotificationSessionRefresherTest {
    @Test
    public void expiredReactionRefreshesCookieSessionAndRetriesOnce() throws Exception {
        try (Server server = new Server(401, "{}", 200, "{\"accessToken\":\"fresh\"}",
            200, "{\"id\":\"user\"}", 200, "{}")) {
            Store store = server.store("chat_credentials");
            Jar jar = new Jar();
            server.api(store, jar).setNotificationReaction("topic", "message", "❤️");
            server.done.get(5, TimeUnit.SECONDS);
            assertEquals("fresh", store.session.token);
            assertEquals(4, server.requests.size());
            assertTrue(server.requests.get(0).contains("authorization: bearer expired"));
            assertTrue(server.requests.get(1).contains("post /auth/refresh"));
            assertTrue(server.requests.get(1).contains("cookie: refresh=fixture"));
            assertTrue(server.requests.get(2).contains("get /auth/session"));
            assertTrue(server.requests.get(3).contains("authorization: bearer fresh"));
            assertTrue(jar.saved.stream().anyMatch(cookie -> cookie.startsWith("rotated=fixture;")));
        }
    }

    @Test
    public void erpSessionRefreshesThroughErpOnly() throws Exception {
        try (Server server = new Server(401, "{}", 200, "{\"token\":\"fresh\"}",
            200, "{\"id\":\"user\"}", 200, "{}")) {
            Store store = server.store("erp_bootstrap");
            server.api(store, new Jar()).setNotificationReaction("topic", "message", "❤️");
            server.done.get(5, TimeUnit.SECONDS);
            assertTrue(server.requests.get(1).contains("get /api/auth/session"));
        }
    }

    @Test
    public void sharedSessionFallsBackToErpOnlyWhenChatCookieIsMissing() throws Exception {
        try (Server server = new Server(401, "{}", 401, "{\"code\":\"CHAT_REFRESH_MISSING\"}",
            200, "{\"token\":\"fresh\"}", 200, "{\"id\":\"user\"}", 200, "{}")) {
            Store store = server.store("unknown_shared");
            server.api(store, new Jar()).setNotificationReaction("topic", "message", "❤️");
            server.done.get(5, TimeUnit.SECONDS);
            assertTrue(server.requests.get(2).contains("get /api/auth/session"));
        }
    }

    @Test
    public void forbiddenActionDoesNotRefresh() throws Exception {
        try (Server server = new Server(403, "{}")) {
            expectStatus(403, () -> server.api(server.store("chat_credentials"), new Jar())
                .setNotificationReaction("topic", "message", "❤️"));
            server.done.get(5, TimeUnit.SECONDS);
            assertEquals(1, server.requests.size());
        }
    }

    @Test
    public void retryIsLimitedEvenIfFreshTokenIsRejected() throws Exception {
        try (Server server = new Server(401, "{}", 200, "{\"token\":\"fresh\"}",
            200, "{\"id\":\"user\"}", 401, "{}")) {
            expectStatus(401, () -> server.api(server.store("chat_credentials"), new Jar())
                .setNotificationReaction("topic", "message", "❤️"));
            server.done.get(5, TimeUnit.SECONDS);
            assertEquals(4, server.requests.size());
        }
    }

    @Test
    public void rejectsRefreshForAnotherUser() throws Exception {
        try (Server server = new Server(401, "{}", 200, "{\"token\":\"fresh\"}",
            200, "{\"id\":\"other\"}")) {
            Store store = server.store("chat_credentials");
            expectStatus(401, () -> server.api(store, new Jar()).setNotificationReaction("topic", "message", "❤️"));
            server.done.get(5, TimeUnit.SECONDS);
            assertEquals("expired", store.session.token);
            assertEquals(3, server.requests.size());
        }
    }

    @Test
    public void logoutOrAccountSwitchDuringRefreshCannotRestoreOldSession() throws Exception {
        for (String nextUser : new String[] { "", "other" }) {
            try (Server server = new Server(401, "{}", 200, "{\"token\":\"fresh\"}",
                200, "{\"id\":\"user\"}")) {
                Store store = server.store("chat_credentials");
                server.onRequest = index -> {
                    if (index == 2) store.session = new ChatBackgroundSyncStore.Session("new", nextUser, server.url());
                };
                expectStatus(401, () -> server.api(store, new Jar()).setNotificationReaction("topic", "message", "❤️"));
                server.done.get(5, TimeUnit.SECONDS);
                assertEquals(nextUser, store.session.userId);
                assertEquals("new", store.session.token);
                assertEquals(3, server.requests.size());
            }
        }
    }

    @Test
    public void transientRefreshFailureCanBeRetriedByWorker() throws Exception {
        try (Server server = new Server(401, "{}", 503, "{}")) {
            try {
                server.api(server.store("chat_credentials"), new Jar()).setNotificationReaction("topic", "message", "❤️");
                fail("Expected 503");
            } catch (ChatBackgroundSyncApi.ApiException error) {
                assertTrue(error.isRetryable());
            }
        }
    }

    interface Action { void run() throws Exception; }
    private static void expectStatus(int status, Action action) throws Exception {
        try { action.run(); fail("Expected HTTP " + status); }
        catch (ChatBackgroundSyncApi.ApiException error) { assertEquals(status, error.statusCode); }
    }

    private static class Store implements ChatNotificationSessionRefresher.SessionStore {
        volatile ChatBackgroundSyncStore.Session session;
        Store(ChatBackgroundSyncStore.Session session) { this.session = session; }
        public ChatBackgroundSyncStore.Session get() { return session; }
        public synchronized ChatBackgroundSyncStore.Session save(ChatBackgroundSyncStore.Session expected, String token) {
            if (ChatBackgroundSyncStore.sameSession(session, expected)) {
                session = new ChatBackgroundSyncStore.Session(token, expected.userId, expected.apiUrl, expected.authSource, expected.erpUrl);
            }
            return session;
        }
    }

    private static class Jar implements ChatNotificationSessionRefresher.Cookies {
        final List<String> saved = new ArrayList<>();
        public String get(String url) { return "refresh=fixture"; }
        public void set(String url, String cookie) { saved.add(cookie); }
    }

    private static class Server implements AutoCloseable {
        final ServerSocket socket;
        final List<String> requests = new ArrayList<>();
        final CompletableFuture<Void> done;
        java.util.function.IntConsumer onRequest = index -> {};
        Server(Object... responses) throws IOException {
            socket = new ServerSocket(0, 8, InetAddress.getLoopbackAddress());
            socket.setSoTimeout(5000);
            done = CompletableFuture.runAsync(() -> {
                try {
                    for (int index = 0; index < responses.length; index += 2) {
                        try (Socket client = socket.accept()) {
                            client.setSoTimeout(5000);
                            InputStream input = new BufferedInputStream(client.getInputStream());
                            StringBuilder request = new StringBuilder(readLine(input));
                            int length = 0;
                            String line;
                            while (!(line = readLine(input)).isEmpty()) {
                                request.append('\n').append(line);
                                if (line.toLowerCase(Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.split(":")[1].trim());
                            }
                            for (int consumed = 0; consumed < length; consumed++) input.read();
                            requests.add(request.toString().toLowerCase(Locale.ROOT));
                            onRequest.accept(index / 2);
                            byte[] body = ((String) responses[index + 1]).getBytes(StandardCharsets.UTF_8);
                            String headers = "HTTP/1.1 " + responses[index] + " Fixture\r\nContent-Type: application/json\r\n"
                                + "Set-Cookie: rotated=fixture; HttpOnly\r\nConnection: close\r\nContent-Length: " + body.length + "\r\n\r\n";
                            client.getOutputStream().write(headers.getBytes(StandardCharsets.UTF_8));
                            client.getOutputStream().write(body);
                        }
                    }
                } catch (IOException error) { throw new CompletionException(error); }
            });
        }
        String url() { return "http://127.0.0.1:" + socket.getLocalPort(); }
        private static String readLine(InputStream input) throws IOException {
            StringBuilder line = new StringBuilder();
            int value;
            while ((value = input.read()) != -1 && value != '\n') {
                if (value != '\r') line.append((char) value);
            }
            return line.toString();
        }
        Store store(String source) { return new Store(new ChatBackgroundSyncStore.Session("expired", "user", url(), source, url())); }
        ChatBackgroundSyncApi api(Store store, Jar jar) {
            return new ChatBackgroundSyncApi(store.session, new ChatNotificationSessionRefresher(store, jar));
        }
        public void close() throws IOException { socket.close(); }
    }
}
