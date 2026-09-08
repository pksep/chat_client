package sep.pksep.app.plugins;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import sep.pksep.app.MainActivity;

@CapacitorPlugin(name = "LaunchStartup")
public class LaunchStartupPlugin extends Plugin {
    @PluginMethod
    public void reveal(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).revealStartupOverlay();
        }

        call.resolve();
    }

    @PluginMethod
    public void ready(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).hideStartupOverlayAndReleaseSplash();
        }

        call.resolve();
    }

    @PluginMethod
    public void setTheme(PluginCall call) {
        Boolean isDarkTheme = call.getBoolean("dark");
        if (isDarkTheme == null) {
            call.reject("The dark theme flag is required");
            return;
        }

        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).setLaunchDarkTheme(isDarkTheme);
        }

        call.resolve();
    }
}
