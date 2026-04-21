package sep.pksep.app;

import android.content.Context;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

public final class IncomingCallRingtonePlayer {
    private static Ringtone ringtone;

    private IncomingCallRingtonePlayer() {}

    public static synchronized void start(Context context) {
        if (context == null) {
            return;
        }

        if (ringtone != null && ringtone.isPlaying()) {
            return;
        }

        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ringtoneUri == null) {
            ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }

        if (ringtoneUri == null) {
            return;
        }

        ringtone = RingtoneManager.getRingtone(context.getApplicationContext(), ringtoneUri);
        if (ringtone == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ringtone.setLooping(true);
        }

        ringtone.play();
    }

    public static synchronized void stop() {
        if (ringtone == null) {
            return;
        }

        if (ringtone.isPlaying()) {
            ringtone.stop();
        }

        ringtone = null;
    }
}
