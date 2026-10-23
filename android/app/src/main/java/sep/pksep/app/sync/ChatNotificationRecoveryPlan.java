package sep.pksep.app.sync;

import org.json.JSONArray;
import org.json.JSONObject;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

final class ChatNotificationRecoveryPlan {
    final Map<String, String> data;
    final String title;
    final String body;
    final JSONArray messages;

    private ChatNotificationRecoveryPlan(Map<String, String> data, String title, String body, JSONArray messages) {
        this.data = data;
        this.title = title;
        this.body = body;
        this.messages = messages;
    }

    static boolean shouldFetch(JSONObject topic) {
        JSONObject info = topic.optJSONObject("info");
        return topic.optInt("unreadMessageCount", 0) > 0 &&
            (info == null || !info.optBoolean("isMute") || topic.optBoolean("taggedMe"));
    }

    static ChatNotificationRecoveryPlan build(String userId, JSONObject topic, JSONArray rows) {
        if (!shouldFetch(topic)) return null;
        JSONObject info = topic.optJSONObject("info");
        boolean muted = info != null && info.optBoolean("isMute");
        List<JSONObject> messages = new ArrayList<>();
        for (int index = 0; index < rows.length(); index++) {
            JSONObject message = rows.optJSONObject(index);
            if (message == null || message.optString("id").isEmpty() ||
                message.optString("senderUserId").isEmpty() || userId.equals(message.optString("senderUserId")) ||
                message.optBoolean("isReadByMe", true) || message.optBoolean("isSystem") ||
                !message.isNull("deletedAt") || timestamp(message) <= 0L ||
                (muted && !message.optBoolean("taggedMe"))) continue;
            messages.add(message);
        }
        if (messages.isEmpty()) return null;
        messages.sort(Comparator.comparingLong(ChatNotificationRecoveryPlan::timestamp)
            .thenComparing(message -> message.optString("id")));
        JSONObject latest = messages.get(messages.size() - 1);
        JSONObject sender = latest.optJSONObject("senderUser");
        String senderName = sender != null ? sender.optString("initials", "Собеседник") : "Собеседник";
        String title = "GROUP".equals(topic.optString("type")) ? topic.optString("name", "Чат") : senderName;
        String body = latest.optString("text", "");
        if (body.trim().isEmpty()) body = "Вложение";
        Map<String, String> data = new HashMap<>();
        data.put("topicId", topic.optString("id"));
        data.put("topicType", topic.optString("type"));
        data.put("messageId", latest.optString("id"));
        data.put("senderUserId", latest.optString("senderUserId"));
        data.put("senderName", senderName);
        data.put("senderAvatarUrl", sender != null ? sender.optString("avatarUrl", "") : "");
        data.put("conversationTitle", title);
        data.put("stateAt", String.valueOf(timestamp(latest)));
        data.put("unreadCount", String.valueOf(muted ? messages.size() : topic.optInt("unreadMessageCount")));
        return new ChatNotificationRecoveryPlan(data, title, body,
            new JSONArray(messages.subList(Math.max(0, messages.size() - 25), messages.size())));
    }

    private static long timestamp(JSONObject message) {
        try { return Instant.parse(message.optString("createdAt")).toEpochMilli(); }
        catch (RuntimeException ignored) { return 0L; }
    }
}
