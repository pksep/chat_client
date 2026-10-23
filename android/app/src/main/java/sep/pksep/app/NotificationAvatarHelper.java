package sep.pksep.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.LruCache;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import sep.pksep.app.sync.ChatBackgroundSyncStore;

final class NotificationAvatarHelper {
    static final String AVATAR = "chatSenderAvatarUrl";
    static final String REQUEST = "chatAvatarRequest";
    private static final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static final LruCache<String, Bitmap> cache = new LruCache<>(40);

    private NotificationAvatarHelper() {}

    private static String cacheKey(String path, ChatBackgroundSyncStore.Session session) {
        return session.apiUrl + "\n" + session.userId + "\n" + path;
    }

    static IconCompat cached(Context context, String path) {
        return cached(path, ChatBackgroundSyncStore.getSession(context));
    }

    private static IconCompat cached(String path, ChatBackgroundSyncStore.Session session) {
        Bitmap bitmap = path == null ? null : cache.get(cacheKey(path, session));
        return bitmap == null ? null : IconCompat.createWithBitmap(bitmap);
    }

    static URL resolveUrl(String path, String apiUrl) throws Exception {
        if (path == null || path.trim().isEmpty()) return null;
        URL api = new URL(apiUrl.replaceAll("/+$", "") + "/");
        URL target = path.startsWith("https://") || path.startsWith("http://")
            ? new URL(path) : path.startsWith("/api/") ? new URL(api, path)
            : new URL(api, path.startsWith("/media/object/") ? path.substring(1)
                : "media/object/" + path.replaceAll("^/+", ""));
        if (target.getUserInfo() != null ||
            !("https".equals(target.getProtocol()) || sameOrigin(api, target))) return null;
        return target;
    }

    private static boolean sameOrigin(URL left, URL right) {
        return left.getProtocol().equals(right.getProtocol()) && left.getHost().equals(right.getHost())
            && (left.getPort() == -1 ? left.getDefaultPort() : left.getPort())
                == (right.getPort() == -1 ? right.getDefaultPort() : right.getPort());
    }

    private static Bitmap load(String path, ChatBackgroundSyncStore.Session session) {
        if (path == null || path.isEmpty()) return null;
        Bitmap known = cache.get(cacheKey(path, session));
        if (known != null) return known;
        HttpURLConnection connection = null;
        try {
            URL target = resolveUrl(path, session.apiUrl);
            if (target == null) return null;
            connection = (HttpURLConnection) target.openConnection();
            connection.setConnectTimeout(2500);
            connection.setReadTimeout(2500);
            connection.setInstanceFollowRedirects(false);
            if (sameOrigin(new URL(session.apiUrl), target))
                connection.setRequestProperty("Authorization", "Bearer " + session.token);
            if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > 2 * 1024 * 1024)
                return null;
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] chunk = new byte[8192];
                int count;
                while ((count = input.read(chunk)) != -1) {
                    if (output.size() + count > 2 * 1024 * 1024) return null;
                    output.write(chunk, 0, count);
                }
            }
            byte[] bytes = output.toByteArray();
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (options.outWidth <= 0 || options.outHeight <= 0) return null;
            options.inSampleSize = 1;
            while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > 256)
                options.inSampleSize *= 2;
            options.inJustDecodeBounds = false;
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
            if (bitmap != null) cache.put(cacheKey(path, session), bitmap);
            return bitmap;
        } catch (Exception ignored) {
            // Уведомление уже показано: при недоступном фото остаются инициалы.
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    static Future<?> update(Context context, String topicId, int notificationId, int request, Notification original) {
        Context app = context.getApplicationContext();
        ChatBackgroundSyncStore.Session session = ChatBackgroundSyncStore.getSession(app);
        if (!session.isValid()) return null;
        NotificationCompat.MessagingStyle style = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(original);
        if (style == null || style.getMessages().stream().noneMatch(message -> !message.getExtras().getString(AVATAR, "").isEmpty())) return null;
        return worker.submit(() -> {
            NotificationManager beforeLoad = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
            if (beforeLoad == null || java.util.Arrays.stream(beforeLoad.getActiveNotifications()).noneMatch(active ->
                active.getId() == notificationId && topicId.equals(active.getTag()) &&
                active.getNotification().extras.getInt(REQUEST) == request)) return;
            boolean loaded = false;
            for (NotificationCompat.MessagingStyle.Message message : style.getMessages())
                loaded |= load(message.getExtras().getString(AVATAR, ""), session) != null;
            if (!loaded) return;
            synchronized (ChatNotificationHelper.class) {
                ChatBackgroundSyncStore.runForSession(app, session, () -> {
                    if (MainActivity.isAppInForeground()) return;
                    NotificationManager manager = (NotificationManager) app.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (manager == null) return;
                    for (android.service.notification.StatusBarNotification active : manager.getActiveNotifications()) {
                        Notification current = active.getNotification();
                        if (active.getId() != notificationId || !topicId.equals(active.getTag()) || current.extras.getInt(REQUEST) != request) continue;
                        NotificationCompat.MessagingStyle updated = new NotificationCompat.MessagingStyle(style.getUser())
                            .setGroupConversation(style.isGroupConversation()).setConversationTitle(style.getConversationTitle());
                        for (NotificationCompat.MessagingStyle.Message message : style.getMessages()) {
                            Person person = message.getPerson();
                            IconCompat icon = cached(message.getExtras().getString(AVATAR), session);
                            if (person != null && icon != null) person = person.toBuilder().setIcon(icon).build();
                            NotificationCompat.MessagingStyle.Message copy = new NotificationCompat.MessagingStyle.Message(message.getText(), message.getTimestamp(), person);
                            copy.getExtras().putAll(message.getExtras());
                            if (message.getDataMimeType() != null) copy.setData(message.getDataMimeType(), message.getDataUri());
                            updated.addMessage(copy);
                        }
                        NotificationCompat.Builder builder = new NotificationCompat.Builder(app, current)
                            .setStyle(updated).setOnlyAlertOnce(true).setSilent(true);
                        manager.notify(topicId, notificationId, NotificationBrandIconHelper.build(app, builder));
                    }
                });
            }
        });
    }
}
