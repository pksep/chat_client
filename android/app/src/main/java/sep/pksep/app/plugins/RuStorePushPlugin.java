package sep.pksep.app.plugins;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
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
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Map;
import java.util.concurrent.ConcurrentLinkedQueue;

import ru.rustore.sdk.core.feature.model.FeatureAvailabilityResult;
import ru.rustore.sdk.pushclient.RuStorePushClient;
import sep.pksep.app.ChatNotificationDismissalHelper;
import sep.pksep.app.ChatNotificationHelper;
import sep.pksep.app.NotificationChannelHelper;
import sep.pksep.app.IncomingCallNotificationHelper;

@CapacitorPlugin(
    name = "RuStorePush",
    permissions = {
        @Permission(alias = "receive", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class RuStorePushPlugin extends Plugin {
    private static final String PUSH_PREFERENCES = "rustore_push";
    private static final String PREF_PROJECT_ID = "project_id";
    private static final String EVENT_PUSH_RECEIVED = "pushNotificationReceived";
    private static final String EVENT_PUSH_DELETED = "pushNotificationDeleted";
    private static final String EVENT_REGISTRATION = "registration";
    private static final String EVENT_REGISTRATION_ERROR = "registrationError";

    private static final ConcurrentLinkedQueue<JSObject> pendingPushReceived =
        new ConcurrentLinkedQueue<>();
    private static final ConcurrentLinkedQueue<JSObject> pendingPushDeleted =
        new ConcurrentLinkedQueue<>();
    private static final ConcurrentLinkedQueue<JSObject> pendingRegistration =
        new ConcurrentLinkedQueue<>();
    private static final ConcurrentLinkedQueue<JSObject> pendingRegistrationError =
        new ConcurrentLinkedQueue<>();
    private static volatile RuStorePushPlugin instance;

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

        RuStorePushClient.INSTANCE.checkPushAvailability()
            .addOnSuccessListener(result -> {
                if (result instanceof FeatureAvailabilityResult.Available) {
                    requestTokenForCurrentProject(call);
                    return;
                }

                dispatchRegistrationError(
                    "RuStore Push недоступен на этом устройстве: " + result
                );
                call.resolve(new JSObject());
            })
            .addOnFailureListener(throwable -> {
                dispatchRegistrationError(getErrorMessage(throwable));
                call.resolve(new JSObject());
            });
    }

    @PluginMethod
    public void unregister(PluginCall call) {
        RuStorePushClient.INSTANCE.deleteToken()
            .addOnSuccessListener(result -> {
                getPushPreferences().edit().remove(PREF_PROJECT_ID).apply();
                call.resolve();
            })
            .addOnFailureListener(throwable -> call.reject(getErrorMessage(throwable)));
    }

    @PluginMethod
    public void clearNotificationsForTopic(PluginCall call) {
        Long stateAt = call.getLong("stateAt");
        if (stateAt != null && stateAt > 0L) {
            ChatNotificationDismissalHelper.dismissTopicNotification(
                getContext(),
                call.getString("topicId"),
                stateAt
            );
        } else {
            ChatNotificationHelper.dismissTopicNotifications(
                getContext(),
                call.getString("topicId")
            );
        }
        call.resolve();
    }

    @PluginMethod
    public void clearNotificationForMessage(PluginCall call) {
        ChatNotificationHelper.dismissMessageNotification(
            getContext(),
            call.getString("topicId"),
            call.getString("messageId")
        );
        call.resolve();
    }

    @PluginMethod
    public void clearAllNotifications(PluginCall call) {
        IncomingCallNotificationHelper.dismissAllIncomingCalls(getContext());
        ChatNotificationHelper.dismissAll(getContext());
        NotificationTapPlugin.clearPendingNotificationTap();
        pendingPushReceived.clear();
        call.resolve();
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        call.resolve(buildPermissionsResult());
    }

    public static void dispatchRegistration(String token) {
        if (token == null || token.trim().isEmpty()) {
            return;
        }

        JSObject payload = new JSObject();
        payload.put("value", token);
        pendingRegistration.add(payload);
        flushInstance();
    }

    public static void dispatchRegistrationError(String errorMessage) {
        JSObject payload = new JSObject();
        payload.put("error", errorMessage);
        pendingRegistrationError.add(payload);
        flushInstance();
    }

    public static void dispatchPushDeleted() {
        pendingPushDeleted.add(new JSObject());
        flushInstance();
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
            dataObject.put("rustore.message_id", messageId);
        }
        if (title != null) {
            payload.put("title", title);
        }
        if (body != null) {
            payload.put("body", body);
        }

        payload.put("data", dataObject);
        pendingPushReceived.add(payload);
        flushInstance();
    }

    private static void flushInstance() {
        RuStorePushPlugin currentInstance = instance;
        if (currentInstance != null) {
            currentInstance.flushPendingEvents();
        }
    }

    private void flushPendingEvents() {
        flushQueue(EVENT_REGISTRATION, pendingRegistration);
        flushQueue(EVENT_REGISTRATION_ERROR, pendingRegistrationError);
        flushQueue(EVENT_PUSH_RECEIVED, pendingPushReceived);
        flushQueue(EVENT_PUSH_DELETED, pendingPushDeleted);
    }

    private void flushQueue(String eventName, ConcurrentLinkedQueue<JSObject> queue) {
        JSObject payload;
        while ((payload = queue.poll()) != null) {
            notifyListeners(eventName, payload, true);
        }
    }

    private void requestTokenForCurrentProject(PluginCall call) {
        String currentProjectId = getContext().getString(
            sep.pksep.app.R.string.rustore_push_project_id
        );
        String previousProjectId = getPushPreferences().getString(PREF_PROJECT_ID, null);

        if (currentProjectId.equals(previousProjectId)) {
            requestToken(call, currentProjectId);
            return;
        }

        RuStorePushClient.INSTANCE.deleteToken()
            .addOnSuccessListener(result -> requestToken(call, currentProjectId))
            .addOnFailureListener(throwable -> requestToken(call, currentProjectId));
    }

    private void requestToken(PluginCall call, String projectId) {
        RuStorePushClient.INSTANCE.getToken()
            .addOnSuccessListener(token -> {
                JSObject payload = new JSObject();
                payload.put("value", token);
                getPushPreferences().edit().putString(PREF_PROJECT_ID, projectId).apply();
                dispatchRegistration(token);
                call.resolve(payload);
            })
            .addOnFailureListener(throwable -> {
                dispatchRegistrationError(getErrorMessage(throwable));
                call.resolve(new JSObject());
            });
    }

    private SharedPreferences getPushPreferences() {
        return getContext().getSharedPreferences(
            PUSH_PREFERENCES,
            Context.MODE_PRIVATE
        );
    }

    private JSObject buildPermissionsResult() {
        JSObject result = new JSObject();

        if (
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            result.put("receive", "granted");
            return result;
        }

        PermissionState permissionState = getPermissionState("receive");
        boolean canPrompt =
            permissionState == PermissionState.PROMPT ||
            permissionState == PermissionState.PROMPT_WITH_RATIONALE;
        result.put("receive", canPrompt ? "prompt" : "denied");
        return result;
    }

    private String getErrorMessage(Throwable throwable) {
        if (throwable == null || throwable.getMessage() == null) {
            return "Неизвестная ошибка RuStore Push";
        }

        return throwable.getMessage();
    }
}
