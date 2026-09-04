package sep.pksep.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

import java.util.ArrayList;
import java.util.List;

public class ScreenShareForegroundService extends Service {
    public static final String ACTION_START = "sep.pksep.app.action.START_SCREEN_SHARE";
    public static final String ACTION_STOP = "sep.pksep.app.action.STOP_SCREEN_SHARE";
    private static final String CHANNEL_ID = "screen_share";
    private static final int NOTIFICATION_ID = 4102;
    private static final List<Runnable> STARTED_CALLBACKS = new ArrayList<>();
    private static boolean isStarted;

    public static synchronized void runWhenStarted(Runnable callback) {
        if (isStarted) {
            callback.run();
            return;
        }

        STARTED_CALLBACKS.add(callback);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;

        if (ACTION_STOP.equals(action)) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
            stopSelf();
            markStopped();
            return START_NOT_STICKY;
        }

        ensureNotificationChannel();
        Notification notification = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        markStarted();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        markStopped();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private static synchronized void markStarted() {
        isStarted = true;
        List<Runnable> callbacks = new ArrayList<>(STARTED_CALLBACKS);
        STARTED_CALLBACKS.clear();

        for (Runnable callback : callbacks) {
            callback.run();
        }
    }

    private static synchronized void markStopped() {
        isStarted = false;
        STARTED_CALLBACKS.clear();
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            launchIntent,
            flags
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.notification_statusbar_robot_head_2026)
            .setContentTitle("Демонстрация экрана")
            .setContentText("Трансляция экрана активна")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE);

        return NotificationBrandIconHelper.build(this, builder);
    }

    private void ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager notificationManager = (NotificationManager) getSystemService(
            Context.NOTIFICATION_SERVICE
        );

        if (notificationManager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Демонстрация экрана",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Уведомления во время демонстрации экрана");
        notificationManager.createNotificationChannel(channel);
    }
}
