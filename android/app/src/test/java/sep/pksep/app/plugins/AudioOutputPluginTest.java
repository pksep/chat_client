package sep.pksep.app.plugins;

import static org.junit.Assert.assertEquals;

import android.media.AudioManager;

import org.junit.Test;

public class AudioOutputPluginTest {

    @Test
    public void getCallVolumeControlStream_usesSystemSelectedActiveStream() {
        assertEquals(
            AudioManager.USE_DEFAULT_STREAM_TYPE,
            AudioOutputPlugin.getCallVolumeControlStream()
        );
    }
}
