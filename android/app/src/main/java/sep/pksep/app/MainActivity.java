package sep.pksep.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.BridgeActivity;

import java.io.File;

import sep.pksep.app.plugins.AudioOutputPlugin;
import sep.pksep.app.plugins.CallScreenPlugin;
import sep.pksep.app.plugins.NotificationTapPlugin;
import sep.pksep.app.plugins.ProximityLockPlugin;

@SuppressWarnings("deprecation")
public class MainActivity extends BridgeActivity {
    private static final String EXTRA_ACTION = "action";
    private static final String EXTRA_CALL_ACTION = "callAction";
    private static final String EXTRA_GOOGLE_MESSAGE_ID = "google.message_id";
    private static final String EXTRA_ROOM_ID = "roomId";
    private static final String EXTRA_TOPIC_ID = "topicId";
    private static final String EXTRA_TYPE = "type";
    private boolean launchedFromIncomingCall = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        launchedFromIncomingCall = isIncomingCallIntent(getIntent());
        NotificationChannelHelper.ensureDefaultChannel(this);
        registerPlugin(AudioOutputPlugin.class);
        registerPlugin(ProximityLockPlugin.class);
        registerPlugin(CallScreenPlugin.class);
        registerPlugin(NotificationTapPlugin.class);

        super.onCreate(savedInstanceState);
        configureIncomingCallWindow(getIntent());
        handleCallIntent(getIntent());
        handleNotificationLaunchIntent(getIntent());
    }

    @Override
    protected void load() {
        if (!launchedFromIncomingCall) {
            clearWebViewCacheBeforeLoad();
        }
        super.load();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        launchedFromIncomingCall = isIncomingCallIntent(intent);
        configureIncomingCallWindow(intent);
        handleCallIntent(intent);
        handleNotificationLaunchIntent(intent);
    }

    private void handleNotificationLaunchIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        Bundle extras = intent.getExtras();
        if (extras == null) {
            return;
        }

        boolean isGoogleNotification = extras.containsKey(EXTRA_GOOGLE_MESSAGE_ID);
        boolean isIncomingCallNotification =
            "incoming_call".equals(extras.getString(EXTRA_TYPE)) &&
            extras.containsKey(EXTRA_ROOM_ID);

        if (!isGoogleNotification && !isIncomingCallNotification) {
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

    private void configureIncomingCallWindow(Intent intent) {
        setIncomingCallWindowEnabled(isIncomingCallIntent(intent));
    }

    private boolean isIncomingCallIntent(Intent intent) {
        if (intent == null) {
            return false;
        }

        if ("incoming_call".equals(intent.getStringExtra(EXTRA_TYPE))) {
            return true;
        }

        Uri data = intent.getData();
        return data != null && "incoming_call".equals(data.getQueryParameter(EXTRA_TYPE));
    }

    public void setIncomingCallWindowEnabled(boolean enabled) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(enabled);
            setTurnScreenOn(enabled);
        }

        if (enabled) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
                getWindow().clearFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                        | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                );
            }
            return;
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }

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

    private void clearWebViewCacheBeforeLoad() {
        clearDirectoryContents(getCacheDir());
        clearDirectoryContents(getCodeCacheDir());

        File appWebViewDir = new File(getApplicationInfo().dataDir, "app_webview");

        clearDirectoryContents(new File(appWebViewDir, "Cache"));
        clearDirectoryContents(new File(appWebViewDir, "Code Cache"));
        clearDirectoryContents(new File(appWebViewDir, "GPUCache"));
        clearDirectoryContents(new File(appWebViewDir, "blob_storage"));
        clearDirectoryContents(new File(appWebViewDir, "Service Worker"));

        File defaultDir = new File(appWebViewDir, "Default");

        clearDirectoryContents(new File(defaultDir, "Cache"));
        clearDirectoryContents(new File(defaultDir, "Code Cache"));
        clearDirectoryContents(new File(defaultDir, "GPUCache"));
        clearDirectoryContents(new File(defaultDir, "blob_storage"));
        clearDirectoryContents(new File(defaultDir, "Service Worker"));
    }

    private void clearDirectoryContents(File directory) {
        if (directory == null || !directory.exists() || !directory.isDirectory()) {
            return;
        }

        File[] children = directory.listFiles();
        if (children == null) {
            return;
        }

        for (File child : children) {
            deleteRecursively(child);
        }
    }

    private void deleteRecursively(File target) {
        if (target == null || !target.exists()) {
            return;
        }

        if (target.isDirectory()) {
            File[] children = target.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }

        target.delete();
    }
}
