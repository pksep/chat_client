package sep.pksep.app.sync;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.assertEquals;

import org.junit.Test;
import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;

public class ChatBackgroundSyncApiTest {
    @Test
    public void loadsBackgroundPagesAndDeduplicatesTopics() throws Exception {
        try (TopicServer server = new TopicServer(
            "{\"data\":[{\"id\":\"a\"},{\"id\":\"b\"}],\"meta\":{\"totalPages\":2}}",
            "{\"data\":[{\"id\":\"b\"},{\"id\":\"c\"}],\"meta\":{\"totalPages\":2}}"
        )) {
            JSONArray topics = server.api().fetchTopics(999);
            assertEquals(3, topics.length());
            assertEquals("c", topics.getJSONObject(2).getString("id"));
            server.completed.get(5, TimeUnit.SECONDS);
            assertTrue(server.requests.get(0).contains("page=1&limit=50&scope=sidebar"));
            assertTrue(server.requests.get(1).contains("page=2&limit=50&scope=sidebar"));
        }
    }

    @Test
    public void startupDoesNotDownloadSubsequentPages() throws Exception {
        try (TopicServer server = new TopicServer(
            "{\"data\":[{\"id\":\"a\"}],\"meta\":{\"totalPages\":3}}"
        )) {
            assertEquals(1, server.api().fetchStartupTopics(50).length());
            server.completed.get(5, TimeUnit.SECONDS);
            assertEquals(1, server.requests.size());
            assertTrue(server.requests.get(0).contains("page=1&limit=50&scope=chats"));
        }
    }

    @Test(expected = IOException.class)
    public void stopsWhenServerRepeatsAPage() throws Exception {
        String page = "{\"data\":[{\"id\":\"a\"}],\"meta\":{\"totalPages\":3}}";
        try (TopicServer server = new TopicServer(page, page)) {
            server.api().fetchTopics(50);
        }
    }

    private static final class TopicServer implements AutoCloseable {
        final ServerSocket socket;
        final List<String> requests = new ArrayList<>();
        final CompletableFuture<Void> completed;

        TopicServer(String... pages) throws IOException {
            socket = new ServerSocket(0, 1, java.net.InetAddress.getLoopbackAddress());
            socket.setSoTimeout(5000);
            completed = CompletableFuture.runAsync(() -> {
                try {
                    for (String page : pages) {
                        try (Socket client = socket.accept()) {
                            BufferedReader reader = new BufferedReader(new InputStreamReader(
                                client.getInputStream(), StandardCharsets.UTF_8));
                            requests.add(reader.readLine());
                            while (!reader.readLine().isEmpty()) { }
                            byte[] body = page.getBytes(StandardCharsets.UTF_8);
                            String headers = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n"
                                + "Connection: close\r\nContent-Length: " + body.length + "\r\n\r\n";
                            client.getOutputStream().write(headers.getBytes(StandardCharsets.UTF_8));
                            client.getOutputStream().write(body);
                        }
                    }
                } catch (IOException error) { throw new RuntimeException(error); }
            });
        }

        ChatBackgroundSyncApi api() {
            return new ChatBackgroundSyncApi(new ChatBackgroundSyncStore.Session(
                "fixture-token", "fixture-user", "http://127.0.0.1:" + socket.getLocalPort()), 2000, 2000);
        }

        public void close() throws IOException { socket.close(); }
    }

    @Test(expected = IOException.class)
    public void doesNotTreatTextResponseAsAFreshEmptyChat() throws IOException {
        ChatBackgroundSyncApi.requireRows("temporary maintenance");
    }

    @Test(expected = IOException.class)
    public void doesNotTreatMissingResponseAsAFreshEmptyChat() throws IOException {
        ChatBackgroundSyncApi.requireRows(null);
    }

    @Test
    public void retriesOnlyTransientHttpFailures() {
        assertTrue(apiError(408).isRetryable());
        assertTrue(apiError(429).isRetryable());
        assertTrue(apiError(500).isRetryable());
        assertTrue(apiError(503).isRetryable());

        assertFalse(apiError(400).isRetryable());
        assertFalse(apiError(401).isRetryable());
        assertFalse(apiError(403).isRetryable());
        assertFalse(apiError(404).isRetryable());
    }

    private ChatBackgroundSyncApi.ApiException apiError(int statusCode) {
        return new ChatBackgroundSyncApi.ApiException(statusCode, "test");
    }
}
