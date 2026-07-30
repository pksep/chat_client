package sep.pksep.app.plugins;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import sep.pksep.app.MainActivity;

@CapacitorPlugin(name = "LaunchStartup")
public class LaunchStartupPlugin extends Plugin {
    @PluginMethod
    public void ready(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).hideStartupOverlayAndReleaseSplash();
        }

        call.resolve();
    }
}
