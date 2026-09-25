package sep.pksep.app.plugins;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import sep.pksep.app.BuildConfig;

import ru.rustore.sdk.appupdate.listener.InstallStateUpdateListener;
import ru.rustore.sdk.appupdate.manager.RuStoreAppUpdateManager;
import ru.rustore.sdk.appupdate.manager.factory.RuStoreAppUpdateManagerFactory;
import ru.rustore.sdk.appupdate.model.AppUpdateInfo;
import ru.rustore.sdk.appupdate.model.AppUpdateOptions;
import ru.rustore.sdk.appupdate.model.AppUpdateType;
import ru.rustore.sdk.appupdate.model.InstallState;

@CapacitorPlugin(name = "RuStoreUpdate")
public class RuStoreUpdatePlugin extends Plugin {
    private static final String EVENT_UPDATE_STATE_CHANGED = "updateStateChanged";
    private static final String TAG = "RuStoreUpdatePlugin";

    private RuStoreAppUpdateManager updateManager;
    private InstallStateUpdateListener installStateUpdateListener;
    private AppUpdateInfo cachedAppUpdateInfo;
    private JSObject pendingUpdateState;

    private void withUpdateManager(PluginCall call, Runnable action) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is not available");
            return;
        }
        // Менеджер нужен при проверке обновлений, а не при создании WebView.
        // Инициализация и освобождение остаются в UI-потоке Activity.
        activity.runOnUiThread(() -> {
            if (activity.isFinishing() || activity.isDestroyed()) {
                call.reject("Activity is not available");
                return;
            }
            try {
                if (updateManager == null) {
                    markStartupBenchmark("update-manager-start");
                    RuStoreAppUpdateManager manager =
                        RuStoreAppUpdateManagerFactory.INSTANCE.create(getContext());
                    InstallStateUpdateListener listener = this::handleInstallStateUpdated;
                    manager.registerListener(listener);
                    updateManager = manager;
                    installStateUpdateListener = listener;
                    flushPendingUpdateState();
                    markStartupBenchmark("update-manager-ready");
                }
                action.run();
            } catch (Exception exception) {
                Log.e(TAG, "RuStore update request failed", exception);
                call.reject(exception.getMessage(), exception.getClass().getSimpleName());
            }
        });
    }

    private static void markStartupBenchmark(String stage) {
        if (BuildConfig.CHAT_STARTUP_BENCHMARK) {
            Log.i("ChatStartupBenchmark", stage + " " + System.currentTimeMillis());
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (updateManager != null && installStateUpdateListener != null) {
            updateManager.unregisterListener(installStateUpdateListener);
        }

        installStateUpdateListener = null;
        updateManager = null;
        cachedAppUpdateInfo = null;

        super.handleOnDestroy();
    }

    @PluginMethod
    public void getAppUpdateInfo(PluginCall call) {
        withUpdateManager(call, () -> updateManager
            .getAppUpdateInfo()
            .addOnSuccessListener(appUpdateInfo -> {
                cachedAppUpdateInfo = appUpdateInfo;
                call.resolve(serializeAppUpdateInfo(appUpdateInfo));
            })
            .addOnFailureListener(throwable -> {
                Log.e(TAG, "getAppUpdateInfo error", throwable);
                call.reject(
                    throwable.getMessage(),
                    throwable.getClass().getSimpleName()
                );
            }));
    }

    @PluginMethod
    public void startFlexibleUpdate(PluginCall call) {
        startUpdateFlow(call, AppUpdateType.FLEXIBLE);
    }

    @PluginMethod
    public void completeFlexibleUpdate(PluginCall call) {
        completeUpdate(call, AppUpdateType.FLEXIBLE);
    }

    private void startUpdateFlow(PluginCall call, int appUpdateType) {
        withUpdateManager(call, () -> {
            if (cachedAppUpdateInfo == null) {
                call.reject("AppUpdateInfo is not available. Call getAppUpdateInfo first.");
                return;
            }

            updateManager
                .startUpdateFlow(
                    cachedAppUpdateInfo,
                    new AppUpdateOptions.Builder().appUpdateType(appUpdateType).build()
                )
                .addOnSuccessListener(resultCode -> {
                    JSObject result = new JSObject();
                    result.put("resultCode", resultCode);
                    call.resolve(result);
                })
                .addOnFailureListener(throwable -> {
                    Log.e(TAG, "startUpdateFlow error", throwable);
                    call.reject(
                        throwable.getMessage(),
                        throwable.getClass().getSimpleName()
                    );
                });
        });
    }

    private void completeUpdate(PluginCall call, int appUpdateType) {
        withUpdateManager(call, () -> updateManager
            .completeUpdate(
                new AppUpdateOptions.Builder().appUpdateType(appUpdateType).build()
            )
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(throwable -> {
                Log.e(TAG, "completeUpdate error", throwable);
                call.reject(
                    throwable.getMessage(),
                    throwable.getClass().getSimpleName()
                );
            }));
    }

    private void handleInstallStateUpdated(InstallState state) {
        JSObject payload = serializeInstallState(state);
        pendingUpdateState = payload;
        notifyListeners(EVENT_UPDATE_STATE_CHANGED, payload, true);
    }

    private void flushPendingUpdateState() {
        if (pendingUpdateState == null) {
            return;
        }

        notifyListeners(EVENT_UPDATE_STATE_CHANGED, pendingUpdateState, true);
    }

    private JSObject serializeAppUpdateInfo(AppUpdateInfo appUpdateInfo) {
        JSObject payload = new JSObject();
        payload.put("updateAvailability", appUpdateInfo.getUpdateAvailability());
        payload.put("installStatus", appUpdateInfo.getInstallStatus());
        payload.put("availableVersionCode", appUpdateInfo.getAvailableVersionCode());
        payload.put("availableVersionName", appUpdateInfo.getAvailableVersionName());
        payload.put("packageName", appUpdateInfo.getPackageName());
        payload.put("updatePriority", appUpdateInfo.getUpdatePriority());
        payload.put("updatedAt", appUpdateInfo.getUpdatedAt());

        return payload;
    }

    private JSObject serializeInstallState(InstallState state) {
        JSObject payload = new JSObject();
        payload.put("installStatus", state.getInstallStatus());
        payload.put("bytesDownloaded", state.getBytesDownloaded());
        payload.put("totalBytesToDownload", state.getTotalBytesToDownload());
        payload.put("installErrorCode", state.getInstallErrorCode());
        payload.put("packageName", state.getPackageName());

        return payload;
    }
}
