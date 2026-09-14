package sep.pksep.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.HashMap;
import java.util.Map;

// Только debug APK и adb shell: настоящие PendingIntent без внешнего push-сервера.
public class PerformanceNotificationReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String topicId = intent.getStringExtra("topicId");
        if (!BuildConfig.DEBUG || topicId == null || !topicId.startsWith("29400000-")) {
            return;
        }
        Map<String, String> payload = new HashMap<>();
        payload.put("topicId", topicId);
        payload.put("messageId", intent.getStringExtra("messageId"));
        payload.put("topicType", "DM");
        ChatNotificationHelper.showChatMessage(
            context,
            payload,
            "CHAT-294 " + topicId.substring(topicId.length() - 2),
            "Проверка открытия тестового чата"
        );
    }
}
