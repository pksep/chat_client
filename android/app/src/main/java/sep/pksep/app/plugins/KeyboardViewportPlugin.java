package sep.pksep.app.plugins;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import sep.pksep.app.MainActivity;

@CapacitorPlugin(name = "KeyboardViewport")
public class KeyboardViewportPlugin extends Plugin {
    @PluginMethod public void setOverlayOpen(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).setChatKeyboardOverlayOpen(Boolean.TRUE.equals(call.getBoolean("open")));
            }
            call.resolve();
        });
    }

    @PluginMethod public void start(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).setChatKeyboardViewportEnabled(true);
            }
            call.resolve();
        });
    }

    @PluginMethod public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).setChatKeyboardViewportEnabled(false);
            }
            call.resolve();
        });
    }
}
