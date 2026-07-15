package sep.pksep.app;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.BridgeActivity;

import java.io.File;

import sep.pksep.app.plugins.AudioOutputPlugin;
import sep.pksep.app.plugins.AndroidScreenSharePlugin;
import sep.pksep.app.plugins.CallScreenPlugin;
import sep.pksep.app.plugins.ChatBackgroundSyncPlugin;
import sep.pksep.app.plugins.NativeFilePlugin;
import sep.pksep.app.plugins.NotificationAudioPlugin;
import sep.pksep.app.plugins.NotificationTapPlugin;
import sep.pksep.app.plugins.ProximityLockPlugin;
import sep.pksep.app.plugins.RuStoreUpdatePlugin;
import sep.pksep.app.plugins.ShareIntentPlugin;
import sep.pksep.app.plugins.TelemetryDevicePlugin;
import sep.pksep.app.plugins.VpnStatusPlugin;

@SuppressWarnings("deprecation")
public class MainActivity extends BridgeActivity {
    private static final String EXTRA_ACTION = "action";
    private static final String EXTRA_CALL_ACTION = "callAction";
    private static final String EXTRA_GOOGLE_MESSAGE_ID = "google.message_id";
    private static final String EXTRA_ROOM_ID = "roomId";
    private static final String EXTRA_TOPIC_ID = "topicId";
    private static final String EXTRA_TYPE = "type";
    private static boolean customPluginsRegistered = false;
    private boolean launchedFromIncomingCall = false;
    private boolean shouldClearWebViewCacheBeforeLoad = false;
    private boolean callFullscreenSystemUiEnabled = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        launchedFromIncomingCall = isIncomingCallIntent(getIntent());
        shouldClearWebViewCacheBeforeLoad =
            savedInstanceState == null && !launchedFromIncomingCall;
        NotificationChannelHelper.ensureDefaultChannel(this);
        registerCustomPluginsIfNeeded();

        super.onCreate(savedInstanceState);
        setPortraitOrientation();
        configureIncomingCallWindow(getIntent());
        handleCallIntent(getIntent());
        handleNotificationLaunchIntent(getIntent());
        handleShareIntent(getIntent());
    }

    @Override
    protected void load() {
        if (shouldClearWebViewCacheBeforeLoad) {
            shouldClearWebViewCacheBeforeLoad = false;
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
        handleShareIntent(intent);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && callFullscreenSystemUiEnabled) {
            applyCallFullscreenSystemUi();
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (AudioOutputPlugin.handleCallVolumeKeyEvent(this, event)) {
            return true;
        }

        return super.dispatchKeyEvent(event);
    }

    private void registerCustomPluginsIfNeeded() {
        if (customPluginsRegistered) {
            return;
        }

        registerPlugin(AudioOutputPlugin.class);
        registerPlugin(AndroidScreenSharePlugin.class);
        registerPlugin(ProximityLockPlugin.class);
        registerPlugin(CallScreenPlugin.class);
        registerPlugin(ChatBackgroundSyncPlugin.class);
        registerPlugin(NativeFilePlugin.class);
        registerPlugin(NotificationAudioPlugin.class);
        registerPlugin(NotificationTapPlugin.class);
        registerPlugin(RuStoreUpdatePlugin.class);
        registerPlugin(ShareIntentPlugin.class);
        registerPlugin(TelemetryDevicePlugin.class);
        registerPlugin(VpnStatusPlugin.class);
        customPluginsRegistered = true;
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

    private void handleShareIntent(Intent intent) {
        if (!isShareIntent(intent)) {
            return;
        }

        ShareIntentPlugin.dispatchShareIntent(this, intent);
        clearHandledShareIntent(intent);
    }

    private boolean isShareIntent(Intent intent) {
        if (intent == null) {
            return false;
        }

        String action = intent.getAction();

        return Intent.ACTION_SEND.equals(action) ||
            Intent.ACTION_SEND_MULTIPLE.equals(action);
    }

    private void clearHandledShareIntent(Intent intent) {
        if (intent == null) {
            return;
        }

        intent.removeExtra(Intent.EXTRA_STREAM);
        intent.removeExtra(Intent.EXTRA_TEXT);
        intent.setType(null);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            intent.setClipData(null);
        }

        intent.setAction(null);
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

    public void setPortraitOrientation() {
        setCallFullscreenSystemUiEnabled(false);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
    }

    public void setCallFullscreenOrientation() {
        setCallFullscreenSystemUiEnabled(true);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
    }

    private void setCallFullscreenSystemUiEnabled(boolean enabled) {
        callFullscreenSystemUiEnabled = enabled;

        if (enabled) {
            applyCallFullscreenSystemUi();
            return;
        }

        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void applyCallFullscreenSystemUi() {
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
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
