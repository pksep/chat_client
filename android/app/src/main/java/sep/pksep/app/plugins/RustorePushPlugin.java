package sep.pksep.app.plugins;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

import java.util.Map;

import ru.rustore.sdk.core.feature.model.FeatureAvailabilityResult;
import ru.rustore.sdk.pushclient.RuStorePushClient;
import ru.rustore.sdk.pushclient.common.logger.DefaultLogger;
import sep.pksep.app.ChatNotificationHelper;
import sep.pksep.app.NotificationChannelHelper;

@CapacitorPlugin(
    name = "RustorePush",
    permissions = {
        @Permission(alias = "receive", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class RustorePushPlugin extends Plugin {
    private static final String EVENT_PUSH_RECEIVED = "pushNotificationReceived";
    private static final String EVENT_PUSH_DELETED = "pushNotificationDeleted";
    private static final String EVENT_REGISTRATION = "registration";
    private static final String EVENT_REGISTRATION_ERROR = "registrationError";

    private static RustorePushPlugin instance;
    private static JSObject pendingPushReceived;
    private static JSObject pendingPushDeleted;
    private static JSObject pendingRegistration;
    private static JSObject pendingRegistrationError;

    @Override
    public void load() {
        super.load();
        instance = this;
        flushPendingEvents();
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        call.resolve(buildPermissionsResult());
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            call.resolve(buildPermissionsResult());
            return;
        }

        requestPermissionForAlias("receive", call, "permissionsCallback");
    }

    @PluginMethod
    public void register(PluginCall call) {
        NotificationChannelHelper.ensureDefaultChannel(getContext());
        RuStorePushClient.INSTANCE.init(
            getActivity().getApplication(),
            getContext().getString(
                getContext().getResources().getIdentifier(
                    "rustore_project_id",
                    "string",
                    getContext().getPackageName()
                )
            ),
            new DefaultLogger("RustorePush")
        );

        RuStorePushClient.INSTANCE.checkPushAvailability()
            .addOnSuccessListener(result -> {
                if (result instanceof FeatureAvailabilityResult.Available) {
                    requestToken(call);
                    return;
                }

                dispatchRegistrationError("RuStore push is unavailable on this device");
                call.resolve(new JSObject());
            })
            .addOnFailureListener(throwable -> {
                dispatchRegistrationError(getErrorMessage(throwable));
                call.resolve(new JSObject());
            });
    }

    @PluginMethod
    public void clearNotificationsForTopic(PluginCall call) {
        String topicId = call.getString("topicId");
        ChatNotificationHelper.dismissTopicNotifications(getContext(), topicId);
        call.resolve();
    }

    @PluginMethod
    public void clearAllNotifications(PluginCall call) {
        ChatNotificationHelper.dismissAll(getContext());
        call.resolve();
    }

    @com.getcapacitor.annotation.PermissionCallback
    private void permissionsCallback(PluginCall call) {
        call.resolve(buildPermissionsResult());
    }

    public static void dispatchRegistration(String token) {
        JSObject payload = new JSObject();
        payload.put("value", token);
        pendingRegistration = payload;

        if (instance != null) {
            instance.flushPendingEvents();
        }
    }

    public static void dispatchRegistrationError(String errorMessage) {
        JSObject payload = new JSObject();
        payload.put("error", errorMessage);
        pendingRegistrationError = payload;

        if (instance != null) {
            instance.flushPendingEvents();
        }
    }

    public static void dispatchPushDeleted() {
        pendingPushDeleted = new JSObject();

        if (instance != null) {
            instance.flushPendingEvents();
        }
    }

    public static void dispatchPushReceived(
        String messageId,
        String title,
        String body,
        Map<String, String> data
    ) {
        JSObject payload = new JSObject();
        JSObject dataObject = new JSObject();

        if (data != null) {
            for (Map.Entry<String, String> entry : data.entrySet()) {
                dataObject.put(entry.getKey(), entry.getValue());
            }
        }

        if (messageId != null) {
            payload.put("id", messageId);
            dataObject.put("messageId", messageId);
        }
        if (title != null) {
            payload.put("title", title);
        }
        if (body != null) {
            payload.put("body", body);
        }

        payload.put("data", dataObject);
        pendingPushReceived = payload;

        if (instance != null) {
            instance.flushPendingEvents();
        }
    }

    private void flushPendingEvents() {
        if (pendingRegistration != null) {
            notifyListeners(EVENT_REGISTRATION, pendingRegistration, true);
            pendingRegistration = null;
        }

        if (pendingRegistrationError != null) {
            notifyListeners(EVENT_REGISTRATION_ERROR, pendingRegistrationError, true);
            pendingRegistrationError = null;
        }

        if (pendingPushReceived != null) {
            notifyListeners(EVENT_PUSH_RECEIVED, pendingPushReceived, true);
            pendingPushReceived = null;
        }

        if (pendingPushDeleted != null) {
            notifyListeners(EVENT_PUSH_DELETED, pendingPushDeleted, true);
            pendingPushDeleted = null;
        }
    }

    private void requestToken(PluginCall call) {
        RuStorePushClient.INSTANCE.getToken()
            .addOnSuccessListener(token -> {
                JSObject payload = new JSObject();
                payload.put("value", token);
                dispatchRegistration(token);
                call.resolve(payload);
            })
            .addOnFailureListener(throwable -> {
                dispatchRegistrationError(getErrorMessage(throwable));
                call.resolve(new JSObject());
            });
    }

    private JSObject buildPermissionsResult() {
        JSObject result = new JSObject();

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            result.put("receive", "granted");
            return result;
        }

        if (
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            result.put("receive", "granted");
            return result;
        }

        PermissionState permissionState = getPermissionState("receive");
        result.put(
            "receive",
            permissionState == PermissionState.PROMPT ? "prompt" : "denied"
        );
        return result;
    }

    private String getErrorMessage(Throwable throwable) {
        if (throwable == null || throwable.getMessage() == null) {
            return "Unknown RuStore push error";
        }

        return throwable.getMessage();
    }
}
