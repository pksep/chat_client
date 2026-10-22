package sep.pksep.app;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.function.Supplier;

public final class IncomingCallRingtonePlayer {
    private static final String TAG = "IncomingCallRingtone";
    private static final String SOURCE_SYSTEM = "system";
    private static final String SOURCE_ASSET = "asset";
    private static final Handler handler = new Handler(Looper.getMainLooper());
    private static final CallRingtoneSession session = new CallRingtoneSession(
        new CallRingtoneSession.Scheduler() {
            public void postDelayed(Runnable callback, long delayMs) {
                handler.postDelayed(callback, delayMs);
            }

            public void removeCallbacks(Runnable callback) {
                handler.removeCallbacks(callback);
            }
        }
    );

    private IncomingCallRingtonePlayer() {}

    public static void start(Context context, String roomId) {
        if (context == null) return;
        Context appContext = context.getApplicationContext();
        startPlayback(appContext, roomId, SOURCE_SYSTEM, () -> {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (uri == null) return null;
            Ringtone ringtone = RingtoneManager.getRingtone(appContext, uri);
            if (ringtone == null) return null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.setLooping(true);
            return new CallRingtoneSession.Playback() {
                public void start() {
                    ringtone.play();
                }

                public void stop() {
                    try {
                        ringtone.stop();
                    } catch (RuntimeException error) {
                        Log.w(TAG, "Не удалось остановить системный рингтон", error);
                    }
                }
            };
        });
    }

    @SuppressWarnings("deprecation")
    public static void startAsset(Context context, String roomId) {
        if (context == null) return;
        Context appContext = context.getApplicationContext();
        startPlayback(appContext, roomId, SOURCE_ASSET, () -> {
            MediaPlayer player = new MediaPlayer();
            try (AssetFileDescriptor asset = appContext.getAssets().openFd("public/audio/ringtone.mp3")) {
                player.setAudioStreamType(AudioManager.STREAM_RING);
                player.setDataSource(asset.getFileDescriptor(), asset.getStartOffset(), asset.getLength());
                player.setLooping(true);
                player.prepare();
            } catch (Exception error) {
                player.release();
                throw new IllegalStateException("Не удалось загрузить рингтон", error);
            }
            return new CallRingtoneSession.Playback() {
                public void start() {
                    player.start();
                }

                public void stop() {
                    try {
                        player.stop();
                    } catch (RuntimeException error) {
                        Log.w(TAG, "Не удалось остановить рингтон приложения", error);
                    } finally {
                        player.release();
                    }
                }
            };
        });
    }

    private static void startPlayback(
        Context context,
        String roomId,
        String source,
        Supplier<CallRingtoneSession.Playback> factory
    ) {
        try {
            // Отмена из push и отложенный запуск из WebView выполняются атомарно.
            synchronized (IncomingCallNotificationHelper.class) {
                if (roomId != null && !IncomingCallNotificationHelper.shouldShowIncomingCall(
                    context, roomId, null, null, System.currentTimeMillis()
                )) return;
                session.start(roomId, source, factory, () -> {
                    if (roomId == null) IncomingCallNotificationHelper.dismissAllIncomingCalls(context);
                    else IncomingCallNotificationHelper.dismissIncomingCall(context, roomId);
                });
            }
        } catch (RuntimeException error) {
            Log.w(TAG, "Не удалось включить рингтон", error);
        }
    }

    public static void stop(String roomId) {
        session.stop(roomId);
    }

    public static void stop() {
        session.stop(null);
    }

    public static void stopAsset() {
        session.stopSource(SOURCE_ASSET);
    }
}
