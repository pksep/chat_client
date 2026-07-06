package sep.pksep.app.plugins;

import static org.junit.Assert.assertEquals;

import android.media.AudioManager;

import org.junit.Test;

public class AudioOutputPluginTest {

    @Test
    public void getVolumeControlStreamForRoute_usesMusicForSpeaker() {
        assertEquals(
            AudioManager.STREAM_MUSIC,
            AudioOutputPlugin.getVolumeControlStreamForRoute("speaker")
        );
    }

    @Test
    public void getVolumeControlStreamForRoute_usesVoiceCallForConversationRoutes() {
        assertEquals(
            AudioManager.STREAM_VOICE_CALL,
            AudioOutputPlugin.getVolumeControlStreamForRoute("earpiece")
        );
        assertEquals(
            AudioManager.STREAM_VOICE_CALL,
            AudioOutputPlugin.getVolumeControlStreamForRoute("bluetooth")
        );
    }
}
