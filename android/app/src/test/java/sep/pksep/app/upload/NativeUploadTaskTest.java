package sep.pksep.app.upload;

import org.junit.Test;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.ServerSocket;
import java.net.Socket;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import static org.junit.Assert.*;

public class NativeUploadTaskTest {
    @Test public void completesUploadAndCreatesMessageWithoutAnyWebViewCallback() throws Exception {
        try (Fixture fixture = new Fixture(false)) {
            JSONObject state = fixture.state();
            JSONObject result = NativeUploadTask.run(state, fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
            assertEquals("server-message", result.getString("id"));
            assertEquals(Arrays.asList("target", "put", "complete", "message"), fixture.calls);
            assertArrayEquals(fixture.content, fixture.uploaded);
            assertEquals("same-client-id", fixture.sent.getJSONObject("ex").getString("clientId"));
            assertEquals("<b>Видео</b>", fixture.sent.getString("text"));
            assertEquals("video.webm", fixture.sent.getJSONArray("medias").getJSONObject(0).getString("path"));
            assertNull(fixture.putAuthorization);
        }
    }
    @Test public void lostSendResponseRetriesOnlyIdempotentMessageCreation() throws Exception {
        try (Fixture fixture = new Fixture(true)) {
            JSONObject state = fixture.state();
            final String[] saved = { "" };
            try {
                NativeUploadTask.run(state, fixture.directory, fixture.api(), checkpoint -> saved[0] = checkpoint.toString(), (i, p) -> {});
                fail("Первый ответ должен потеряться");
            } catch (NativeUploadApi.ApiException expected) { assertTrue(expected.retryable()); }
            // Новый процесс восстанавливает только JSON и файлы; JS не участвует.
            JSONObject restored = new JSONObject(saved[0]);
            JSONObject result = NativeUploadTask.run(restored, fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
            assertEquals("server-message", result.getString("id"));
            assertEquals(Arrays.asList("target", "put", "complete", "message", "message"), fixture.calls);
            assertEquals("same-client-id", fixture.sent.getJSONObject("ex").getString("clientId"));
        }
    }
    @Test public void doesNotSendMessageWhenLocalFileIsIncomplete() throws Exception {
        try (Fixture fixture = new Fixture(false)) {
            JSONObject state = fixture.state();
            state.getJSONArray("files").getJSONObject(0).put("size", 99999);
            try {
                NativeUploadTask.run(state, fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
                fail("Неполный локальный файл не должен отправляться");
            } catch (IOException expected) { assertTrue(fixture.calls.isEmpty()); }
        }
    }
    @Test public void streamsLargeVideoInAuthenticatedParts() throws Exception {
        try (Fixture fixture = new Fixture(false, 32 * 1024 * 1024 + 123)) {
            JSONObject result = NativeUploadTask.run(fixture.state(), fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
            assertEquals("server-message", result.getString("id"));
            assertEquals(Arrays.asList("init", "part1", "part2", "part3", "part4", "multipart-complete", "complete", "message"), fixture.calls);
            fixture.assertParts();
            assertEquals(Collections.singleton("Bearer test-token"), new HashSet<>(fixture.partAuthorizations));
        }
    }
    @Test public void resumesLargeVideoFromServerPartsAfterProcessRestart() throws Exception {
        try (Fixture fixture = new Fixture(false, 32 * 1024 * 1024 + 123)) {
            fixture.failPart = 2;
            final String[] saved = { "" };
            try {
                NativeUploadTask.run(fixture.state(), fixture.directory, fixture.api(), checkpoint -> saved[0] = checkpoint.toString(), (i, p) -> {});
                fail("Загрузка второй части должна прерваться");
            } catch (NativeUploadApi.ApiException expected) { assertEquals(503, expected.status); }
            JSONObject result = NativeUploadTask.run(new JSONObject(saved[0]), fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
            assertEquals("server-message", result.getString("id"));
            assertEquals(Arrays.asList("init", "part1", "part2", "status", "part2", "part3", "part4", "multipart-complete", "complete", "message"), fixture.calls);
            fixture.assertParts();
        }
    }
    @Test public void expiredMultipartPartClearsSessionForNextAttempt() throws Exception {
        try (Fixture fixture = new Fixture(false, 32 * 1024 * 1024 + 123)) {
            fixture.failPart = 1; fixture.failPartStatus = 410;
            JSONObject state = fixture.state();
            try {
                NativeUploadTask.run(state, fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
                fail("Истёкшая сессия должна быть сброшена");
            } catch (IOException expected) {
                assertFalse(state.getJSONArray("files").getJSONObject(0).has("multipartId"));
            }
            JSONObject result = NativeUploadTask.run(state, fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
            assertEquals("server-message", result.getString("id"));
            assertEquals(2, Collections.frequency(fixture.calls, "init"));
            fixture.assertParts();
        }
    }
    @Test public void expiredSignedUrlGetsNewTargetWithoutFinalizingFailedUpload() throws Exception {
        try (Fixture fixture = new Fixture(false)) {
            fixture.failPutStatus = 403;
            JSONObject state = fixture.state();
            try {
                NativeUploadTask.run(state, fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
                fail("Истёкшая ссылка должна быть сброшена");
            } catch (IOException expected) {
                assertFalse(state.getJSONArray("files").getJSONObject(0).has("target"));
            }
            NativeUploadTask.run(new JSONObject(state.toString()), fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
            assertEquals(Arrays.asList("target", "put", "target", "put", "complete", "message"), fixture.calls);
            assertArrayEquals(fixture.content, fixture.uploaded);
        }
    }
    @Test public void failedFinalizationDoesNotRepeatUploadedBytes() throws Exception {
        try (Fixture fixture = new Fixture(false)) {
            fixture.failFinalize = true;
            JSONObject state = fixture.state();
            try {
                NativeUploadTask.run(state, fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
                fail("Первая финализация должна завершиться ошибкой");
            } catch (NativeUploadApi.ApiException expected) { assertEquals(503, expected.status); }
            NativeUploadTask.run(new JSONObject(state.toString()), fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
            assertEquals(Arrays.asList("target", "put", "complete", "complete", "message"), fixture.calls);
        }
    }
    @Test public void disconnectedMessageResponseOnlyRetriesMessagePost() throws Exception {
        try (Fixture fixture = new Fixture(false)) {
            fixture.disconnectMessage = true;
            JSONObject state = fixture.state();
            try {
                NativeUploadTask.run(state, fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
                fail("Оборванный ответ должен вызвать повтор");
            } catch (IOException expected) { }
            NativeUploadTask.run(new JSONObject(state.toString()), fixture.directory, fixture.api(), ignored -> {}, (i, p) -> {});
            assertEquals(Arrays.asList("target", "put", "complete", "message", "message"), fixture.calls);
            assertEquals("same-client-id", fixture.sent.getJSONObject("ex").getString("clientId"));
        }
    }
    private static final class Fixture implements AutoCloseable {
        final File directory = Files.createTempDirectory("native-upload-test").toFile();
        final byte[] content;
        final int chunkSize = 10 * 1024 * 1024;
        final Map<Integer, byte[]> parts = new TreeMap<>();
        final List<String> partAuthorizations = new ArrayList<>();
        final ServerSocket server = new ServerSocket(0);
        final Thread worker;
        final List<String> calls = new ArrayList<>();
        boolean failSend; boolean failFinalize; boolean disconnectMessage; int failPutStatus; int failPart; int failPartStatus = 503;
        byte[] uploaded; JSONObject sent; String putAuthorization;
        Fixture(boolean failSend) throws Exception { this(failSend, 700000); }
        Fixture(boolean failSend, int size) throws Exception {
            content = new byte[size];
            this.failSend = failSend;
            new Random(42).nextBytes(content); Files.write(new File(directory, "0.bin").toPath(), content);
            worker = new Thread(() -> {
              while (!server.isClosed()) {
                try (Socket socket = server.accept()) {
                    InputStream input = socket.getInputStream();
                    ByteArrayOutputStream header = new ByteArrayOutputStream();
                    int matched = 0; byte[] end = { 13, 10, 13, 10 };
                    for (int value; matched < 4 && (value = input.read()) != -1;) {
                        header.write(value); matched = value == end[matched] ? matched + 1 : 0;
                    }
                    String[] headers = header.toString("UTF-8").split("\r\n");
                    String path = headers[0].split(" ")[1]; int length = 0; String authorization = null;
                    for (String line : headers) {
                        if (line.toLowerCase(Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.split(":", 2)[1].trim());
                        if (line.toLowerCase(Locale.ROOT).startsWith("authorization:")) authorization = line.split(":", 2)[1].trim();
                    }
                    byte[] request = input.readNBytes(length);
                    JSONObject response = new JSONObject(); int status = 200;
                    if (path.equals("/media/multipart/init") || path.equals("/media/multipart/session/status")) {
                        calls.add(path.endsWith("init") ? "init" : "status");
                        JSONArray uploadedParts = new JSONArray();
                        for (Integer number : parts.keySet()) uploadedParts.put(new JSONObject().put("partNumber", number));
                        response.put("uploadId", "session").put("objectName", "original.mp4")
                            .put("chunkSize", chunkSize).put("partCount", (content.length + chunkSize - 1) / chunkSize)
                            .put("status", "active").put("uploadedParts", uploadedParts);
                    } else if (path.startsWith("/media/multipart/session/parts/")) {
                        int number = Integer.parseInt(path.substring(path.lastIndexOf('/') + 1));
                        calls.add("part" + number); partAuthorizations.add(authorization);
                        if (failPart == number) { failPart = 0; status = failPartStatus; }
                        else parts.put(number, request);
                    } else if (path.equals("/media/multipart/session/complete")) {
                        calls.add("multipart-complete"); response.put("objectName", "original.mp4");
                    } else if (path.equals("/media/upload-target")) {
                        calls.add("target"); response.put("objectName", "original.mp4").put("uploadUrl", base() + "/put");
                    } else if (path.equals("/put")) {
                        calls.add("put"); uploaded = request; putAuthorization = authorization;
                        if (failPutStatus != 0) { status = failPutStatus; failPutStatus = 0; }
                    } else if (path.equals("/media/upload")) {
                        calls.add("complete"); response.put("objectName", "video.webm").put("thumbnailObjectName", "thumb.webp").put("ex", new JSONObject());
                        if (failFinalize) { failFinalize = false; status = 503; }
                    } else if (path.equals("/messages/native-upload")) {
                        calls.add("message"); sent = new JSONObject(new String(request, StandardCharsets.UTF_8));
                        response.put("id", "server-message"); if (this.failSend) { this.failSend = false; status = 503; }
                        if (disconnectMessage) { disconnectMessage = false; continue; }
                    } else status = 404;
                    byte[] bytes = response.toString().getBytes(StandardCharsets.UTF_8);
                    OutputStream out = socket.getOutputStream();
                    out.write(("HTTP/1.1 " + status + " Test\r\nConnection: close\r\nContent-Length: " + bytes.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    out.write(bytes); out.flush();
                } catch (Exception error) { if (!server.isClosed()) throw new RuntimeException(error); }
              }
            }); worker.start();
        }
        String base() { return "http://127.0.0.1:" + server.getLocalPort(); }
        NativeUploadApi api() { return new NativeUploadApi(base(), () -> "test-token"); }
        void assertParts() {
            assertEquals((content.length + chunkSize - 1) / chunkSize, parts.size());
            for (Map.Entry<Integer, byte[]> part : parts.entrySet()) {
                int offset = (part.getKey() - 1) * chunkSize;
                assertArrayEquals(Arrays.copyOfRange(content, offset, Math.min(content.length, offset + chunkSize)), part.getValue());
            }
        }
        JSONObject state() throws Exception {
            return new JSONObject().put("traceId", "test-trace")
                .put("message", new JSONObject().put("topicId", "test-topic").put("text", "<b>Видео</b>")
                    .put("ex", new JSONObject().put("clientId", "same-client-id")))
                .put("files", new JSONArray().put(new JSONObject().put("originName", "video.mp4")
                    .put("contentType", "video/mp4").put("size", content.length).put("type", "VIDEO").put("isMedia", true)));
        }
        public void close() throws Exception {
            server.close(); worker.join(3000); new File(directory, "0.bin").delete(); directory.delete();
        }
    }
}
