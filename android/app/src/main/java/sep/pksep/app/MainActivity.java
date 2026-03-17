package sep.pksep.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

import sep.pksep.app.plugins.AudioOutputPlugin;
import sep.pksep.app.plugins.ProximityLockPlugin;
import sep.pksep.app.plugins.CallScreenPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Регистрируем кастомный Capacitor plugin ДО super.onCreate(),
        // чтобы Bridge подхватил плагин при инициализации
        registerPlugin(AudioOutputPlugin.class);
        registerPlugin(ProximityLockPlugin.class);
        registerPlugin(CallScreenPlugin.class);

        super.onCreate(savedInstanceState);
    }
}