package sep.pksep.app;

import android.app.Application;
import android.content.Context;

/** Stores the topic that a notification entry point will open. */
public class ChatApplication extends Application {
    private static final String STARTUP_PREFS = "chat_startup_launch";
    private static final String PREF_NOTIFICATION_TOPIC_ID =
        "notification_topic_id";

    static void rememberNotificationTopic(Context context, String topicId) {
        if (context == null || topicId == null || topicId.trim().isEmpty()) return;
        context.getSharedPreferences(STARTUP_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_NOTIFICATION_TOPIC_ID, topicId.trim())
            .commit();
    }
}
