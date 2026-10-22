package sep.pksep.app.sync;

import android.content.Context;
import android.app.NotificationManager;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.IOException;
import java.util.function.BooleanSupplier;
import sep.pksep.app.ChatNotificationHelper;
import sep.pksep.app.MainActivity;

final class ChatNotificationRecovery {
    static void reconcile(Context context, ChatBackgroundSyncStore.Session expected,
                          ChatBackgroundSyncApi api, JSONArray topics) throws IOException, JSONException {
        reconcile(context, expected, api, topics, () -> true);
    }

    static void reconcile(Context context, ChatBackgroundSyncStore.Session expected,
                          ChatBackgroundSyncApi api, JSONArray topics, BooleanSupplier active) throws IOException, JSONException {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (MainActivity.isAppInForeground() || manager == null || !manager.areNotificationsEnabled()) return;
        // Обходим все непрочитанные чаты, независимо от лимита кеширования истории.
        for (int i = 0; i < topics.length(); i++) {
            ChatBackgroundSyncStore.Session current = ChatBackgroundSyncStore.getSession(context);
            if (!active.getAsBoolean() || !current.isValid() || !expected.userId.equals(current.userId) ||
                !expected.apiUrl.equals(current.apiUrl) || MainActivity.isAppInForeground()) return;
            JSONObject topic = topics.optJSONObject(i);
            if (topic == null || !ChatNotificationRecoveryPlan.shouldFetch(topic)) continue;
            JSONArray messages;
            JSONObject info = topic.optJSONObject("info");
            try { messages = api.fetchUnreadNotificationMessages(topic.getString("id"),
                info != null && info.optBoolean("isMute")); }
            catch (ChatBackgroundSyncApi.ApiException error) {
                // Доступ мог исчезнуть между запросами списка чатов и сообщений.
                if (error.statusCode == 403 || error.isNotFound()) continue;
                throw error;
            }
            ChatNotificationRecoveryPlan plan = ChatNotificationRecoveryPlan.build(
                expected.userId, topic, messages
            );
            current = ChatBackgroundSyncStore.getSession(context);
            if (!active.getAsBoolean() || !current.isValid() || !expected.userId.equals(current.userId) ||
                !expected.apiUrl.equals(current.apiUrl)) return;
            if (plan != null) ChatNotificationHelper.showRecoveredChatMessage(
                context, expected, plan.data, plan.title, plan.body, plan.messages
            );
        }
    }
}
