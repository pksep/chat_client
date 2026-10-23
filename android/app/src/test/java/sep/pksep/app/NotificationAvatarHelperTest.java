package sep.pksep.app;

import static org.junit.Assert.*;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.graphics.Bitmap;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.ByteArrayOutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import sep.pksep.app.sync.ChatBackgroundSyncStore;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = {28, 35}, manifest = Config.NONE, application = Application.class)
public class NotificationAvatarHelperTest {
    @Test public void relativeAvatarsUseMediaApiAndExternalHttpIsRejected() throws Exception {
        String expected = "https://chat.example/api/media/object/avatars/photo.webp";
        for (String path : new String[] {"avatars/photo.webp", "/media/object/avatars/photo.webp", "/api/media/object/avatars/photo.webp"})
            assertEquals(expected, NotificationAvatarHelper.resolveUrl(path, "https://chat.example/api").toString());
        assertEquals("https://cdn.example/photo.png", NotificationAvatarHelper.resolveUrl("https://cdn.example/photo.png", "https://chat.example/api").toString());
        assertNull(NotificationAvatarHelper.resolveUrl("http://other.example/photo.png", "https://chat.example/api"));
        assertNull(NotificationAvatarHelper.resolveUrl("https://user:secret@other.example/photo.png", "https://chat.example/api"));
    }

    @Test public void loadsSenderPhotoAndSilentlyUpdatesMessagingStyle() throws Exception {
        Application context = RuntimeEnvironment.getApplication();
        try (PhotoServer server = new PhotoServer()) {
            server.release.countDown();
            saveSession(context, server, "avatar-user");
            Notification notification = notification(context, 7);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            manager.notify("avatar-topic", 0, notification);
            NotificationAvatarHelper.update(context, "avatar-topic", 0, 7, notification).get(5, TimeUnit.SECONDS);
            Notification current = manager.getActiveNotifications()[0].getNotification();
            Person person = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(current).getMessages().get(0).getPerson();
            assertNotNull(person.getIcon());
            assertEquals("sender", person.getKey());
            assertNotEquals(0, current.flags & Notification.FLAG_ONLY_ALERT_ONCE);
            assertEquals(1, current.actions.length);
            assertEquals("Ответить", current.actions[0].title);
            assertEquals("reply", current.actions[0].getRemoteInputs()[0].getResultKey());
            assertEquals("Bearer test-avatar-token", server.authorization.get());
            assertNotNull(NotificationAvatarHelper.cached(context, "avatar.png"));
            saveSession(context, server, "another-user");
            assertNull(NotificationAvatarHelper.cached(context, "avatar.png"));
        }
    }

    @Test public void downloadedPhotoDoesNotResurrectDismissedNotification() throws Exception {
        assertDownloadDoesNotReplaceCurrentNotification(true, false);
    }

    @Test public void downloadedPhotoDoesNotOverwriteNewerNotification() throws Exception {
        assertDownloadDoesNotReplaceCurrentNotification(false, false);
    }

    @Test public void downloadedPhotoDoesNotUpdateAnotherSession() throws Exception {
        assertDownloadDoesNotReplaceCurrentNotification(false, true);
    }

    private void assertDownloadDoesNotReplaceCurrentNotification(boolean dismiss, boolean changeSession) throws Exception {
        Application context = RuntimeEnvironment.getApplication();
        try (PhotoServer server = new PhotoServer()) {
            saveSession(context, server, "avatar-user");
            Notification notification = notification(context, 7);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            manager.notify("avatar-topic", 0, notification);
            java.util.concurrent.Future<?> task = NotificationAvatarHelper.update(context, "avatar-topic", 0, 7, notification);
            assertTrue(server.requested.await(5, TimeUnit.SECONDS));
            if (dismiss) manager.cancel("avatar-topic", 0);
            else if (changeSession) saveSession(context, server, "another-user");
            else manager.notify("avatar-topic", 0, notification(context, 8));
            server.release.countDown();
            task.get(5, TimeUnit.SECONDS);
            if (dismiss) assertEquals(0, manager.getActiveNotifications().length);
            else {
                Notification current = manager.getActiveNotifications()[0].getNotification();
                assertEquals(changeSession ? 7 : 8, current.extras.getInt(NotificationAvatarHelper.REQUEST));
                assertNull(NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(current).getMessages().get(0).getPerson().getIcon());
            }
        }
    }

    private void saveSession(Application context, PhotoServer server, String userId) {
        ChatBackgroundSyncStore.saveSession(context, "test-avatar-token", userId,
            "http://127.0.0.1:" + server.server.getLocalPort() + "/api");
    }

    private Notification notification(Application context, int request) {
        NotificationChannelHelper.ensureDefaultChannel(context);
        NotificationCompat.MessagingStyle.Message message = new NotificationCompat.MessagingStyle.Message(
            "Привет", 123L, new Person.Builder().setName("Давид").setKey("sender").build());
        message.getExtras().putString(NotificationAvatarHelper.AVATAR, "avatar.png");
        Notification notification = new NotificationCompat.Builder(context, NotificationChannelHelper.DEFAULT_CHANNEL_ID)
            .setSmallIcon(R.drawable.notification_statusbar_chat_bubbles_2026)
            .addAction(new NotificationCompat.Action.Builder(0, "Ответить", null)
                .addRemoteInput(new RemoteInput.Builder("reply").build()).build())
            .setStyle(new NotificationCompat.MessagingStyle(new Person.Builder().setName("Вы").build()).addMessage(message)).build();
        notification.extras.putInt(NotificationAvatarHelper.REQUEST, request);
        return notification;
    }

    private static final class PhotoServer implements AutoCloseable {
        final ServerSocket server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
        final AtomicReference<String> authorization = new AtomicReference<>();
        final CountDownLatch requested = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        final Thread responder;

        PhotoServer() throws Exception {
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            Bitmap.createBitmap(32, 32, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.PNG, 100, png);
            responder = new Thread(() -> {
                try (java.net.Socket socket = server.accept()) {
                    socket.setSoTimeout(5000);
                    BufferedReader reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
                    String line;
                    while ((line = reader.readLine()) != null && !line.isEmpty())
                        if (line.startsWith("Authorization: ")) authorization.set(line.substring(15));
                    requested.countDown();
                    if (!release.await(5, TimeUnit.SECONDS)) return;
                    socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nContent-Length: " + png.size() + "\r\nConnection: close\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                    socket.getOutputStream().write(png.toByteArray());
                    socket.getOutputStream().flush();
                } catch (Exception ignored) { }
            });
            responder.start();
        }

        @Override public void close() throws Exception {
            release.countDown();
            server.close();
            responder.join(3000);
        }
    }
}
