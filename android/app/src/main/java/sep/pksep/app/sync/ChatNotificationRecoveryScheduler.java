package sep.pksep.app.sync;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.util.Log;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import java.util.concurrent.TimeUnit;

public final class ChatNotificationRecoveryScheduler {
    private static final String WORK_NAME = "chat-notification-recovery";
    private static final String NETWORK_WORK_NAME = "chat-notification-recovery-network";
    private static boolean observing;

    private ChatNotificationRecoveryScheduler() {}

    public static synchronized void start(Context context) {
        Context app = context.getApplicationContext();
        if (!ChatBackgroundSyncStore.getSession(app).isValid()) return;
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
            ChatNotificationRecoveryWorker.class, 15, TimeUnit.MINUTES
        ).setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).build();
        WorkManager.getInstance(app).enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
        request(app);
        if (observing) return;
        ConnectivityManager manager = (ConnectivityManager) app.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (manager == null) return;
        try {
            manager.registerDefaultNetworkCallback(new ConnectivityManager.NetworkCallback() {
                private boolean validated;
                @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                    boolean available = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                    if (available && !validated) request(app);
                    validated = available;
                }
                @Override public void onLost(Network network) {
                    validated = false;
                    // Работа ждёт сеть в WorkManager и переживает выгрузку процесса.
                    request(app);
                }
            });
            observing = true;
        } catch (RuntimeException error) {
            Log.w("ChatNotificationRecovery", "Не удалось подписаться на восстановление сети", error);
        }
    }

    public static void request(Context context) {
        if (!ChatBackgroundSyncStore.getSession(context).isValid()) return;
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(ChatNotificationRecoveryWorker.class)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setInitialDelay(3, TimeUnit.SECONDS).build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            NETWORK_WORK_NAME, ExistingWorkPolicy.APPEND_OR_REPLACE, request
        );
    }

    public static void stop(Context context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME);
        WorkManager.getInstance(context).cancelUniqueWork(NETWORK_WORK_NAME);
    }
}
