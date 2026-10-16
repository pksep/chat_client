package sep.pksep.app.upload;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.work.*;
import org.json.JSONObject;
import java.io.File;
import java.util.concurrent.TimeUnit;
import sep.pksep.app.sync.ChatBackgroundSyncStore;

public final class NativeUploadWorker extends Worker {
    public NativeUploadWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }
    public static void enqueue(Context context, String id) throws Exception {
        OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(NativeUploadWorker.class)
            .setInputData(new Data.Builder().putString("id", id).build())
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS).build();
        WorkManager.getInstance(context).enqueueUniqueWork("message-upload-" + id, ExistingWorkPolicy.KEEP, work).getResult().get();
    }
    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext(); String id = getInputData().getString("id");
        JSONObject state = null;
        try {
            state = NativeUploadStore.read(context, id);
            if (state == null || "completed".equals(state.optString("status")) || "cancelled".equals(state.optString("status"))) return Result.success();
            JSONObject job = state;
            ChatBackgroundSyncStore.Session session = checkedSession(job);
            setForegroundAsync(notification(id)).get();
            job.put("status", "uploading"); NativeUploadStore.saveActive(context, id, job);
            NativeUploadApi api = new NativeUploadApi(session.apiUrl, () -> checkedSession(job).token);
            final long[] lastProgress = { 0 };
            JSONObject result = NativeUploadTask.run(job, NativeUploadStore.directory(context, id), api,
                checkpoint -> NativeUploadStore.saveActive(context, id, checkpoint),
                (index, percent) -> {
                    if (System.currentTimeMillis() - lastProgress[0] < 500 && percent < 100) return;
                    lastProgress[0] = System.currentTimeMillis();
                    try { job.put("fileIndex", index).put("percent", percent); NativeUploadStore.saveActive(context, id, job); }
                    catch (Exception ignored) { /* Следующая контрольная точка сохранит состояние. */ }
                });
            job.put("result", result).put("status", "completed"); NativeUploadStore.saveActive(context, id, job);
            for (int i = 0; i < job.getJSONArray("files").length(); i++)
                new File(NativeUploadStore.directory(context, id), i + ".bin").delete();
            return Result.success();
        } catch (Exception error) {
            if (error instanceof java.util.concurrent.CancellationException || isStopped()) return Result.failure();
            boolean retry = !(error instanceof SecurityException) &&
                (!(error instanceof NativeUploadApi.ApiException) || ((NativeUploadApi.ApiException) error).retryable() ||
                    ((NativeUploadApi.ApiException) error).status == 404) && getRunAttemptCount() < 8;
            try {
                if (state != null) {
                    state.put("status", retry ? "queued" : "failed");
                    state.put("error", error instanceof NativeUploadApi.ApiException ? error.getMessage() : "Не удалось отправить вложение");
                    NativeUploadStore.saveActive(context, id, state);
                }
            } catch (Exception ignored) { }
            return retry ? Result.retry() : Result.failure();
        }
    }
    private ChatBackgroundSyncStore.Session checkedSession(JSONObject job) {
        ChatBackgroundSyncStore.Session session = ChatBackgroundSyncStore.getSession(getApplicationContext());
        if (!session.isValid() || !session.userId.equals(job.optString("userId")) ||
            !session.apiUrl.equals(job.optString("apiUrl"))) throw new SecurityException("Сессия отправителя изменилась");
        try {
            JSONObject current = NativeUploadStore.read(getApplicationContext(), job.getString("id"));
            if (current != null && "cancelled".equals(current.optString("status"))) throw new java.util.concurrent.CancellationException();
        } catch (java.util.concurrent.CancellationException error) { throw error; }
        catch (Exception error) { throw new IllegalStateException(error); }
        return session;
    }
    private ForegroundInfo notification(String id) {
        Context context = getApplicationContext(); String channel = "chat-file-upload";
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(
            new NotificationChannel(channel, "Отправка файлов", NotificationManager.IMPORTANCE_LOW));
        android.app.Notification notification = new NotificationCompat.Builder(context, channel)
            .setSmallIcon(android.R.drawable.stat_sys_upload).setContentTitle("Отправляем сообщение")
            .setContentText("Файлы продолжают отправляться в фоне").setOngoing(true).setProgress(0, 0, true).build();
        int notificationId = 20000 + (id.hashCode() & 0x3fff);
        return Build.VERSION.SDK_INT >= 29
            ? new ForegroundInfo(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
            : new ForegroundInfo(notificationId, notification);
    }
}
