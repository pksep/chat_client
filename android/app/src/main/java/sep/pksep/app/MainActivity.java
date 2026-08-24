package sep.pksep.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.LinearLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import androidx.core.splashscreen.SplashScreen;

import java.io.File;

import sep.pksep.app.plugins.AudioOutputPlugin;
import sep.pksep.app.plugins.AndroidScreenSharePlugin;
import sep.pksep.app.plugins.CallScreenPlugin;
import sep.pksep.app.plugins.ChatBackgroundSyncPlugin;
import sep.pksep.app.plugins.LaunchStartupPlugin;
import sep.pksep.app.plugins.NativeFilePlugin;
import sep.pksep.app.plugins.NotificationAudioPlugin;
import sep.pksep.app.plugins.NotificationTapPlugin;
import sep.pksep.app.plugins.ProximityLockPlugin;
import sep.pksep.app.plugins.RuStorePushPlugin;
import sep.pksep.app.plugins.RuStoreUpdatePlugin;
import sep.pksep.app.plugins.ShareIntentPlugin;
import sep.pksep.app.plugins.TelemetryDevicePlugin;
import sep.pksep.app.plugins.VpnStatusPlugin;

@SuppressWarnings("deprecation")
public class MainActivity extends BridgeActivity {
    private static final String EXTRA_ACTION = "action";
    private static final String EXTRA_CALL_ACTION = "callAction";
    private static final String EXTRA_GOOGLE_MESSAGE_ID = "google.message_id";
    private static final String EXTRA_RUSTORE_MESSAGE_ID = "rustore.message_id";
    private static final String EXTRA_ROOM_ID = "roomId";
    private static final String EXTRA_TOPIC_ID = "topicId";
    private static final String EXTRA_TYPE = "type";
    private static final String WEBVIEW_CACHE_PREFS = "webview_cache";
    private static final String PREF_WEBVIEW_CACHE_APK_FINGERPRINT =
        "webview_cache_apk_fingerprint";
    private static final String PREF_WEBVIEW_CACHE_VERSION_CODE =
        "webview_cache_version_code";
    private static final int LAUNCH_BACKGROUND_COLOR = 0xFFF8F9FD;
    private static final long LAUNCH_SPLASH_FALLBACK_TIMEOUT_MS = 6000L;
    private static final long STARTUP_OVERLAY_FALLBACK_TIMEOUT_MS = 6000L;
    private static boolean customPluginsRegistered = false;
    private static volatile boolean appInForeground = false;
    private boolean launchedFromIncomingCall = false;
    private boolean shouldClearWebViewCacheBeforeLoad = false;
    private boolean callFullscreenSystemUiEnabled = false;
    private boolean keepLaunchSplash = true;
    private boolean startupOverlayHidden = false;
    private View startupOverlay;
    private final Handler launchSplashHandler = new Handler(Looper.getMainLooper());
    private String pendingWebViewCacheClearFingerprint = null;
    private long pendingWebViewCacheClearVersionCode = -1L;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen launchSplash = SplashScreen.installSplashScreen(this);
        configureLaunchSplash(launchSplash);
        applyLaunchBackground();
        launchedFromIncomingCall = isIncomingCallIntent(getIntent());
        shouldClearWebViewCacheBeforeLoad =
            savedInstanceState == null &&
                !launchedFromIncomingCall &&
                shouldClearWebViewCacheForCurrentVersion();
        NotificationChannelHelper.ensureDefaultChannel(this);
        registerCustomPluginsIfNeeded();

