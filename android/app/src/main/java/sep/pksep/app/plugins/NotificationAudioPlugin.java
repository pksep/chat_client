package sep.pksep.app.plugins;

import android.app.NotificationManager;
import android.content.res.AssetFileDescriptor;
import android.content.Context;
import android.media.AudioManager;
import android.media.MediaPlayer;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NotificationAudio")
public class NotificationAudioPlugin extends Plugin {
    private static final String NEW_MESSAGE_SOUND_ASSET = "public/audio/new-message.mp3";
    private static final String CALL_RINGTONE_ASSET = "public/audio/ringtone.mp3";

    private MediaPlayer callRingtonePlayer;
    private MediaPlayer notificationPlayer;

    @PluginMethod
    public void getNotificationSoundPolicy(PluginCall call) {
        Context context = getContext();
        JSObject result = new JSObject();

        if (context == null) {
            result.put("allowSound", true);
            result.put("notificationsEnabled", true);
            result.put("ringerMode", "unknown");
            result.put("ringerVolume", -1);
            call.resolve(result);
            return;
        }

        NotificationManagerCompat notificationManager =
            NotificationManagerCompat.from(context);
        AudioManager audioManager =
            (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);

        boolean notificationsEnabled = notificationManager.areNotificationsEnabled();
        int ringerMode =
            audioManager != null
                ? audioManager.getRingerMode()
                : AudioManager.RINGER_MODE_NORMAL;
        int ringerVolume =
            audioManager != null
                ? audioManager.getStreamVolume(AudioManager.STREAM_RING)
                : -1;

        boolean isSilentOrVibrate = ringerMode != AudioManager.RINGER_MODE_NORMAL;
        boolean allowSound =
            notificationsEnabled &&
            !isSilentOrVibrate &&
            (ringerVolume != 0);

        result.put("allowSound", allowSound);
        result.put("notificationsEnabled", notificationsEnabled);
        result.put("ringerMode", mapRingerMode(ringerMode));
        result.put("ringerVolume", ringerVolume);

        NotificationManager manager =
            (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            result.put(
                "interruptionFilter",
                mapInterruptionFilter(manager.getCurrentInterruptionFilter())
            );
        }

        call.resolve(result);
    }

    @PluginMethod
    public void playNotificationSound(PluginCall call) {
        try {
            stopNotificationPlayer();

            MediaPlayer player = buildAssetPlayer(NEW_MESSAGE_SOUND_ASSET, false);
            if (player == null) {
                call.reject("Notification sound unavailable");
                return;
            }

            notificationPlayer = player;
            notificationPlayer.setOnCompletionListener(completedPlayer -> {
                completedPlayer.release();
                if (notificationPlayer == completedPlayer) {
                    notificationPlayer = null;
                }
            });
            notificationPlayer.setOnErrorListener((failedPlayer, what, extra) -> {
                failedPlayer.release();
                if (notificationPlayer == failedPlayer) {
                    notificationPlayer = null;
                }
                return true;
            });
            notificationPlayer.start();
            call.resolve();
        } catch (Exception error) {
            call.reject("Failed to play notification sound", error);
        }
    }

    @PluginMethod
    public void playCallRingtone(PluginCall call) {
        try {
            if (!canPlayCallRingtone()) {
                stopCallRingtonePlayer();
                call.resolve();
                return;
            }

            stopCallRingtonePlayer();

            callRingtonePlayer = buildAssetPlayer(CALL_RINGTONE_ASSET, true);
            if (callRingtonePlayer == null) {
                call.reject("Call ringtone unavailable");
                return;
            }

            callRingtonePlayer.setOnErrorListener((failedPlayer, what, extra) -> {
                failedPlayer.release();
                if (callRingtonePlayer == failedPlayer) {
                    callRingtonePlayer = null;
                }
                return true;
            });
            callRingtonePlayer.start();
            call.resolve();
        } catch (Exception error) {
            call.reject("Failed to play call ringtone", error);
        }
    }

    @PluginMethod
    public void stopCallRingtone(PluginCall call) {
        stopCallRingtonePlayer();
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopNotificationPlayer();
        stopCallRingtonePlayer();
        super.handleOnDestroy();
    }

    private void stopNotificationPlayer() {
        if (notificationPlayer != null) {
            if (notificationPlayer.isPlaying()) {
                notificationPlayer.stop();
            }
            notificationPlayer.release();
            notificationPlayer = null;
        }
    }

    private void stopCallRingtonePlayer() {
        if (callRingtonePlayer != null) {
            if (callRingtonePlayer.isPlaying()) {
                callRingtonePlayer.stop();
            }
            callRingtonePlayer.release();
            callRingtonePlayer = null;
        }
    }

    private boolean canPlayCallRingtone() {
        Context context = getContext();
        if (context == null) {
            return true;
        }

        NotificationManagerCompat notificationManager =
            NotificationManagerCompat.from(context);
        if (!notificationManager.areNotificationsEnabled()) {
            return false;
        }

        AudioManager audioManager =
            (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            return true;
        }

        int ringerMode = audioManager.getRingerMode();
        int ringerVolume = audioManager.getStreamVolume(AudioManager.STREAM_RING);

        return ringerMode == AudioManager.RINGER_MODE_NORMAL && ringerVolume > 0;
    }

    @SuppressWarnings("deprecation")
    private MediaPlayer buildAssetPlayer(String assetPath, boolean loop) throws Exception {
        Context context = getContext();
        if (context == null) {
            return null;
        }

        try (AssetFileDescriptor assetFileDescriptor =
            context.getAssets().openFd(assetPath)) {
            MediaPlayer player = new MediaPlayer();
            player.setAudioStreamType(AudioManager.STREAM_RING);
            player.setDataSource(
                assetFileDescriptor.getFileDescriptor(),
                assetFileDescriptor.getStartOffset(),
                assetFileDescriptor.getLength()
            );
            player.setLooping(loop);
            player.prepare();
            return player;
        }
    }

    private String mapRingerMode(int ringerMode) {
        if (ringerMode == AudioManager.RINGER_MODE_SILENT) {
            return "silent";
        }

        if (ringerMode == AudioManager.RINGER_MODE_VIBRATE) {
            return "vibrate";
        }

        if (ringerMode == AudioManager.RINGER_MODE_NORMAL) {
            return "normal";
        }

        return "unknown";
    }

    private String mapInterruptionFilter(int interruptionFilter) {
        if (interruptionFilter == NotificationManager.INTERRUPTION_FILTER_NONE) {
            return "none";
        }

        if (interruptionFilter == NotificationManager.INTERRUPTION_FILTER_PRIORITY) {
            return "priority";
        }

        if (interruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALARMS) {
            return "alarms";
        }

        if (interruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALL) {
            return "all";
        }

        return "unknown";
    }
}
