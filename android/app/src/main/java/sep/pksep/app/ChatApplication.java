package sep.pksep.app;

import android.app.Application;
import android.content.Context;

import java.util.Arrays;
import java.util.List;

import ru.ok.tracer.CoreTracerConfiguration;
import ru.ok.tracer.HasTracerConfiguration;
import ru.ok.tracer.TracerConfiguration;
import ru.ok.tracer.crash.report.CrashFreeConfiguration;
import ru.ok.tracer.crash.report.CrashReportConfiguration;

/** Stores the topic that a notification entry point will open. */
public class ChatApplication extends Application implements HasTracerConfiguration {
    private static final String STARTUP_PREFS = "chat_startup_launch";
    private static final String PREF_NOTIFICATION_TOPIC_ID =
        "notification_topic_id";

    @Override public void onCreate() {
        super.onCreate();
        sep.pksep.app.sync.ChatNotificationRecoveryScheduler.start(this);
    }

    @Override
    public List<TracerConfiguration> getTracerConfiguration() {
        return Arrays.asList(
            new CoreTracerConfiguration.Builder()
                .setDebugUpload(false)
                .build(),
            new CrashReportConfiguration.Builder()
                .setEnabled(true)
                .setNativeEnabled(true)
                .setSendAnr(true)
                .build(),
            new CrashFreeConfiguration.Builder()
                .setEnabled(true)
                .build()
        );
    }

    static void rememberNotificationTopic(Context context, String topicId) {
        if (context == null || topicId == null || topicId.trim().isEmpty()) return;
        context.getSharedPreferences(STARTUP_PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(PREF_NOTIFICATION_TOPIC_ID, topicId.trim())
            .commit();
    }
}
