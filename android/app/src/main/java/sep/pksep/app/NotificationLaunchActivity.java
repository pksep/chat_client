package sep.pksep.app;

import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.os.Looper;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.ColorUtils;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONArray;

import java.lang.ref.WeakReference;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CompletableFuture;

import sep.pksep.app.sync.ChatStartupHistory;

/**
 * Keeps the original app logo visible while fresh data and Chromium are
 * prepared. The WebView activity stays translucent until its complete frame
 * can replace the logo without an intermediate screen or white transition.
 */
public class NotificationLaunchActivity extends AppCompatActivity {
    static final String EXTRA_PREPARED_NOTIFICATION_LAUNCH =
        "preparedNotificationLaunch";
    static final String EXTRA_PREPARED_HISTORY = "preparedStartupHistory";
    static final String EXTRA_PREPARED_HISTORY_STARTED_AT =
        "preparedStartupHistoryStartedAt";
    private static final int MAX_PREPARED_HISTORY_BYTES = 400_000;
    private static final long RECENT_NOTIFICATION_CACHE_MS = 10_000L;

    private static WeakReference<NotificationLaunchActivity> activeLaunch =
        new WeakReference<>(null);

    private boolean mainActivityStarted = false;
    private int launchGeneration = 0;
    private JSONArray preparedRows;
    private long preparedHistoryStartedAt;
    private boolean launcherLogoPresented;

