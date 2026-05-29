package sep.pksep.app.plugins;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

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

    @Override
    public void load() {
        super.load();

        updateManager = RuStoreAppUpdateManagerFactory.INSTANCE.create(getContext());
        installStateUpdateListener = this::handleInstallStateUpdated;
        updateManager.registerListener(installStateUpdateListener);
        flushPendingUpdateState();
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
        if (updateManager == null) {
            call.reject("RuStore update manager is not initialized");
            return;
        }

        updateManager
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
            });
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
        if (updateManager == null) {
            call.reject("RuStore update manager is not initialized");
            return;
        }

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
    }

    private void completeUpdate(PluginCall call, int appUpdateType) {
        if (updateManager == null) {
            call.reject("RuStore update manager is not initialized");
            return;
        }

        updateManager
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
            });
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
