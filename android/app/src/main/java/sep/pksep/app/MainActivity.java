package sep.pksep.app;

import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Shader;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.LayerDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;

import com.getcapacitor.JSObject;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

import androidx.core.splashscreen.SplashScreen;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import sep.pksep.app.plugins.AudioOutputPlugin;
import sep.pksep.app.plugins.AndroidScreenSharePlugin;
import sep.pksep.app.plugins.CallScreenPlugin;
import sep.pksep.app.plugins.ChatBackgroundSyncPlugin;
import sep.pksep.app.plugins.LaunchStartupPlugin;
import sep.pksep.app.plugins.KeyboardMediaPlugin;
import sep.pksep.app.plugins.KeyboardViewportPlugin;
import sep.pksep.app.plugins.NativeFilePlugin;
import sep.pksep.app.plugins.NotificationAudioPlugin;
import sep.pksep.app.plugins.NotificationTapPlugin;
import sep.pksep.app.plugins.ProximityLockPlugin;
import sep.pksep.app.plugins.RuStorePushPlugin;
import sep.pksep.app.plugins.RuStoreUpdatePlugin;
import sep.pksep.app.plugins.ShareIntentPlugin;
import sep.pksep.app.plugins.TelemetryDevicePlugin;
import sep.pksep.app.plugins.VpnStatusPlugin;
import sep.pksep.app.sync.ChatStartupHistory;

@SuppressWarnings("deprecation")
public class MainActivity extends BridgeActivity {
    private static final String EXTRA_ACTION = "action";
    private static final String EXTRA_CALL_ACTION = "callAction";
    private static final String EXTRA_RUSTORE_MESSAGE_ID = "rustore.message_id";
    private static final String EXTRA_ROOM_ID = "roomId";
    private static final String EXTRA_TOPIC_ID = "topicId";
    private static final String EXTRA_TYPE = "type";
    private static final String WEBVIEW_CACHE_PREFS = "webview_cache";
    private static final String PREF_WEBVIEW_CACHE_APK_FINGERPRINT =
        "webview_cache_apk_fingerprint";
    private static final String PREF_WEBVIEW_CACHE_VERSION_CODE =
        "webview_cache_version_code";
    private static final int LAUNCH_BACKGROUND_LIGHT_COLOR = 0xFFF8F9FD;
    private static final int LAUNCH_BACKGROUND_DARK_COLOR = 0xFF212531;
    private static final long LAUNCH_SPLASH_FALLBACK_TIMEOUT_MS = 6000L;
    private android.animation.ValueAnimator themeColorAnimator;
    private ChatKeyboardViewport keyboardViewport;
    private static final long STARTUP_OVERLAY_FALLBACK_TIMEOUT_MS = 30000L;
    private boolean customPluginsRegistered = false;
    private static volatile boolean appInForeground = false;
    private static volatile boolean activityCreated = false;
    private boolean launchedFromIncomingCall = false;
    private boolean launchedFromChatNotification = false;
    private boolean callFullscreenSystemUiEnabled = false;
    private boolean keepLaunchSplash = true;
    private boolean startupOverlayHidden = false;
    private boolean preparedNativeLaunch = false;
    private boolean preparedWebViewHidden = false;
    private boolean preparedWebContentReady = false;
    private boolean preparedWebViewCommitted = false;
    private boolean preparedWebViewRevealScheduled = false;
    private View preparedLogoOverlay;
    private View startupOverlay;
    private final Handler launchSplashHandler = new Handler(Looper.getMainLooper());
    private String pendingWebViewCacheClearFingerprint = null;
    private long pendingWebViewCacheClearVersionCode = -1L;

