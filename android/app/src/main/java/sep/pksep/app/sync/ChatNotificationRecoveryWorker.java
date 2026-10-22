package sep.pksep.app.sync;

import android.content.Context;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.IOException;
import org.json.JSONException;
import sep.pksep.app.MainActivity;

public final class ChatNotificationRecoveryWorker extends Worker {
    public ChatNotificationRecoveryWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        ChatBackgroundSyncStore.Session session = ChatBackgroundSyncStore.getSession(context);
        if (!session.isValid() || MainActivity.isAppInForeground() || isStopped()) return Result.success();
        try {
            ChatBackgroundSyncApi api = new ChatBackgroundSyncApi(session,
                new ChatNotificationSessionRefresher(context));
            ChatNotificationRecovery.reconcile(context, session, api, api.fetchTopics(50), () -> !isStopped());
            return Result.success();
        } catch (ChatBackgroundSyncApi.ApiException error) {
            return error.isAuthError() ? Result.success() : Result.retry();
        } catch (IOException | JSONException error) {
            Log.w("ChatNotificationRecovery", "Не удалось восстановить уведомления; повторим при доступной сети");
            return Result.retry();
        }
    }
}
