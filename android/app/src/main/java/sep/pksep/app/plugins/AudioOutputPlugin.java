package sep.pksep.app.plugins;

import android.Manifest;
import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.List;

@CapacitorPlugin(
    name = "AudioOutput",
    permissions = {
        @Permission(
            alias = "bluetoothConnect",
            strings = { Manifest.permission.BLUETOOTH_CONNECT }
        )
    }
)
public class AudioOutputPlugin extends Plugin {
    private static final String TAG = "AudioOutputPlugin";
    static final String BLUETOOTH_CONNECT_PERMISSION = "bluetoothConnect";
    private static final String ROUTE_AUTO = "auto";
    private static final String ROUTE_BLUETOOTH = "bluetooth";
    private static final String ROUTE_EARPIECE = "earpiece";
    private static final String ROUTE_SPEAKER = "speaker";
    private static final String EVENT_AUDIO_ROUTE_CHANGED = "audioRouteChanged";
    private AudioDeviceCallback audioDeviceCallback;
    private String lastAppliedRoute = ROUTE_EARPIECE;

    @Override
    public void load() {
        super.load();
        registerAudioDeviceCallback();
    }

    @Override
    protected void handleOnDestroy() {
        unregisterAudioDeviceCallback();
        super.handleOnDestroy();
    }

    @PluginMethod
    public void getState(PluginCall call) {
        if (requestBluetoothPermissionIfNeeded(call)) {
            return;
        }

        resolveState(call, null);
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        String route = call.getString("route", null);
        if (route != null) {
            resolveRoute(call);
            return;
        }

        if (call.getBoolean("useSpeaker") != null) {
            resolveToggle(call);
            return;
        }

        resolveState(call, null);
    }

    private void resolveState(PluginCall call, String resolvedRoute) {
        AudioManager audioManager = getAudioManager();
        if (audioManager == null) {
            call.reject("AudioManager is unavailable");
            return;
        }

        configureForCall(audioManager);
        call.resolve(buildState(audioManager, resolvedRoute));
    }

    @PluginMethod
    public void setRoute(PluginCall call) {
        if (requestBluetoothPermissionIfNeeded(call)) {
            return;
        }

        resolveRoute(call);
    }

    private void resolveRoute(PluginCall call) {
        AudioManager audioManager = getAudioManager();
        if (audioManager == null) {
            call.reject("AudioManager is unavailable");
            return;
        }

        configureForCall(audioManager);

        String requestedRoute = call.getString("route", ROUTE_AUTO);
        String resolvedRoute = resolveRequestedRoute(audioManager, requestedRoute);
        String appliedRoute = applyRoute(audioManager, resolvedRoute);
        lastAppliedRoute = appliedRoute;
        call.resolve(buildState(audioManager, appliedRoute));
    }

    private boolean requestBluetoothPermissionIfNeeded(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return false;
        }

        if (getPermissionState(BLUETOOTH_CONNECT_PERMISSION) == PermissionState.GRANTED) {
            return false;
        }

