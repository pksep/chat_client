package sep.pksep.app.plugins;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.Iterator;

import sep.pksep.app.sync.ChatBackgroundSyncScheduler;
import sep.pksep.app.sync.ChatBackgroundSyncStore;

@CapacitorPlugin(name = "ChatBackgroundSync")
public class ChatBackgroundSyncPlugin extends Plugin {
    @PluginMethod
    public void saveSession(PluginCall call) {
        String token = call.getString("token", "");
        String userId = call.getString("userId", "");
        String apiUrl = call.getString("apiUrl", "");

        if (isBlank(token) || isBlank(apiUrl)) {
            call.reject("token and apiUrl are required");
            return;
        }

        ChatBackgroundSyncStore.saveSession(getContext(), token, userId, apiUrl);

        JSObject result = new JSObject();
        result.put("saved", true);
        result.put("status", toJsObject(ChatBackgroundSyncStore.getStatus(getContext())));
        call.resolve(result);
    }

    @PluginMethod
    public void syncAuthSession(PluginCall call) {
        saveSession(call);
    }

    @PluginMethod
    public void clearSession(PluginCall call) {
        ChatBackgroundSyncStore.clearSession(getContext());

        JSObject result = new JSObject();
        result.put("cleared", true);
        result.put("status", toJsObject(ChatBackgroundSyncStore.getStatus(getContext())));
        call.resolve(result);
    }

    @PluginMethod
    public void getSnapshot(PluginCall call) {
        call.resolve(toJsObject(ChatBackgroundSyncStore.getSnapshot(getContext())));
    }

    @PluginMethod
    public void requestSync(PluginCall call) {
        String reason = call.getString("reason", "manual");
        String topicId = call.getString("topicId", null);
        String pts = call.getString("pts", null);
        String eventId = call.getString("eventId", null);

        ChatBackgroundSyncScheduler.enqueue(
            getContext(),
            reason,
            topicId,
            pts,
            eventId
        );

        JSObject result = new JSObject();
        result.put("scheduled", true);
        result.put("status", toJsObject(ChatBackgroundSyncStore.getStatus(getContext())));
        call.resolve(result);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(toJsObject(ChatBackgroundSyncStore.getStatus(getContext())));
    }

    private JSObject toJsObject(JSONObject source) {
        JSObject result = new JSObject();
        Iterator<String> keys = source.keys();

        while (keys.hasNext()) {
            String key = keys.next();
            result.put(key, source.opt(key));
        }

        return result;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
