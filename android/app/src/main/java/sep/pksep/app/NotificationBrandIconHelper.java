package sep.pksep.app;

import android.app.Notification;
import android.content.Context;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Locale;

public final class NotificationBrandIconHelper {
    private static final String XIAOMI_NOTIFICATION_STYLE_SETTING =
        "status_bar_notification_style";
    private static final int XIAOMI_CLASSIC_STYLE = 0;

    private NotificationBrandIconHelper() {}

    public static Notification build(
        Context context,
        NotificationCompat.Builder builder
    ) {
        if (builder == null) {
            throw new IllegalArgumentException("Notification builder is required");
        }

        boolean usesClassicStyle =
            context != null && usesXiaomiClassicStyle(context);
        // Keep a single monochrome small icon in both Android and Xiaomi
        // Classic styles. The notification must not acquire a second
        // (large/color) icon on the right.
        builder.setSmallIcon(R.drawable.notification_statusbar_chat_bubbles_2026);

        Notification notification = builder.build();
        if (usesClassicStyle) {
            enableXiaomiCustomizedIcon(notification);
        }
        return notification;
    }

    private static boolean usesXiaomiClassicStyle(Context context) {
        if (!isXiaomiDevice()) {
            return false;
        }

        return Settings.System.getInt(
            context.getContentResolver(),
            XIAOMI_NOTIFICATION_STYLE_SETTING,
            1
        ) == XIAOMI_CLASSIC_STYLE;
    }

    private static boolean isXiaomiDevice() {
        String manufacturer = normalize(Build.MANUFACTURER);
        String brand = normalize(Build.BRAND);
        return isXiaomiName(manufacturer) || isXiaomiName(brand);
    }

    private static boolean isXiaomiName(String value) {
        return value.contains("xiaomi") ||
            value.contains("redmi") ||
            value.contains("poco");
    }

    private static String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private static void enableXiaomiCustomizedIcon(Notification notification) {
        try {
            Field extraNotificationField = notification
                .getClass()
                .getDeclaredField("extraNotification");
            extraNotificationField.setAccessible(true);
            Object extraNotification = extraNotificationField.get(notification);
            if (extraNotification == null) {
                return;
            }

            Method setCustomizedIcon = extraNotification
                .getClass()
                .getDeclaredMethod("setCustomizedIcon", boolean.class);
            setCustomizedIcon.setAccessible(true);
            setCustomizedIcon.invoke(extraNotification, true);
        } catch (ReflectiveOperationException | RuntimeException ignored) {
            // Other Android builds do not expose Xiaomi's notification extension.
        }
    }
}
