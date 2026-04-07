package sep.pksep.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.BridgeActivity;

import sep.pksep.app.plugins.AudioOutputPlugin;
import sep.pksep.app.plugins.CallScreenPlugin;
import sep.pksep.app.plugins.NotificationTapPlugin;
import sep.pksep.app.plugins.ProximityLockPlugin;

public class MainActivity extends BridgeActivity {
    private static final String EXTRA_ACTION = "action";
    private static final String EXTRA_CALL_ACTION = "callAction";
    private static final String EXTRA_GOOGLE_MESSAGE_ID = "google.message_id";
    private static final String EXTRA_ROOM_ID = "roomId";
    private static final String EXTRA_TOPIC_ID = "topicId";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AudioOutputPlugin.class);
        registerPlugin(ProximityLockPlugin.class);
        registerPlugin(CallScreenPlugin.class);
        registerPlugin(NotificationTapPlugin.class);

        super.onCreate(savedInstanceState);
        handleCallIntent(getIntent());
        handleNotificationLaunchIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallIntent(intent);
        handleNotificationLaunchIntent(intent);
    }

    private void handleNotificationLaunchIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        Bundle extras = intent.getExtras();
        if (extras == null || !extras.containsKey(EXTRA_GOOGLE_MESSAGE_ID)) {
            return;
        }

        JSObject payload = new JSObject();

        for (String key : extras.keySet()) {
            Object value = extras.get(key);
            if (value != null) {
                payload.put(key, value.toString());
            }
        }

        Uri data = intent.getData();
        if (data != null) {
            payload.put("url", data.toString());
        }

        NotificationTapPlugin.dispatchNotificationTap(payload);
    }

    private void handleCallIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        Uri data = intent.getData();
        String action = normalizeAction(
            firstNonEmpty(
                intent.getStringExtra(EXTRA_CALL_ACTION),
                intent.getStringExtra(EXTRA_ACTION),
                data != null ? data.getQueryParameter(EXTRA_CALL_ACTION) : null,
                data != null ? data.getQueryParameter(EXTRA_ACTION) : null,
                data != null ? data.getLastPathSegment() : null
            )
        );

        if (action == null) {
            return;
        }

        String roomId = firstNonEmpty(
            intent.getStringExtra(EXTRA_ROOM_ID),
            data != null ? data.getQueryParameter(EXTRA_ROOM_ID) : null
        );
        String topicId = firstNonEmpty(
            intent.getStringExtra(EXTRA_TOPIC_ID),
            data != null ? data.getQueryParameter(EXTRA_TOPIC_ID) : null
        );

        CallScreenPlugin.dispatchCallAction(action, roomId, topicId);
        intent.removeExtra(EXTRA_CALL_ACTION);
        intent.removeExtra(EXTRA_ACTION);
    }

    private String normalizeAction(String action) {
        if (action == null) {
            return null;
        }

        String normalized = action.toLowerCase();
        if (normalized.contains("accept") || normalized.contains("answer")) {
            return "accept";
        }

        if (
            normalized.contains("decline") ||
            normalized.contains("reject") ||
            normalized.contains("end")
        ) {
            return "decline";
        }

        return null;
    }

    private String firstNonEmpty(String... values) {
        if (values == null) {
            return null;
        }

        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value;
            }
        }

        return null;
    }
}