    private static void markStartupBenchmark(String stage) {
        if (BuildConfig.CHAT_STARTUP_BENCHMARK) {
            android.util.Log.i("ChatStartupBenchmark", stage + " " + System.currentTimeMillis());
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        markStartupBenchmark("activity-start");
        if (savedInstanceState != null) markStartupBenchmark("activity-restored");
        activityCreated = true;
        launchedFromIncomingCall = isIncomingCallIntent(getIntent());
        launchedFromChatNotification = isChatMessageNotificationIntent(getIntent());
        preparedNativeLaunch = getIntent() != null && getIntent().getBooleanExtra(
            NotificationLaunchActivity.EXTRA_PREPARED_NOTIFICATION_LAUNCH,
            false
        );
        if (preparedNativeLaunch) {
            ChatStartupHistory.adopt(
                this,
                getIntent().getStringExtra(EXTRA_TOPIC_ID),
                getIntent().getStringExtra(
                    NotificationLaunchActivity.EXTRA_PREPARED_HISTORY
                ),
                getIntent().getLongExtra(
                    NotificationLaunchActivity.EXTRA_PREPARED_HISTORY_STARTED_AT,
                    0L
                )
            );
        }
        // Сохранённое состояние Activity не означает живой процесс: после его
        // выгрузки свежая история тоже должна загружаться параллельно WebView.
        if (!launchedFromIncomingCall && !preparedNativeLaunch) {
            ChatStartupHistory.start(this, launchedFromChatNotification ? getIntent().getStringExtra(EXTRA_TOPIC_ID) : null);
        }
        if (preparedNativeLaunch) {
            setTheme(isDarkLaunchTheme()
                ? R.style.AppTheme_PreparedMainDark
                : R.style.AppTheme_PreparedMain);
        } else if (isDarkLaunchTheme()) {
            setTheme(R.style.AppTheme_NoActionBarLaunchDark);
        }
        SplashScreen launchSplash = preparedNativeLaunch && launchedFromChatNotification
            ? null
            : SplashScreen.installSplashScreen(this);
        configureLaunchSplash(launchSplash);
        if (!preparedNativeLaunch) applyLaunchBackground();
        LaunchAppearance.applySystemBars(this);
        if (!launchedFromIncomingCall &&
            shouldClearWebViewCacheForCurrentVersion()) {
            markStartupBenchmark("asset-cache-cleanup-start");
            // Старый service worker может перехватить новый index.html. Удаляем
            // только его до создания WebView, сохраняя вложения и скомпилированный JS.
            if (WebViewAssetCache.clearLegacyServiceWorkers(new File(getApplicationInfo().dataDir))) {
                markWebViewCacheClearedForCurrentVersion();
            }
            markStartupBenchmark("asset-cache-cleanup-ready");
        }
        NotificationChannelHelper.ensureDefaultChannel(this);
        registerCustomPluginsIfNeeded();
        // Publish a cold-start notification before Capacitor starts loading the
        // page. The tiny startup module can then select the topic shell before
        // Android reveals the WebView, instead of briefly showing the chat list.
        handleNotificationLaunchIntent(getIntent());

        markStartupBenchmark("activity-prepared");
        super.onCreate(savedInstanceState);
        WebView systemBarsWebView = bridge == null ? null : bridge.getWebView();
        LaunchAppearance.applySystemBars(this, systemBarsWebView);
        if (systemBarsWebView != null) {
            systemBarsWebView.post(
                () -> LaunchAppearance.applySystemBars(this, systemBarsWebView)
            );
        }
        if (BuildConfig.CHAT_STARTUP_BENCHMARK) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        if (!launchedFromIncomingCall) {
            configurePreparedMainWindow();
        } else {
            applyLaunchBackground();
        }
        configureLocalDevelopmentNetworking();
        configureBridgeWebViewBackground();
        if (!preparedNativeLaunch) setPortraitOrientation();
        configureIncomingCallWindow(getIntent());
        handleCallIntent(getIntent());
        handleShareIntent(getIntent());
        if (preparedWebViewHidden) {
            launchSplashHandler.postDelayed(
                this::revealPreparedWebView,
                STARTUP_OVERLAY_FALLBACK_TIMEOUT_MS
            );
        }
        if (launchSplash != null && preparedWebViewHidden) {
            releaseLaunchSplash();
        }
        markStartupBenchmark("activity-created");
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

    @Override
    public void onStop() {
        super.onStop();
        sep.pksep.app.sync.ChatNotificationRecoveryScheduler.request(this);
        LaunchAppearance.finishLauncherIconUpdate(this);
    }

    @Override
    public void onDestroy() {
        if (keyboardViewport != null) keyboardViewport.close();
        if (themeColorAnimator != null) themeColorAnimator.cancel();
        activityCreated = false;
        super.onDestroy();
    }

    public void setChatKeyboardViewportEnabled(boolean enabled) {
        if (!enabled) {
            if (keyboardViewport != null) keyboardViewport.close();
            keyboardViewport = null;
        } else if (keyboardViewport == null && bridge != null && bridge.getWebView() != null) {
            keyboardViewport = ChatKeyboardViewport.attach(this, bridge.getWebView());
        } else if (keyboardViewport != null) {
            keyboardViewport.sync();
        }
    }

    public void setChatKeyboardOverlayOpen(boolean open) {
        if (keyboardViewport != null) keyboardViewport.setOverlayOpen(open);
    }

    public static boolean isAppInForeground() {
        return appInForeground;
    }

    static boolean hasCreatedInstance() {
        return activityCreated;
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
        keepLaunchSplash = launchSplash != null;
        if (launchSplash != null) {
            launchSplash.setKeepOnScreenCondition(() -> keepLaunchSplash);
            // Первый кадр уже готов: системное затухание логотипа лишь задерживает его показ.
            launchSplash.setOnExitAnimationListener(provider -> {
                provider.remove();
                markStartupBenchmark("splash-removed");
            });
            launchSplashHandler.postDelayed(
                this::releaseLaunchSplash,
                LAUNCH_SPLASH_FALLBACK_TIMEOUT_MS
            );
        }

        bridgeBuilder.addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    markStartupBenchmark("webview-commit");
                    if (preparedWebViewHidden) {
                        preparedWebViewCommitted = true;
                        if (!launchedFromChatNotification) preparedWebContentReady = true;
                        maybeRevealPreparedWebView();
                        return;
                    }
                    if (launchedFromChatNotification) {
                        applyWebViewLaunchBackground(view);
                        return;
                    }

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
        if (keepLaunchSplash) markStartupBenchmark("splash-release-requested");
        keepLaunchSplash = false;
    }

    public void revealStartupOverlay() {
        runOnUiThread(() -> {
            releaseLaunchSplash();
            // Маршрут и web-скелетон уже готовы; сеть не должна удерживать логотип.
            preparedWebContentReady = true;
            maybeRevealPreparedWebView();
        });
    }

    public void hideStartupOverlayAndReleaseSplash() {
        markStartupBenchmark("web-content-ready");
        runOnUiThread(
            () -> {
                releaseLaunchSplash();

                if (preparedWebViewHidden) {
                    startupOverlayHidden = true;
                    preparedWebContentReady = true;
                    maybeRevealPreparedWebView();
                    return;
                }

                if (startupOverlayHidden) {
                    return;
                }

                startupOverlayHidden = true;
                View overlay = startupOverlay;
                startupOverlay = null;

                if (overlay == null) {
                    return;
                }

                // The WebView shell is already paintable when this method is
                // called. Removing the native layer atomically avoids blending
                // two headers, composers and skeletons during a cross-fade.
                if (overlay.getParent() instanceof ViewGroup) {
                    ((ViewGroup) overlay.getParent()).removeView(overlay);
                }
                markStartupBenchmark("content-visible");
            }
        );
    }

    private void installStartupOverlay() {
        if (startupOverlay != null || startupOverlayHidden) {
            return;
        }

        if (launchedFromChatNotification) {
            installNotificationTopicStartupOverlay();
            return;
        }

        FrameLayout overlay = new FrameLayout(this);
        overlay.setClickable(true);
        overlay.setBackgroundColor(getLaunchBackgroundColor());
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

    private void installNotificationTopicStartupOverlay() {
        boolean isDarkTheme = isDarkLaunchTheme();
        int mainColor = isDarkTheme
            ? LAUNCH_BACKGROUND_DARK_COLOR
            : LAUNCH_BACKGROUND_LIGHT_COLOR;
        int surfaceColor = isDarkTheme ? 0xFF262A38 : 0xFFFFFFFF;
        int skeletonColor = isDarkTheme ? 0xFF606884 : 0xFFE7E7E7;
        int skeletonHighlightColor = isDarkTheme ? 0xFF767F9D : 0xFFF5F5F5;

        FrameLayout overlay = new FrameLayout(this);
        overlay.setClickable(true);
        overlay.setBackgroundColor(mainColor);
        applyNotificationStartupWallpaper(overlay, mainColor);

        // Keep the wallpaper below the header (and beneath the composer), but
        // paint the transparent top system inset with the header surface.
        View statusBarBackground = new View(this);
        statusBarBackground.setBackgroundColor(surfaceColor);
        overlay.addView(
            statusBarBackground,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                Gravity.TOP
            )
        );

        LinearLayout topicShell = new LinearLayout(this);
        topicShell.setOrientation(LinearLayout.VERTICAL);
        topicShell.setBackgroundColor(0x00000000);
        ViewCompat.setOnApplyWindowInsetsListener(
            topicShell,
            (view, windowInsets) -> {
                Insets systemBars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                );
                view.setPadding(0, systemBars.top, 0, systemBars.bottom);
                ViewGroup.LayoutParams statusBarParams =
                    statusBarBackground.getLayoutParams();
                if (statusBarParams.height != systemBars.top) {
                    statusBarParams.height = systemBars.top;
                    statusBarBackground.setLayoutParams(statusBarParams);
                }
                return windowInsets;
            }
        );
        overlay.addView(
            topicShell,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        ViewCompat.requestApplyInsets(topicShell);

        topicShell.addView(
            createNotificationStartupHeader(
                surfaceColor
            ),
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(60)
            )
        );

        FrameLayout messages = new FrameLayout(this);
        LinearLayout.LayoutParams messagesParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f
        );
        topicShell.addView(messages, messagesParams);

        LinearLayout messageSkeletons = new LinearLayout(this);
        messageSkeletons.setOrientation(LinearLayout.VERTICAL);
        messageSkeletons.setPadding(dp(8), dp(18), dp(8), dp(55));
        FrameLayout.LayoutParams skeletonsParams = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        messages.addView(messageSkeletons, skeletonsParams);
        boolean showMessageAvatars = "GROUP".equalsIgnoreCase(
            getIntent() == null ? null : getIntent().getStringExtra("topicType")
        );
        addNotificationMessageSkeleton(
            messageSkeletons,
            true,
            showMessageAvatars,
            180,
            46,
            skeletonColor
        );
        addNotificationSkeletonSpacer(messageSkeletons);
        addNotificationMediaSkeleton(
            messageSkeletons,
            268,
            155,
            skeletonColor,
            skeletonHighlightColor
        );
        addNotificationSkeletonSpacer(messageSkeletons);
        addNotificationMessageSkeleton(
            messageSkeletons,
            true,
            showMessageAvatars,
            280,
            46,
            skeletonColor
        );
        addNotificationSkeletonSpacer(messageSkeletons);
        addNotificationMessageSkeleton(
            messageSkeletons,
            false,
            false,
            306,
            46,
            skeletonColor
        );
        addNotificationSkeletonSpacer(messageSkeletons);
        addNotificationMessageSkeleton(
            messageSkeletons,
            true,
            showMessageAvatars,
            150,
            46,
            skeletonColor
        );
        addNotificationSkeletonSpacer(messageSkeletons);
        addNotificationMessageSkeleton(
            messageSkeletons,
            false,
            false,
            250,
            46,
            skeletonColor
        );
        addNotificationSkeletonSpacer(messageSkeletons);
        addNotificationMessageSkeleton(
            messageSkeletons,
            true,
            showMessageAvatars,
            280,
            46,
            skeletonColor
        );

        topicShell.addView(
            createNotificationStartupComposer(
                surfaceColor,
                skeletonColor
            ),
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(75)
            )
        );

