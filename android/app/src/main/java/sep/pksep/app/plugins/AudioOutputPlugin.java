package sep.pksep.app.plugins;

import android.media.AudioManager;
import android.content.Context;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AudioOutput")
public class AudioOutputPlugin extends Plugin {

    @SuppressWarnings("deprecation")
    @PluginMethod
    public void toggleAudio(PluginCall call) {

        boolean useSpeaker = call.getBoolean("useSpeaker", true);

        Log.d("AudioOutputPlugin", "toggleAudio called. useSpeaker=" + useSpeaker);

        AudioManager audioManager =
                (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);

        if (audioManager != null) {

            Log.d("AudioOutputPlugin", "AudioManager found");

            // режим VoIP
            audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);

            if (useSpeaker) {
                Log.d("AudioOutputPlugin", "Switching to SPEAKER");
                audioManager.setSpeakerphoneOn(true);
            } else {
                Log.d("AudioOutputPlugin", "Switching to EARPIECE");
                audioManager.setSpeakerphoneOn(false);
            }

        } else {
            Log.e("AudioOutputPlugin", "AudioManager is NULL");
        }

        call.resolve();
    }
}
