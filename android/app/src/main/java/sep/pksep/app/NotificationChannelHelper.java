package sep.pksep.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

public final class NotificationChannelHelper {
    public static final String DEFAULT_CHANNEL_ID = "chat_messages";

    private NotificationChannelHelper() {}

    public static void ensureDefaultChannel(Context context) {
        if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
            DEFAULT_CHANNEL_ID,
            "Messages",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("General chat notifications");
        Uri notificationSound = RingtoneManager.getDefaultUri(
            RingtoneManager.TYPE_NOTIFICATION
        );
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        channel.setSound(notificationSound, audioAttributes);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }
}
