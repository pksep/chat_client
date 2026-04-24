package sep.pksep.app.plugins;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

import sep.pksep.app.IncomingCallNotificationHelper;
import sep.pksep.app.MainActivity;

@CapacitorPlugin(name = "CallScreen")
public class CallScreenPlugin extends Plugin {

    private static final String TAG = "CallScreenPlugin";
    private static final String EVENT_CALL_ACTION = "callAction";
    private static CallScreenPlugin instance;
    private static JSObject pendingCallAction;

    @Override
    public void load() {
        super.load();
        instance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    public static void dispatchCallAction(String action, String roomId, String topicId) {
        JSObject payload = new JSObject();
        payload.put("action", action);
        if (roomId != null) {
            payload.put("roomId", roomId);
        }
        if (topicId != null) {
            payload.put("topicId", topicId);
        }

        // Keep the last native action until the web layer explicitly consumes it.
        // This is critical on cold start, where the plugin instance may already exist
        // before JS listeners are attached.
        pendingCallAction = payload;

        if (instance != null) {
            instance.notifyListeners(EVENT_CALL_ACTION, payload);
        }
    }

    @PluginMethod
    public void consumePendingCallAction(PluginCall call) {
        JSObject payload = pendingCallAction;
        pendingCallAction = null;
        if (payload == null) {
            payload = new JSObject();
        }
        call.resolve(payload);
    }

    @PluginMethod
    public void showIncomingCallScreen(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (getActivity() instanceof MainActivity) {
                    ((MainActivity) getActivity()).setIncomingCallWindowEnabled(true);
                }

                Log.d(TAG, "Incoming call screen enabled");
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Error enabling incoming call screen", e);
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void hideIncomingCallScreen(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                IncomingCallNotificationHelper.dismissAllIncomingCalls(getContext());
                if (getActivity() instanceof MainActivity) {
                    ((MainActivity) getActivity()).setIncomingCallWindowEnabled(false);
                }
                Log.d(TAG, "Incoming call screen disabled");
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Error disabling incoming call screen", e);
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void showIncomingCall(PluginCall call) {
        String callerName = call.getString("callerName");
        String roomId = call.getString("roomId");
        String topicId = call.getString("topicId");

        if (roomId == null || roomId.trim().isEmpty()) {
            call.reject("roomId is required");
            return;
        }

        IncomingCallNotificationHelper.showIncomingCall(
            getContext(),
            null,
            callerName,
            roomId,
            topicId,
            null
        );
        call.resolve();
    }

    @PluginMethod
    public void dismissIncomingCall(PluginCall call) {
        String roomId = call.getString("roomId");

        if (roomId == null || roomId.trim().isEmpty()) {
            IncomingCallNotificationHelper.dismissAllIncomingCalls(getContext());
            call.resolve();
            return;
        }

        IncomingCallNotificationHelper.dismissIncomingCall(getContext(), roomId);
        call.resolve();
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        boolean overlay = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            overlay = Settings.canDrawOverlays(getContext());
        }

        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean batteryIgnored = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && pm != null) {
            batteryIgnored = pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        }

        ret.put("overlay", overlay);
        ret.put("battery", batteryIgnored);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestOverlayPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(
                    Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getContext().getPackageName())
                );
                getActivity().startActivity(intent);
            } catch (Exception e) {
                Log.e(TAG, "Could not open battery settings", e);
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        String manufacturer = android.os.Build.MANUFACTURER.toLowerCase();
        Intent intent = new Intent();
        boolean found = false;

        try {
            if (manufacturer.contains("xiaomi")) {
                intent.setClassName(
                    "com.miui.securitycenter",
                    "com.miui.permcenter.permissions.PermissionsEditorActivity"
                );
                intent.putExtra("extra_pkgname", getContext().getPackageName());
            } else if (manufacturer.contains("oppo")) {
                intent.setClassName(
                    "com.coloros.safecenter",
                    "com.coloros.safecenter.permission.startup.StartupAppListActivity"
                );
            } else if (manufacturer.contains("vivo")) {
                intent.setClassName(
                    "com.vivo.permissionmanager",
                    "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
                );
            } else if (manufacturer.contains("huawei")) {
                intent.setClassName(
                    "com.huawei.systemmanager",
                    "com.huawei.systemmanager.optimize.process.ProtectActivity"
                );
            } else {
                intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            }

            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            List<ResolveInfo> list = getContext().getPackageManager().queryIntentActivities(intent, 0);
            if (list.size() > 0) {
                getActivity().startActivity(intent);
                found = true;
            }
        } catch (Exception e) {
            Log.e(TAG, "Error opening special settings", e);
        }

        if (!found) {
            Intent fallbackIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            fallbackIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(fallbackIntent);
        }
        call.resolve();
    }
}
