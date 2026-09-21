package sep.pksep.app;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.TracingConfig;
import android.webkit.TracingController;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.Executors;

// Отделяем запуск процесса и ContentProvider от создания Activity в холодных замерах.
public class StartupBenchmarkApplication extends ChatApplication {
    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        mark("process-attached");
    }

    @Override
    public void onCreate() {
        super.onCreate();
        mark("application-created");
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityPreCreated(Activity activity, Bundle state) {
                if (!activity.getIntent().getBooleanExtra("traceStartup", false) ||
                    Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return;
                unregisterActivityLifecycleCallbacks(this);
                // Только отдельный диагностический запуск; приёмочные замеры без traceStartup.
                TracingController controller = TracingController.getInstance();
                controller.start(new TracingConfig.Builder()
                    .addCategories(TracingConfig.CATEGORIES_JAVASCRIPT_AND_RENDERING,
                        TracingConfig.CATEGORIES_WEB_DEVELOPER)
                    .addCategories("disabled-by-default-v8.cpu_profiler")
                    .setTracingMode(TracingConfig.RECORD_CONTINUOUSLY).build());
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    try {
                        File target = new File(getExternalFilesDir(null), "startup-webview-trace.json");
                        controller.stop(new FileOutputStream(target), Executors.newSingleThreadExecutor());
                        Log.i("ChatStartupTrace", "Сохранение профиля WebView: " + target);
                    } catch (Exception error) {
                        Log.e("ChatStartupTrace", "Не удалось сохранить профиль WebView", error);
                    }
                }, 8000);
            }
            @Override public void onActivityCreated(Activity activity, Bundle state) {}
            @Override public void onActivityStarted(Activity activity) {}
            @Override public void onActivityResumed(Activity activity) {}
            @Override public void onActivityPaused(Activity activity) {}
            @Override public void onActivityStopped(Activity activity) {}
            @Override public void onActivitySaveInstanceState(Activity activity, Bundle state) {}
            @Override public void onActivityDestroyed(Activity activity) {}
        });
    }

    private static void mark(String stage) {
        Log.i("ChatStartupBenchmark", stage + " " + System.currentTimeMillis());
    }
}
