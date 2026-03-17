package sep.pksep.app.plugins;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import android.view.WindowManager;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import android.content.pm.ResolveInfo;

@CapacitorPlugin(name = "CallScreen")
public class CallScreenPlugin extends Plugin {

    private static final String TAG = "CallScreenPlugin";

    @PluginMethod
    public void showIncomingCallScreen(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    getActivity().setShowWhenLocked(true);
                    getActivity().setTurnScreenOn(true);
                    getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON);
                } else {
                    getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }

                // Принудительно выводим на передний план
                android.app.ActivityManager activityManager = (android.app.ActivityManager) getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
                if (activityManager != null) {
                    activityManager.moveTaskToFront(getActivity().getTaskId(), android.app.ActivityManager.MOVE_TASK_WITH_HOME);
                }

                Log.d(TAG, "Show incoming call screen enabled and moved to front");
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
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    getActivity().setShowWhenLocked(false);
                    getActivity().setTurnScreenOn(false);
                    getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON);
                } else {
                    getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                            | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
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
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                        Uri.parse("package:" + getContext().getPackageName()));
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
                // Try MIUIPermissions first as it's more critical for calls
                intent.setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity");
                intent.putExtra("extra_pkgname", getContext().getPackageName());
            } else if (manufacturer.contains("oppo")) {
                intent.setClassName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity");
            } else if (manufacturer.contains("vivo")) {
                intent.setClassName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity");
            } else if (manufacturer.contains("huawei")) {
                intent.setClassName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity");
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
            // Fallback to app info
            Intent fallbackIntent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            fallbackIntent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(fallbackIntent);
        }
        call.resolve();
    }
}