        super.onCreate(savedInstanceState);
        applyLaunchBackground();
        configureLocalDevelopmentNetworking();
        configureBridgeWebViewBackground();
        setPortraitOrientation();
        configureIncomingCallWindow(getIntent());
        handleCallIntent(getIntent());
        handleNotificationLaunchIntent(getIntent());
        handleShareIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        appInForeground = true;
    }

    @Override
    public void onPause() {
        appInForeground = false;
        super.onPause();
    }

    static boolean isAppInForeground() {
        return appInForeground;
    }

    private void configureLocalDevelopmentNetworking() {
        if (
            !BuildConfig.CHAT_ALLOW_CLEARTEXT ||
            bridge == null ||
            bridge.getWebView() == null
        ) {
            return;
        }

        bridge
            .getWebView()
            .getSettings()
            .setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }

    private void configureLaunchSplash(SplashScreen launchSplash) {
        keepLaunchSplash = true;
        launchSplash.setKeepOnScreenCondition(() -> keepLaunchSplash);
        launchSplashHandler.postDelayed(
            this::releaseLaunchSplash,
            LAUNCH_SPLASH_FALLBACK_TIMEOUT_MS
        );

        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    releaseLaunchSplashAfterWebViewPaint(view);
                }

                @Override
                public void onPageLoaded(WebView webView) {
                    applyWebViewLaunchBackground(webView);
                }

                @Override
                public void onReceivedError(WebView webView) {
                    releaseLaunchSplash();
                }

                @Override
                public void onReceivedHttpError(WebView webView) {
                    releaseLaunchSplash();
                }
            }
        );
    }

    private void releaseLaunchSplash() {
        keepLaunchSplash = false;
    }

    public void hideStartupOverlayAndReleaseSplash() {
        runOnUiThread(
            () -> {
                releaseLaunchSplash();

                if (startupOverlayHidden) {
                    return;
                }

                startupOverlayHidden = true;
                View overlay = startupOverlay;
                startupOverlay = null;

                if (overlay == null) {
                    return;
                }

                overlay.animate()
                    .alpha(0f)
                    .setDuration(120L)
                    .withEndAction(
                        () -> {
                            if (overlay.getParent() instanceof ViewGroup) {
                                ((ViewGroup) overlay.getParent()).removeView(overlay);
                            }
                        }
                    )
                    .start();
            }
        );
    }

    private void installStartupOverlay() {
        if (startupOverlay != null || startupOverlayHidden) {
            return;
        }

        FrameLayout overlay = new FrameLayout(this);
        overlay.setClickable(true);
        overlay.setBackgroundColor(LAUNCH_BACKGROUND_COLOR);
        overlay.setLayoutParams(
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), 0, dp(16), 0);
        overlay.addView(
            content,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        addSpacer(content, 100);
        addBlock(content, 128, 30, 0xFFE9EEF6, 8, 0, 0);
        addSpacer(content, 22);
        addFullWidthBlock(content, 52, 0xFFFFFFFF, 10, 0, 0);
        addSpacer(content, 14);
        addChipRow(content);
        addSpacer(content, 12);

        for (int index = 0; index < 8; index++) {
            addTopicSkeletonRow(content, index);
        }

        getWindow().addContentView(
            overlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        startupOverlay = overlay;
        launchSplashHandler.postDelayed(
            this::hideStartupOverlayAndReleaseSplash,
            STARTUP_OVERLAY_FALLBACK_TIMEOUT_MS
        );
    }

    private void addChipRow(LinearLayout content) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        content.addView(
            row,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                dp(38)
            )
        );

        addBlock(row, 76, 36, 0xFFEFF5FF, 18, 0, 12);
        addBlock(row, 72, 36, 0xFFFFFFFF, 18, 0, 12);
        addBlock(row, 106, 36, 0xFFFFFFFF, 18, 0, 12);
        addBlock(row, 72, 36, 0xFFFFFFFF, 18, 0, 0);
    }

    private void addTopicSkeletonRow(LinearLayout content, int index) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(0, dp(8), 0, dp(8));
        content.addView(
            row,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(82)
            )
        );

        View avatar = createBlock(58, 58, topicSkeletonColor(index), 29, true);
        LinearLayout.LayoutParams avatarParams =
            new LinearLayout.LayoutParams(dp(58), dp(58));
        avatarParams.setMargins(0, 0, dp(16), 0);
        row.addView(avatar, avatarParams);

        LinearLayout lines = new LinearLayout(this);
        lines.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams linesParams =
            new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        linesParams.setMargins(0, dp(8), 0, 0);
        row.addView(lines, linesParams);

        addBlock(lines, index % 3 == 0 ? 170 : 220, 18, 0xFFE6EAF1, 6, 0, 10);
        addBlock(lines, index % 2 == 0 ? 250 : 190, 16, 0xFFF0F3F8, 6, 0, 0);
    }

    private int topicSkeletonColor(int index) {
        int[] colors = {
            0xFF64AEE3,
            0xFF38CDE8,
            0xFFFF626A,
            0xFF8BB2FF
        };

        return colors[index % colors.length];
    }

    private void addSpacer(LinearLayout content, int heightDp) {
        View spacer = new View(this);
        content.addView(
            spacer,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(heightDp)
            )
        );
    }

    private void addFullWidthBlock(
        LinearLayout content,
        int heightDp,
        int color,
        int radiusDp,
        int marginTopDp,
        int horizontalBleedDp
    ) {
        View block = createBlock(-1, heightDp, color, radiusDp, false);
        LinearLayout.LayoutParams params =
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(heightDp)
            );
        params.setMargins(dp(horizontalBleedDp), dp(marginTopDp), dp(horizontalBleedDp), 0);
        content.addView(block, params);
    }

    private void addBlock(
        LinearLayout content,
        int widthDp,
        int heightDp,
        int color,
        int radiusDp,
        int marginTopDp,
        int marginRightDp
    ) {
        View block = createBlock(widthDp, heightDp, color, radiusDp, false);
        LinearLayout.LayoutParams params =
            new LinearLayout.LayoutParams(dp(widthDp), dp(heightDp));
        params.setMargins(0, dp(marginTopDp), dp(marginRightDp), 0);
        content.addView(block, params);
    }

    private View createBlock(
        int widthDp,
        int heightDp,
        int color,
        int radiusDp,
        boolean oval
    ) {
        View view = new View(this);
        GradientDrawable background = new GradientDrawable();
        background.setColor(color);

        if (oval) {
            background.setShape(GradientDrawable.OVAL);
        } else {
            background.setCornerRadius(dp(radiusDp));
        }

        view.setBackground(background);
        view.setLayoutParams(
            new LinearLayout.LayoutParams(
                widthDp < 0 ? ViewGroup.LayoutParams.MATCH_PARENT : dp(widthDp),
                dp(heightDp)
            )
        );
        return view;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void releaseLaunchSplashAfterWebViewPaint(WebView webView) {
        if (webView == null) {
            releaseLaunchSplash();
            return;
        }

        applyWebViewLaunchBackground(webView);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            webView.postVisualStateCallback(
                System.nanoTime(),
                new WebView.VisualStateCallback() {
                    @Override
                    public void onComplete(long requestId) {
                        launchSplashHandler.postDelayed(
                            MainActivity.this::releaseLaunchSplash,
                            80L
                        );
                    }
                }
            );
            return;
        }

        webView.postDelayed(this::releaseLaunchSplash, 250L);
    }

    private void applyLaunchBackground() {
        getWindow().setBackgroundDrawable(new ColorDrawable(LAUNCH_BACKGROUND_COLOR));
        getWindow().getDecorView().setBackgroundColor(LAUNCH_BACKGROUND_COLOR);
    }

    private void configureBridgeWebViewBackground() {
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        applyWebViewLaunchBackground(bridge.getWebView());
    }

    private void applyWebViewLaunchBackground(WebView webView) {
        if (webView == null) {
            return;
        }

        webView.setBackgroundColor(LAUNCH_BACKGROUND_COLOR);
    }

    @Override
    protected void load() {
        if (shouldClearWebViewCacheBeforeLoad) {
            shouldClearWebViewCacheBeforeLoad = false;
            clearWebViewCacheBeforeLoad();
            markWebViewCacheClearedForCurrentVersion();
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
        registerPlugin(LaunchStartupPlugin.class);
        registerPlugin(NativeFilePlugin.class);
        registerPlugin(NotificationAudioPlugin.class);
        registerPlugin(NotificationTapPlugin.class);
        registerPlugin(RuStorePushPlugin.class);
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

        boolean isFirebaseNotification = extras.containsKey(EXTRA_GOOGLE_MESSAGE_ID);
        boolean isRuStoreNotification = extras.containsKey(EXTRA_RUSTORE_MESSAGE_ID);
        boolean isIncomingCallNotification =
            "incoming_call".equals(extras.getString(EXTRA_TYPE)) &&
            extras.containsKey(EXTRA_ROOM_ID);

        if (
            !isFirebaseNotification &&
            !isRuStoreNotification &&
            !isIncomingCallNotification
        ) {
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

    private boolean shouldClearWebViewCacheForCurrentVersion() {
        PackageInfo packageInfo = getCurrentPackageInfo();
        if (packageInfo == null) {
            return false;
        }

        long currentVersionCode = getVersionCode(packageInfo);
        String currentFingerprint = currentVersionCode + ":" + packageInfo.lastUpdateTime;
        SharedPreferences prefs = getSharedPreferences(
            WEBVIEW_CACHE_PREFS,
            MODE_PRIVATE
        );

        if (currentFingerprint.equals(
            prefs.getString(PREF_WEBVIEW_CACHE_APK_FINGERPRINT, null)
        )) {
            return false;
        }

        pendingWebViewCacheClearFingerprint = currentFingerprint;
        pendingWebViewCacheClearVersionCode = currentVersionCode;
        return true;
    }

    private void markWebViewCacheClearedForCurrentVersion() {
        if (pendingWebViewCacheClearFingerprint == null) {
            return;
        }

        getSharedPreferences(WEBVIEW_CACHE_PREFS, MODE_PRIVATE)
            .edit()
            .putString(
                PREF_WEBVIEW_CACHE_APK_FINGERPRINT,
                pendingWebViewCacheClearFingerprint
            )
            .putLong(
                PREF_WEBVIEW_CACHE_VERSION_CODE,
                pendingWebViewCacheClearVersionCode
            )
            .apply();
        pendingWebViewCacheClearFingerprint = null;
        pendingWebViewCacheClearVersionCode = -1L;
    }

    private PackageInfo getCurrentPackageInfo() {
        try {
            return getPackageManager().getPackageInfo(
                getPackageName(),
                0
            );
        } catch (PackageManager.NameNotFoundException error) {
            return null;
        }
    }

    private long getVersionCode(PackageInfo packageInfo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return packageInfo.getLongVersionCode();
        }

        return packageInfo.versionCode;
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