        requestPermissionForAlias(
            BLUETOOTH_CONNECT_PERMISSION,
            call,
            "bluetoothPermissionCallback"
        );
        return true;
    }

    @PluginMethod
    public void toggleAudio(PluginCall call) {
        if (requestBluetoothPermissionIfNeeded(call)) {
            return;
        }

        resolveToggle(call);
    }

    private void resolveToggle(PluginCall call) {
        AudioManager audioManager = getAudioManager();
        if (audioManager == null) {
            call.reject("AudioManager is unavailable");
            return;
        }

        configureForCall(audioManager);

        boolean useSpeaker = call.getBoolean("useSpeaker", true);
        String resolvedRoute = useSpeaker
            ? ROUTE_SPEAKER
            : getDefaultConversationRoute(audioManager);

        String appliedRoute = applyRoute(audioManager, resolvedRoute);
        lastAppliedRoute = appliedRoute;
        call.resolve(buildState(audioManager, appliedRoute));
    }

    private void registerAudioDeviceCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        AudioManager audioManager = getAudioManager();
        if (audioManager == null || audioDeviceCallback != null) {
            return;
        }

        audioDeviceCallback = new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                notifyAudioRouteChanged();
            }

            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removedDevices) {
                notifyAudioRouteChanged();
            }
        };

        audioManager.registerAudioDeviceCallback(audioDeviceCallback, null);
    }

    private void unregisterAudioDeviceCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return;
        }

        AudioManager audioManager = getAudioManager();
        if (audioManager == null || audioDeviceCallback == null) {
            return;
        }

        audioManager.unregisterAudioDeviceCallback(audioDeviceCallback);
        audioDeviceCallback = null;
    }

    private void notifyAudioRouteChanged() {
        if (getActivity() == null) {
            dispatchAudioRouteChanged();
            return;
        }

        getActivity().runOnUiThread(this::dispatchAudioRouteChanged);
    }

    private void dispatchAudioRouteChanged() {
        AudioManager audioManager = getAudioManager();
        if (audioManager == null) {
            return;
        }

        String resolvedRoute = null;
        if (ROUTE_BLUETOOTH.equals(lastAppliedRoute) && !hasBluetoothRoute(audioManager)) {
            resolvedRoute = applyRoute(audioManager, ROUTE_EARPIECE);
            lastAppliedRoute = resolvedRoute;
        } else {
            lastAppliedRoute = getCurrentRoute(audioManager);
        }

        notifyListeners(
            EVENT_AUDIO_ROUTE_CHANGED,
            buildState(audioManager, resolvedRoute)
        );
    }

    private AudioManager getAudioManager() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private void configureForCall(AudioManager audioManager) {
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
    }

    private String resolveRequestedRoute(AudioManager audioManager, String requestedRoute) {
        if (ROUTE_SPEAKER.equals(requestedRoute)) {
            return ROUTE_SPEAKER;
        }

        if (ROUTE_EARPIECE.equals(requestedRoute)) {
            return ROUTE_EARPIECE;
        }

        if (ROUTE_BLUETOOTH.equals(requestedRoute) && hasBluetoothRoute(audioManager)) {
            return ROUTE_BLUETOOTH;
        }

        return getDefaultConversationRoute(audioManager);
    }

    private String getDefaultConversationRoute(AudioManager audioManager) {
        return hasBluetoothRoute(audioManager) ? ROUTE_BLUETOOTH : ROUTE_EARPIECE;
    }

    @SuppressWarnings("deprecation")
    private String applyRoute(AudioManager audioManager, String route) {
        Log.d(TAG, "Switching call audio route to " + route);

        if (ROUTE_BLUETOOTH.equals(route)) {
            if (trySetCommunicationDevice(audioManager, ROUTE_BLUETOOTH)) {
                audioManager.setSpeakerphoneOn(false);
                return ROUTE_BLUETOOTH;
            }

            try {
                audioManager.setSpeakerphoneOn(false);
                audioManager.startBluetoothSco();
                audioManager.setBluetoothScoOn(true);
                return ROUTE_BLUETOOTH;
            } catch (SecurityException error) {
                Log.w(TAG, "Bluetooth route is not permitted", error);
                return applyRoute(audioManager, ROUTE_EARPIECE);
            }
        }

        stopBluetoothSco(audioManager);

        if (ROUTE_SPEAKER.equals(route)) {
            if (!trySetCommunicationDevice(audioManager, ROUTE_SPEAKER)) {
                audioManager.setSpeakerphoneOn(true);
            }
            return ROUTE_SPEAKER;
        }

        if (!trySetCommunicationDevice(audioManager, ROUTE_EARPIECE)) {
            audioManager.setSpeakerphoneOn(false);
        }
        return ROUTE_EARPIECE;
    }

    @SuppressWarnings("deprecation")
    private void stopBluetoothSco(AudioManager audioManager) {
        try {
            audioManager.setBluetoothScoOn(false);
            audioManager.stopBluetoothSco();
        } catch (SecurityException error) {
            Log.w(TAG, "Failed to stop Bluetooth SCO", error);
        }
    }

    private boolean trySetCommunicationDevice(AudioManager audioManager, String route) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return false;
        }

        AudioDeviceInfo device = findCommunicationDevice(audioManager, route);
        if (device == null) {
            if (ROUTE_EARPIECE.equals(route)) {
                try {
                    audioManager.clearCommunicationDevice();
                } catch (SecurityException error) {
                    Log.w(TAG, "Failed to clear communication device", error);
                }
            }
            return false;
        }

        try {
            return audioManager.setCommunicationDevice(device);
        } catch (SecurityException error) {
            Log.w(TAG, "Failed to set communication device for " + route, error);
            return false;
        }
    }

    private AudioDeviceInfo findCommunicationDevice(AudioManager audioManager, String route) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
                for (AudioDeviceInfo device : devices) {
                    if (isDeviceForRoute(device, route)) {
                        return device;
                    }
                }
            } catch (SecurityException error) {
                Log.w(TAG, "Cannot read communication devices", error);
            }
        }

        try {
            AudioDeviceInfo[] devices = audioManager.getDevices(
                AudioManager.GET_DEVICES_OUTPUTS
            );
            for (AudioDeviceInfo device : devices) {
                if (isDeviceForRoute(device, route)) {
                    return device;
                }
            }
        } catch (SecurityException error) {
            Log.w(TAG, "Cannot read output devices", error);
        }

        return null;
    }

    @SuppressWarnings("deprecation")
    private JSObject buildState(AudioManager audioManager, String resolvedRoute) {
        boolean bluetoothAvailable = hasBluetoothRoute(audioManager);
        String currentRoute = resolvedRoute != null ? resolvedRoute : getCurrentRoute(audioManager);
        JSArray availableRoutes = new JSArray();

        availableRoutes.put(ROUTE_EARPIECE);
        availableRoutes.put(ROUTE_SPEAKER);

        if (bluetoothAvailable) {
            availableRoutes.put(ROUTE_BLUETOOTH);
        }

        JSObject result = new JSObject();
        result.put("currentRoute", currentRoute);
        result.put("defaultRoute", getDefaultConversationRoute(audioManager));
        result.put("availableRoutes", availableRoutes);
        result.put("bluetoothAvailable", bluetoothAvailable);

        return result;
    }

    @SuppressWarnings("deprecation")
    private String getCurrentRoute(AudioManager audioManager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                AudioDeviceInfo device = audioManager.getCommunicationDevice();
                if (device != null) {
                    if (isBluetoothDevice(device)) {
                        return ROUTE_BLUETOOTH;
                    }

                    if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                        return ROUTE_SPEAKER;
                    }

                    if (
                        device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE ||
                        device.getType() == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                        device.getType() == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                    ) {
                        return ROUTE_EARPIECE;
                    }
                }
            } catch (SecurityException error) {
                Log.w(TAG, "Cannot read current communication device", error);
            }
        }

        if (audioManager.isBluetoothScoOn()) {
            return ROUTE_BLUETOOTH;
        }

        return audioManager.isSpeakerphoneOn() ? ROUTE_SPEAKER : ROUTE_EARPIECE;
    }

    private boolean hasBluetoothRoute(AudioManager audioManager) {
        return findCommunicationDevice(audioManager, ROUTE_BLUETOOTH) != null;
    }

    private boolean isDeviceForRoute(AudioDeviceInfo device, String route) {
        if (ROUTE_BLUETOOTH.equals(route)) {
            return isBluetoothDevice(device);
        }

        if (ROUTE_SPEAKER.equals(route)) {
            return device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
        }

        return device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
    }

    private boolean isBluetoothDevice(AudioDeviceInfo device) {
        int type = device.getType();
        return type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
            type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
            type == AudioDeviceInfo.TYPE_HEARING_AID ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                (type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                    type == AudioDeviceInfo.TYPE_BLE_SPEAKER));
    }
}
