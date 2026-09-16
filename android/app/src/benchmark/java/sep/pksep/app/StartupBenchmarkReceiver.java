package sep.pksep.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.util.HashMap;
import java.util.Map;

// Только локальная benchmark-сборка и adb shell; сообщения на сервер не отправляются.
public class StartupBenchmarkReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (!BuildConfig.CHAT_STARTUP_BENCHMARK) return;
        if (intent.getBooleanExtra("terminateOnly", false)) {
            // Закрываем задачу и выгружаем процесс, не удаляя настоящие push-карточки.
            android.app.ActivityManager manager =
                (android.app.ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (manager != null) {
                for (android.app.ActivityManager.AppTask task : manager.getAppTasks()) {
                    task.finishAndRemoveTask();
                }
            }
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
                () -> android.os.Process.killProcess(android.os.Process.myPid()), 300L
            );
            return;
        }
        String topicId = intent.getStringExtra("topicId");
        if (!BuildConfig.CHAT_STARTUP_BENCHMARK || topicId == null ||
            !topicId.matches("[0-9a-fA-F-]{36}")) return;
        Map<String, String> payload = new HashMap<>();
        payload.put("topicId", topicId);
        payload.put("messageId", intent.getStringExtra("messageId"));
        payload.put("topicType", "GROUP".equals(intent.getStringExtra("topicType")) ? "GROUP" : "DM");
        ChatNotificationHelper.showChatMessage(
            context, payload, "Проверка открытия", "Локальная проверка скорости открытия чата"
        );
        if (intent.getBooleanExtra("terminateAfterPost", false)) {
            // Моделируем выгрузку процесса системой, сохраняя PendingIntent карточки.
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(
                () -> android.os.Process.killProcess(android.os.Process.myPid()), 2000L
            );
        }
    }
}
