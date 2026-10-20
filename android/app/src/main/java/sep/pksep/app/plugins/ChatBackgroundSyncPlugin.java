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
import sep.pksep.app.sync.ChatStartupHistory;
import sep.pksep.app.sync.ChatStartupReads;
import sep.pksep.app.BuildConfig;

@CapacitorPlugin(name = "ChatBackgroundSync")
public class ChatBackgroundSyncPlugin extends Plugin {
    @PluginMethod
    public void prepareStartupReads(PluginCall call) {
        markStartupHistory("startup-reads-bridge-prepare");
        ChatStartupReads.prepare(getContext(), call.getString("token", ""))
            .thenAccept(reads -> {
                markStartupHistory("startup-reads-bridge-prepared");
                call.resolve(reads == null ? new JSObject().put("available", false) : toJsObject(reads));
            });
    }

    @PluginMethod
    public void takeStartupRead(PluginCall call) {
        markStartupHistory("startup-read-bridge-take");
        ChatStartupReads.take(getContext(), call.getString("token", ""),
            call.getString("apiUrl", ""), call.getString("endpoint", ""))
            .thenAccept(read -> {
                JSObject result = new JSObject().put("available", read != null);
                if (read != null) result.put("data", read.data).put("startedAt", read.startedAt);
                markStartupHistory("startup-read-bridge-resolve");
                call.resolve(result);
            });
    }

    @PluginMethod
    public void saveStartupReadPlan(PluginCall call) {
        ChatStartupReads.savePlan(getContext(), call.getString("token", ""),
            call.getString("apiUrl", ""), call.getArray("endpoints", new com.getcapacitor.JSArray()));
        call.resolve();
    }

    @PluginMethod
    public void prepareStartupHistory(PluginCall call) {
        markStartupHistory("history-bridge-prepare");
        ChatStartupHistory.prepare(getContext()).thenAccept(result -> {
            markStartupHistory("history-bridge-prepared");
            call.resolve(result == null ? new JSObject().put("available", false) : toJsObject(result));
        });
    }

    @PluginMethod
    public void takeStartupHistory(PluginCall call) {
        markStartupHistory("history-bridge-take");
        ChatStartupHistory.take(getContext(), call.getString("userId", ""),
                call.getString("apiUrl", ""), call.getString("topicId", ""))
            .thenAccept(rows -> {
                JSObject result = new JSObject();
                result.put("available", rows != null);
                if (rows != null) result.put("data", rows);
                markStartupHistory("history-bridge-resolve");
                call.resolve(result);
            });
    }

    private static void markStartupHistory(String stage) {
        if (BuildConfig.CHAT_STARTUP_BENCHMARK) {
            android.util.Log.i("ChatStartupBenchmark", stage + " " + System.currentTimeMillis());
        }
    }

    @PluginMethod
    public void saveSession(PluginCall call) {
        String token = call.getString("token", "");
        String userId = call.getString("userId", "");
        String apiUrl = call.getString("apiUrl", "");

        if (isBlank(token) || isBlank(apiUrl)) {
            call.reject("token and apiUrl are required");
            return;
        }

        boolean changed = ChatBackgroundSyncStore.saveSession(getContext(), token, userId, apiUrl);

        JSObject result = new JSObject();
        result.put("saved", true);
        // Повторное сохранение той же сессии не читает большой XML истории.
        if (changed) result.put("status", toJsObject(ChatBackgroundSyncStore.getStatus(getContext())));
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
