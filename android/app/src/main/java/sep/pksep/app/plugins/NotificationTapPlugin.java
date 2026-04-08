package sep.pksep.app.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NotificationTap")
public class NotificationTapPlugin extends Plugin {
    private static final String EVENT_NOTIFICATION_TAP = "notificationTap";
    private static NotificationTapPlugin instance;
    private static JSObject pendingNotificationTap;

    @Override
    public void load() {
        super.load();
        instance = this;
        flushPendingNotificationTap();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    public static void dispatchNotificationTap(JSObject payload) {
        pendingNotificationTap = payload;

        if (instance != null) {
            instance.flushPendingNotificationTap();
        }
    }

    private void flushPendingNotificationTap() {
        if (pendingNotificationTap == null) {
            return;
        }

        notifyListeners(EVENT_NOTIFICATION_TAP, pendingNotificationTap, true);
    }

    @PluginMethod
    public void consumePendingNotificationTap(PluginCall call) {
        JSObject payload = pendingNotificationTap;
        pendingNotificationTap = null;

        if (payload == null) {
            payload = new JSObject();
        }

        call.resolve(payload);
    }
}