    private static void markStartupBenchmark(String stage) {
        if (BuildConfig.CHAT_STARTUP_BENCHMARK) {
            android.util.Log.i(
                "ChatStartupBenchmark",
                stage + " " + System.currentTimeMillis()
            );
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        markStartupBenchmark("launcher-activity-start");
        SplashScreen launchSplash = SplashScreen.installSplashScreen(this);
        launchSplash.setKeepOnScreenCondition(() -> !launcherLogoPresented);
        launchSplash.setOnExitAnimationListener(provider -> provider.remove());
        Intent launchIntent = getIntent();
        String topicId = topicId(launchIntent);
        // Start TLS/DNS before inflating the launcher view. Rendering proceeds
        // in parallel and the first server page can arrive within the first
        // second even when connection setup is temporarily slow.
        long historyStartedAt = System.currentTimeMillis();
        CompletableFuture<JSONArray> fresh = ChatStartupHistory.start(this, topicId);
        JSONArray recentRows = recentRows(topicId);
        super.onCreate(savedInstanceState);
        activeLaunch = new WeakReference<>(this);

        int launchBackground = ContextCompat.getColor(
            this,
            R.color.launch_background
        );
        boolean lightSystemBars = ColorUtils.calculateLuminance(
            launchBackground
        ) > 0.5d;
        getWindow().setStatusBarColor(launchBackground);
        getWindow().setNavigationBarColor(launchBackground);
        WindowInsetsControllerCompat insetsController =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        insetsController.setAppearanceLightStatusBars(lightSystemBars);
        insetsController.setAppearanceLightNavigationBars(lightSystemBars);

        beginLaunch(
            launchIntent,
            topicId,
            historyStartedAt,
            fresh,
            recentRows
        );
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        mainActivityStarted = false;
        String topicId = topicId(intent);
        long historyStartedAt = System.currentTimeMillis();
        CompletableFuture<JSONArray> fresh = ChatStartupHistory.start(this, topicId);
        beginLaunch(
            intent,
            topicId,
            historyStartedAt,
            fresh,
            recentRows(topicId)
        );
    }

    private static String topicId(Intent intent) {
        if (intent == null) return "";
        String value = intent.getStringExtra("topicId");
        return value == null ? "" : value;
    }

    private JSONArray recentRows(String topicId) {
        return topicId.isEmpty()
            ? null
            : ChatStartupHistory.readRecentCachedNow(
                this,
                topicId,
                RECENT_NOTIFICATION_CACHE_MS
            );
    }

    private void beginLaunch(
        Intent intent,
        String topicId,
        long historyStartedAt,
        CompletableFuture<JSONArray> fresh,
        JSONArray recentRows
    ) {
        int generation = ++launchGeneration;
        preparedRows = null;
        preparedHistoryStartedAt = historyStartedAt;
        launcherLogoPresented = false;
        PreparedStartupView view = new PreparedStartupView(
            this,
            intent,
            !topicId.isEmpty()
        );
        boolean online = hasValidatedNetwork();
        JSONArray savedRows = recentRows != null
            ? recentRows
            : ChatStartupHistory.readRecentCachedNow(
                this,
                topicId,
                Long.MAX_VALUE
            );
        if (savedRows == null) savedRows = new JSONArray();
        if (!online) {
            view.render(savedRows, true);
        } else if (recentRows != null) {
            preparedRows = recentRows;
            view.render(recentRows, false);
        } else {
            view.renderUpdating(savedRows);
        }
        setContentView(view);
        markStartupBenchmark("launcher-logo-attached");
        presentLauncherLogo(generation);

        if (!online) {
            return;
        }

        String requestedTopicId = topicId;
        fresh.whenComplete((rows, error) -> {
            Runnable apply = () -> {
                if (
                    generation != launchGeneration ||
                    isFinishing() ||
                    isDestroyed()
                ) return;
                if (error == null && rows != null) {
                    preparedRows = rows;
                    view.render(rows, false);
                    if (launcherLogoPresented) {
                        markStartupBenchmark("history-refreshed");
                    }
                    presentLauncherLogo(generation);
                    return;
                }
                showOfflineThenStart(requestedTopicId, generation, view);
            };
            if (Looper.myLooper() == Looper.getMainLooper()) apply.run();
            else runOnUiThread(apply);
        });
    }

    private boolean hasValidatedNetwork() {
        ConnectivityManager manager =
            (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        Network network = manager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null
            ? null
            : manager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(
            NetworkCapabilities.NET_CAPABILITY_VALIDATED
        );
    }

    private void showOfflineThenStart(
        String topicId,
        int generation,
        PreparedStartupView view
    ) {
        ChatStartupHistory.loadCached(this, topicId).whenComplete(
            (rows, error) -> runOnUiThread(() -> {
                if (
                    generation != launchGeneration ||
                    isFinishing() ||
                    isDestroyed()
                ) return;
                view.render(
                    error == null && rows != null ? rows : new JSONArray(),
                    true
                );
                presentLauncherLogo(generation);
            })
        );
    }

    private void presentLauncherLogo(int generation) {
        if (generation != launchGeneration || launcherLogoPresented) return;
        launcherLogoPresented = true;
        markStartupBenchmark("native-logo-visible");
        startMainActivity(generation);
    }

    private void startMainActivity(int generation) {
        if (
            generation != launchGeneration ||
            mainActivityStarted ||
            isFinishing()
        ) return;
        mainActivityStarted = true;

        Intent mainIntent = new Intent(getIntent());
        mainIntent.setClass(this, MainActivity.class);
        mainIntent.putExtra(EXTRA_PREPARED_NOTIFICATION_LAUNCH, true);
        if (preparedRows != null) {
            String history = preparedRows.toString();
            if (history.getBytes(StandardCharsets.UTF_8).length <=
                MAX_PREPARED_HISTORY_BYTES) {
                mainIntent.putExtra(EXTRA_PREPARED_HISTORY, history);
                mainIntent.putExtra(
                    EXTRA_PREPARED_HISTORY_STARTED_AT,
                    preparedHistoryStartedAt
                );
            }
        }
        mainIntent.addFlags(
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
            Intent.FLAG_ACTIVITY_SINGLE_TOP |
            Intent.FLAG_ACTIVITY_NO_ANIMATION
        );
        startActivity(mainIntent);
        overridePendingTransition(0, 0);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Keep this frame below the translucent WebView activity. Removing a
        // lower activity while SurfaceFlinger swaps WebView surfaces exposes
        // the home wallpaper for several frames. When Back really returns to
        // this activity, close it immediately instead of launching again.
        if (mainActivityStarted && !isFinishing()) {
            finish();
            overridePendingTransition(0, 0);
        }
    }

    @Override
    protected void onDestroy() {
        NotificationLaunchActivity activity = activeLaunch.get();
        if (activity == this) activeLaunch.clear();
        super.onDestroy();
    }
}