        getWindow().addContentView(
            overlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        startupOverlay = overlay;

        // The Android splash only needs to cover the first native layout pass.
        // From the next frame onward this topic shell is a useful, stable state
        // while the WebView and the latest message page are loading.
        overlay.postOnAnimation(this::releaseLaunchSplash);
        launchSplashHandler.postDelayed(
            this::hideStartupOverlayAndReleaseSplash,
            STARTUP_OVERLAY_FALLBACK_TIMEOUT_MS
        );
    }

    private View createNotificationStartupHeader(int surfaceColor) {
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.HORIZONTAL);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(16), dp(7), dp(16), dp(7));
        header.setBackgroundColor(surfaceColor);

        header.addView(
            createBlock(40, 40, 0xFFE7E7E7, 20, true),
            new LinearLayout.LayoutParams(dp(40), dp(40))
        );

        LinearLayout profile = new LinearLayout(this);
        profile.setOrientation(LinearLayout.VERTICAL);
        profile.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams profileParams = new LinearLayout.LayoutParams(
            0,
            ViewGroup.LayoutParams.MATCH_PARENT,
            1f
        );
        profileParams.setMargins(dp(10), 0, dp(12), 0);
        header.addView(profile, profileParams);

        View titleLine = createBlock(150, 14, 0xFFE7E7E7, 5, false);
        LinearLayout.LayoutParams titleLineParams = new LinearLayout.LayoutParams(
            dp(150),
            dp(14)
        );
        titleLineParams.setMargins(0, 0, 0, dp(6));
        profile.addView(titleLine, titleLineParams);
        profile.addView(
            createBlock(92, 10, 0xFFE7E7E7, 5, false),
            new LinearLayout.LayoutParams(dp(92), dp(10))
        );

        addHeaderSkeletonAction(header, 0xFFE7E7E7);
        addHeaderSkeletonAction(header, 0xFFE7E7E7);
        return header;
    }

    private void addHeaderSkeletonAction(
        LinearLayout header,
        int color
    ) {
        View action = createBlock(24, 24, color, 12, true);
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            dp(24),
            dp(24)
        );
        params.setMargins(dp(8), 0, 0, 0);
        header.addView(action, params);
    }

    private void addNotificationMessageSkeleton(
        LinearLayout container,
        boolean incoming,
        boolean showAvatar,
        int bubbleWidthDp,
        int bubbleHeightDp,
        int color
    ) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.BOTTOM);
        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            dp(Math.max(42, bubbleHeightDp))
        );
        rowParams.setMargins(0, 0, 0, dp(12));
        container.addView(row, rowParams);

        if (!incoming) {
            row.addView(
                new View(this),
                new LinearLayout.LayoutParams(0, 1, 1f)
            );
        } else if (showAvatar) {
            View avatar = createBlock(35, 35, color, 18, true);
            LinearLayout.LayoutParams avatarParams = new LinearLayout.LayoutParams(
                dp(35),
                dp(35)
            );
            avatarParams.setMargins(0, 0, dp(8), 0);
            row.addView(avatar, avatarParams);
        }

        View bubble = createBlock(
            bubbleWidthDp,
            bubbleHeightDp,
            color,
            18,
            false
        );
        row.addView(
            bubble,
            new LinearLayout.LayoutParams(dp(bubbleWidthDp), dp(bubbleHeightDp))
        );
    }

    private void addNotificationSkeletonSpacer(LinearLayout container) {
        container.addView(
            new View(this),
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
        );
    }

    private void addNotificationMediaSkeleton(
        LinearLayout container,
        int widthDp,
        int heightDp,
        int color,
        int highlightColor
    ) {
        FrameLayout media = new FrameLayout(this);
        media.setBackground(createRoundedBackground(color, 18, 0));
        LinearLayout.LayoutParams mediaParams = new LinearLayout.LayoutParams(
            dp(widthDp),
            dp(heightDp)
        );
        mediaParams.gravity = Gravity.END;
        container.addView(media, mediaParams);

        View icon = createBlock(42, 42, highlightColor, 12, false);
        media.addView(
            icon,
            new FrameLayout.LayoutParams(dp(42), dp(42), Gravity.CENTER)
        );
    }

    private View createNotificationStartupComposer(
        int surfaceColor,
        int skeletonColor
    ) {
        FrameLayout composer = new FrameLayout(this);
        composer.setPadding(dp(10), dp(5), dp(10), dp(20));

        LinearLayout editor = new LinearLayout(this);
        editor.setOrientation(LinearLayout.HORIZONTAL);
        editor.setGravity(Gravity.CENTER_VERTICAL);
        editor.setPadding(dp(14), 0, dp(14), 0);
        editor.setBackground(
            createRoundedBackground(surfaceColor, 25, skeletonColor)
        );
        composer.addView(
            editor,
            new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );

        editor.addView(
            createBlock(22, 22, skeletonColor, 11, true),
            new LinearLayout.LayoutParams(dp(22), dp(22))
        );

        View textLine = createBlock(-1, 14, skeletonColor, 5, false);
        LinearLayout.LayoutParams textLineParams = new LinearLayout.LayoutParams(
            0,
            dp(14),
            1f
        );
        textLineParams.setMargins(dp(10), 0, dp(10), 0);
        editor.addView(textLine, textLineParams);

        editor.addView(
            createBlock(22, 22, skeletonColor, 11, true),
            new LinearLayout.LayoutParams(dp(22), dp(22))
        );
        return composer;
    }

    private void applyNotificationStartupWallpaper(
        FrameLayout messages,
        int backgroundColor
    ) {
        messages.setBackgroundColor(backgroundColor);
        String selectedWallpaperId = readStartupWallpaperFile("selected-id.txt");

        if ("none".equals(selectedWallpaperId)) {
            return;
        }

        if (
            selectedWallpaperId != null &&
            selectedWallpaperId.startsWith("custom-wallpaper-")
        ) {
            Bitmap customWallpaper = decodeStartupCustomWallpaper(
                readStartupWallpaperFile(selectedWallpaperId + ".txt")
            );

            if (customWallpaper != null) {
                ImageView wallpaperView = new ImageView(this);
                wallpaperView.setImageBitmap(customWallpaper);
                wallpaperView.setScaleType(ImageView.ScaleType.CENTER_CROP);
                messages.addView(
                    wallpaperView,
                    new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                );
                return;
            }
        }

        messages.setBackground(createStartupWallpaper(backgroundColor));
    }

    private String readStartupWallpaperFile(String fileName) {
        if (fileName == null || fileName.trim().isEmpty()) {
            return null;
        }

        File wallpaperFile = new File(
            new File(getFilesDir(), "chat-wallpapers"),
            fileName
        );

        if (!wallpaperFile.isFile()) {
            return null;
        }

        try {
            return new String(
                Files.readAllBytes(wallpaperFile.toPath()),
                StandardCharsets.UTF_8
            ).trim();
        } catch (IOException ignored) {
            return null;
        }
    }

    private Bitmap decodeStartupCustomWallpaper(String dataUrl) {
        if (dataUrl == null || dataUrl.trim().isEmpty()) {
            return null;
        }

        int separatorIndex = dataUrl.indexOf(',');
        String encodedImage = separatorIndex >= 0
            ? dataUrl.substring(separatorIndex + 1)
            : dataUrl;

        try {
            byte[] imageBytes = Base64.decode(encodedImage, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private Drawable createStartupWallpaper(int backgroundColor) {
        Bitmap bitmap = BitmapFactory.decodeResource(
            getResources(),
            R.drawable.chat_wallpaper_startup
        );
        if (bitmap == null) {
            return new ColorDrawable(backgroundColor);
        }

        BitmapDrawable pattern = new BitmapDrawable(getResources(), bitmap);
        pattern.setTileModeX(Shader.TileMode.REPEAT);
        pattern.setTileModeY(Shader.TileMode.REPEAT);
        return new LayerDrawable(
            new Drawable[] { new ColorDrawable(backgroundColor), pattern }
        );
    }

    private GradientDrawable createRoundedBackground(
        int fillColor,
        int radiusDp,
        int strokeColor
    ) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(fillColor);
        background.setCornerRadius(dp(radiusDp));
        if (strokeColor != 0) {
            background.setStroke(1, strokeColor);
        }
        return background;
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
                        markStartupBenchmark("webview-visual-ready");
                        // WebView подтвердил готовность кадра; дополнительный таймер не нужен.
                        MainActivity.this.releaseLaunchSplash();
                    }
                }
            );
            return;
        }

        webView.postDelayed(this::releaseLaunchSplash, 250L);
    }

    private void applyLaunchBackground() {
        int launchBackgroundColor = getLaunchBackgroundColor();
        getWindow().setBackgroundDrawable(new ColorDrawable(launchBackgroundColor));
        getWindow().getDecorView().setBackgroundColor(launchBackgroundColor);
    }

    private void configureBridgeWebViewBackground() {
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }

        applyWebViewLaunchBackground(bridge.getWebView());
    }

    private void configurePreparedMainWindow() {
        preparedWebViewHidden = true;
        int background = getLaunchBackgroundColor();
        getWindow().setBackgroundDrawable(new ColorDrawable(background));
        getWindow().getDecorView().setBackgroundColor(background);
        View content = findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(background);
        if (bridge != null && bridge.getWebView() != null) {
            applyWebViewLaunchBackground(bridge.getWebView());
            bridge.getWebView().setAlpha(1f);
        }
        preparedLogoOverlay = new PreparedStartupView(
            this,
            getIntent(),
            launchedFromChatNotification
        );
        addContentView(
            preparedLogoOverlay,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        markStartupBenchmark("prepared-webview-hidden");
    }

    private void revealPreparedWebView() {
        if (!preparedWebViewHidden) return;
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;

        int background = getLaunchBackgroundColor();
        webView.setBackgroundColor(background);
        webView.setAlpha(1f);
        View content = findViewById(android.R.id.content);
        if (content != null) content.setBackgroundColor(background);
        getWindow().setBackgroundDrawable(new ColorDrawable(background));
        getWindow().getDecorView().setBackgroundColor(background);
        View logoOverlay = preparedLogoOverlay;
        preparedLogoOverlay = null;
        if (logoOverlay != null && logoOverlay.getParent() instanceof ViewGroup) {
            ((ViewGroup) logoOverlay.getParent()).removeView(logoOverlay);
        }
        preparedWebViewHidden = false;
        markStartupBenchmark("content-visible");
        webView.postOnAnimation(() -> markStartupBenchmark("prepared-handoff-complete"));
    }

    private void maybeRevealPreparedWebView() {
        if (!preparedWebContentReady || !preparedWebViewCommitted ||
            preparedWebViewRevealScheduled || !preparedWebViewHidden) return;
        WebView webView = bridge == null ? null : bridge.getWebView();
        if (webView == null) return;

        preparedWebViewRevealScheduled = true;
        revealPreparedWebView();
    }

    private void applyWebViewLaunchBackground(WebView webView) {
        if (webView == null) {
            return;
        }

        webView.setBackgroundColor(getLaunchBackgroundColor());
    }

    public void setLaunchDarkTheme(boolean isDarkTheme) {
        int previousColor = LaunchAppearance.backgroundColor(this);
        int previousStatusBarColor = LaunchAppearance.statusBarColor(this);
        LaunchAppearance.setDark(this, isDarkTheme);
        runOnUiThread(() -> {
            int fromColor = themeColorAnimator != null &&
                themeColorAnimator.isRunning()
                ? (int) themeColorAnimator.getAnimatedValue()
                : previousColor;
            int fromStatusBarColor = themeColorAnimator != null &&
                themeColorAnimator.isRunning()
                ? getWindow().getStatusBarColor()
                : previousStatusBarColor;
            if (themeColorAnimator != null) themeColorAnimator.cancel();
            themeColorAnimator = LaunchAppearance.animateSystemBars(
                this,
                fromColor,
                LaunchAppearance.backgroundColor(this),
                fromStatusBarColor,
                LaunchAppearance.statusBarColor(this),
                bridge == null ? null : bridge.getWebView()
            );
        });
    }

    private boolean isDarkLaunchTheme() {
        return LaunchAppearance.isDark(this);
    }

    private int getLaunchBackgroundColor() {
        return isDarkLaunchTheme()
            ? LAUNCH_BACKGROUND_DARK_COLOR
            : LAUNCH_BACKGROUND_LIGHT_COLOR;
    }

    @Override
    protected void load() {
        markStartupBenchmark("bridge-start");
        if (config == null) config = com.getcapacitor.CapConfig.loadDefault(this);
        // Плагин создаёт свои перекрытия до запуска JS: белый цвет по умолчанию
        // не должен появляться даже на один кадр при сохранённой тёмной теме.
        LaunchAppearance.configureSystemBarPlugin(this, config);
        if (isDarkLaunchTheme()) setTheme(R.style.AppTheme_NoActionBarDark);
        LaunchAppearance.applySystemBars(this);
        super.load();
        markStartupBenchmark("bridge-ready");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        markStartupBenchmark("new-intent");
        // При восстановлении задачи Android сначала создаёт Activity со старым
        // intent, затем передаёт нажатое уведомление. Capacitor также вызывает
        // этот метод с исходным объектом; его запрос повторять не нужно.
        if (!startupOverlayHidden && intent != getIntent() &&
            isChatMessageNotificationIntent(intent)) {
            markStartupBenchmark("history-retargeted");
            ChatStartupHistory.start(this, intent.getStringExtra(EXTRA_TOPIC_ID));
        }
        super.onNewIntent(intent);
        setIntent(intent);
        launchedFromIncomingCall = isIncomingCallIntent(intent);
        launchedFromChatNotification = isChatMessageNotificationIntent(intent);
        configureIncomingCallWindow(intent);
        handleCallIntent(intent);
        handleNotificationLaunchIntent(intent);
        handleShareIntent(intent);
    }

    private boolean isChatMessageNotificationIntent(Intent intent) {
        if (intent == null) {
            return false;
        }

        Bundle extras = intent.getExtras();
        if (
            extras == null ||
            IncomingCallNotificationHelper.isDirectCallPayload(
                extras.getString(EXTRA_TYPE),
                extras.getString(IncomingCallNotificationHelper.EXTRA_TOPIC_TYPE)
            )
        ) {
            return false;
        }

        boolean isPushNotification = extras.containsKey(EXTRA_RUSTORE_MESSAGE_ID);
        boolean isExplicitChatNotification =
            ChatNotificationHelper.ACTION_OPEN_CHAT_NOTIFICATION.equals(
                intent.getAction()
            );
        String topicId = extras.getString(EXTRA_TOPIC_ID);

        return (
            (isPushNotification || isExplicitChatNotification) &&
            topicId != null &&
            !topicId.trim().isEmpty()
        );
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
        registerPlugin(KeyboardMediaPlugin.class);
        registerPlugin(KeyboardViewportPlugin.class);
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

        boolean isRuStoreNotification = extras.containsKey(EXTRA_RUSTORE_MESSAGE_ID);
        boolean isExplicitChatNotification =
            ChatNotificationHelper.ACTION_OPEN_CHAT_NOTIFICATION.equals(
                intent.getAction()
        );
        boolean isIncomingCallNotification =
            IncomingCallNotificationHelper.isDirectCallPayload(
                extras.getString(EXTRA_TYPE),
                extras.getString(IncomingCallNotificationHelper.EXTRA_TOPIC_TYPE)
            ) &&
            extras.containsKey(EXTRA_ROOM_ID);

        if (
            !isRuStoreNotification &&
            !isExplicitChatNotification &&
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

        if (
            IncomingCallNotificationHelper.isDirectCallPayload(
                intent.getStringExtra(EXTRA_TYPE),
                intent.getStringExtra(IncomingCallNotificationHelper.EXTRA_TOPIC_TYPE)
            )
        ) {
            return true;
        }

        Uri data = intent.getData();
        return data != null && IncomingCallNotificationHelper.isDirectCallPayload(
            data.getQueryParameter(EXTRA_TYPE),
            data.getQueryParameter(IncomingCallNotificationHelper.EXTRA_TOPIC_TYPE)
        );
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

}
