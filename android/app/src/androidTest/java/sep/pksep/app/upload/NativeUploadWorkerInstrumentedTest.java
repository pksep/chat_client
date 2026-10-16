package sep.pksep.app.upload;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.work.WorkInfo;
import androidx.work.WorkManager;
import androidx.lifecycle.Lifecycle;
import java.io.*;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import sep.pksep.app.MediaRegressionActivity;
import sep.pksep.app.sync.ChatBackgroundSyncStore;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativeUploadWorkerInstrumentedTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test public void completesAfterActivityGoesToBackground() throws Exception {
        try (ActivityScenario<MediaRegressionActivity> activity = ActivityScenario.launch(MediaRegressionActivity.class);
             Fixture fixture = new Fixture()) {
            fixture.enqueue();
            assertTrue("Worker должен начать PUT", fixture.putStarted.await(20, TimeUnit.SECONDS));
            NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            assertTrue("У загрузки должно быть foreground-уведомление", notifications.getActiveNotifications().length > 0);
            backgroundActivity(activity);
            fixture.allowPut.countDown();
            assertEquals(WorkInfo.State.SUCCEEDED, fixture.awaitFinished());
            assertEquals("completed", NativeUploadStore.read(context, fixture.id).getString("status"));
            assertEquals(Arrays.asList("target", "put", "complete", "message"), fixture.calls);
            assertArrayEquals(fixture.content, fixture.uploaded);
            assertEquals(fixture.id, fixture.sent.getJSONObject("ex").getString("clientId"));
            assertFalse("Копия после отправки должна удалиться", new File(fixture.directory, "0.bin").exists());
        }
    }

    @Test public void startsQueuedUploadWhenActivityIsAlreadyInBackground() throws Exception {
        try (ActivityScenario<MediaRegressionActivity> activity = ActivityScenario.launch(MediaRegressionActivity.class);
             Fixture fixture = new Fixture()) {
            backgroundActivity(activity);
            Thread.sleep(11000);
            fixture.enqueue();
            assertTrue("Очередь должна стартовать и без видимого Activity", fixture.putStarted.await(20, TimeUnit.SECONDS));
            fixture.allowPut.countDown();
            assertEquals(WorkInfo.State.SUCCEEDED, fixture.awaitFinished());
            assertEquals(Arrays.asList("target", "put", "complete", "message"), fixture.calls);
        }
    }

    @Test public void cancellationDuringPutPreventsMessageCreation() throws Exception {
        try (ActivityScenario<MediaRegressionActivity> activity = ActivityScenario.launch(MediaRegressionActivity.class);
             Fixture fixture = new Fixture()) {
            fixture.enqueue();
            assertTrue(fixture.putStarted.await(20, TimeUnit.SECONDS));
            JSONObject state = NativeUploadStore.read(context, fixture.id);
            state.put("status", "cancelled");
            NativeUploadStore.save(context, fixture.id, state);
            WorkManager.getInstance(context).cancelUniqueWork("message-upload-" + fixture.id).getResult().get();
            fixture.allowPut.countDown();
            assertEquals(WorkInfo.State.CANCELLED, fixture.awaitFinished());
            assertTrue(fixture.putFinished.await(5, TimeUnit.SECONDS));
            Thread.sleep(500);
            assertEquals(Arrays.asList("target", "put"), fixture.calls);
            assertEquals("cancelled", NativeUploadStore.read(context, fixture.id).getString("status"));
        }
    }

    @Test public void logoutDuringPutPreventsMessageCreation() throws Exception {
        assertSessionChangeStopsUpload(false);
    }

    @Test public void switchingAccountDuringPutPreventsMessageCreation() throws Exception {
        assertSessionChangeStopsUpload(true);
    }

    @Test public void staleCheckpointCannotResurrectCancelledJob() throws Exception {
        try (Fixture fixture = new Fixture()) {
            JSONObject old = NativeUploadStore.read(context, fixture.id);
            JSONObject cancelled = new JSONObject(old.toString()).put("status", "cancelled");
            NativeUploadStore.save(context, fixture.id, cancelled);
            try {
                NativeUploadStore.saveActive(context, fixture.id, old.put("status", "uploading"));
                fail("Старая контрольная точка не должна отменять отмену пользователя");
            } catch (java.util.concurrent.CancellationException expected) { }
            assertEquals("cancelled", NativeUploadStore.read(context, fixture.id).getString("status"));
        }
    }

    private void assertSessionChangeStopsUpload(boolean switchAccount) throws Exception {
        try (ActivityScenario<MediaRegressionActivity> activity = ActivityScenario.launch(MediaRegressionActivity.class);
             Fixture fixture = new Fixture()) {
            fixture.enqueue();
            assertTrue(fixture.putStarted.await(20, TimeUnit.SECONDS));
            if (switchAccount) ChatBackgroundSyncStore.saveSession(context, "other-test-token", "other-user", fixture.base());
            else ChatBackgroundSyncStore.clearSession(context);
            fixture.allowPut.countDown();
            assertEquals(WorkInfo.State.FAILED, fixture.awaitFinished());
            assertEquals(Arrays.asList("target", "put"), fixture.calls);
            assertEquals("failed", NativeUploadStore.read(context, fixture.id).getString("status"));
        }
    }

    private void backgroundActivity(ActivityScenario<?> activity) throws Exception {
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(home);
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        long deadline = System.currentTimeMillis() + 10000;
        while (activity.getState() != Lifecycle.State.CREATED && System.currentTimeMillis() < deadline) Thread.sleep(50);
        assertEquals("Экран должен полностью перейти в onStop", Lifecycle.State.CREATED, activity.getState());
    }

    private final class Fixture implements AutoCloseable {
        final String id = UUID.randomUUID().toString();
        final File directory = NativeUploadStore.directory(context, id);
        final byte[] content = new byte[1024 * 1024 + 123];
        final ServerSocket server = new ServerSocket(0, 5, java.net.InetAddress.getByName("127.0.0.1"));
        final List<String> calls = Collections.synchronizedList(new ArrayList<>());
        final CountDownLatch putStarted = new CountDownLatch(1);
        final CountDownLatch allowPut = new CountDownLatch(1);
        final CountDownLatch putFinished = new CountDownLatch(1);
        final Thread serverThread;
        volatile byte[] uploaded;
        volatile JSONObject sent;
        volatile Throwable serverError;

        Fixture() throws Exception {
            new Random(42).nextBytes(content);
            Files.write(new File(directory, "0.bin").toPath(), content);
            JSONObject state = new JSONObject().put("id", id).put("userId", "test-user").put("apiUrl", base())
                .put("traceId", "test-trace").put("status", "queued")
                .put("message", new JSONObject().put("topicId", "test-topic").put("text", "Видео в фоне")
                    .put("ex", new JSONObject().put("clientId", id)))
                .put("files", new JSONArray().put(new JSONObject().put("originName", "test.mp4")
                    .put("contentType", "video/mp4").put("size", content.length).put("type", "VIDEO").put("isMedia", true)));
            NativeUploadStore.save(context, id, state);
            ChatBackgroundSyncStore.saveSession(context, "test-token", "test-user", base());
            serverThread = new Thread(this::serve, "media-test-http");
            serverThread.start();
        }

        String base() { return "http://127.0.0.1:" + server.getLocalPort(); }
        void enqueue() throws Exception { NativeUploadWorker.enqueue(context, id); }

        WorkInfo.State awaitFinished() throws Exception {
            long deadline = System.currentTimeMillis() + 30000;
            while (System.currentTimeMillis() < deadline) {
                List<WorkInfo> infos = WorkManager.getInstance(context).getWorkInfosForUniqueWork("message-upload-" + id).get();
                if (!infos.isEmpty() && infos.get(0).getState().isFinished()) {
                    assertNull("Ошибка локального HTTP-сервера", serverError);
                    return infos.get(0).getState();
                }
                Thread.sleep(100);
            }
            throw new AssertionError("Worker не завершился: " + NativeUploadStore.read(context, id));
        }

        void serve() {
            while (!server.isClosed()) {
                try (Socket socket = server.accept()) {
                    socket.setSoTimeout(20000);
                    InputStream input = socket.getInputStream();
                    ByteArrayOutputStream header = new ByteArrayOutputStream();
                    byte[] end = {13, 10, 13, 10}; int matched = 0;
                    for (int value; matched < 4 && (value = input.read()) != -1;) {
                        header.write(value); matched = value == end[matched] ? matched + 1 : 0;
                    }
                    String[] headers = header.toString("UTF-8").split("\r\n");
                    String path = headers[0].split(" ")[1]; int length = 0;
                    for (String line : headers) if (line.toLowerCase(Locale.ROOT).startsWith("content-length:"))
                        length = Integer.parseInt(line.split(":", 2)[1].trim());
                    byte[] request = new byte[length]; int offset = 0;
                    while (offset < length) {
                        int read = input.read(request, offset, length - offset);
                        if (read < 0) throw new EOFException();
                        offset += read;
                    }
                    JSONObject response = new JSONObject();
                    if (path.equals("/media/upload-target")) {
                        calls.add("target"); response.put("objectName", "test.mp4").put("uploadUrl", base() + "/put");
                    } else if (path.equals("/put")) {
                        calls.add("put"); uploaded = request; putStarted.countDown();
                        if (!allowPut.await(20, TimeUnit.SECONDS)) throw new IOException("Тест не разрешил завершение PUT");
                    } else if (path.equals("/media/upload")) {
                        calls.add("complete"); response.put("objectName", "test.mp4").put("ex", new JSONObject());
                    } else if (path.equals("/messages/native-upload")) {
                        calls.add("message"); sent = new JSONObject(new String(request, StandardCharsets.UTF_8));
                        response.put("id", "server-message");
                    } else throw new IOException("Неожиданный тестовый маршрут " + path);
                    byte[] bytes = response.toString().getBytes(StandardCharsets.UTF_8);
                    OutputStream output = socket.getOutputStream();
                    output.write(("HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: " + bytes.length + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
                    output.write(bytes); output.flush();
                    if (path.equals("/put")) putFinished.countDown();
                } catch (Exception error) { if (!server.isClosed()) { serverError = error; putStarted.countDown(); putFinished.countDown(); } }
            }
        }

        @Override public void close() throws Exception {
            allowPut.countDown();
            WorkManager.getInstance(context).cancelUniqueWork("message-upload-" + id).getResult().get();
            server.close(); serverThread.join(3000);
            ChatBackgroundSyncStore.clearSession(context);
            File[] files = directory.listFiles();
            if (files != null) for (File file : files) file.delete();
            directory.delete();
        }
    }
}
