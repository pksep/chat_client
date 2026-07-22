package sep.pksep.app;

import android.app.NotificationManager;
import android.content.Context;

public final class ChatNotificationDismissalHelper {
    private ChatNotificationDismissalHelper() {}

    public static void dismissTopicNotification(Context context, String topicId) {
        if (context == null || topicId == null || topicId.trim().isEmpty()) {
            return;
        }

        NotificationManager notificationManager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);

        if (notificationManager != null) {
            notificationManager.cancel(topicId.trim(), 0);
        }
    }
}
