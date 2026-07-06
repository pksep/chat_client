package sep.pksep.app.plugins;

import android.Manifest;
import android.content.Context;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.util.Log;
import android.view.KeyEvent;

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
    private static volatile boolean callVolumeControlsActive = false;
    private static volatile int callVolumeControlStream = AudioManager.STREAM_VOICE_CALL;
    private static volatile String callVolumeControlRoute = ROUTE_EARPIECE;
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
        String currentRoute = resolvedRoute != null
            ? resolvedRoute
            : getCurrentRoute(audioManager);
        bindVolumeControlsToRoute(audioManager, currentRoute);
        call.resolve(buildState(audioManager, currentRoute));
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
            bindVolumeControlsToRoute(audioManager, lastAppliedRoute);
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
        callVolumeControlsActive = true;
    }

    @PluginMethod
    public void releaseCallAudio(PluginCall call) {
        AudioManager audioManager = getAudioManager();
        if (audioManager == null) {
            call.reject("AudioManager is unavailable");
            return;
        }

        releaseCallAudio(audioManager);
        call.resolve();
    }

    @SuppressWarnings("deprecation")
    private void releaseCallAudio(AudioManager audioManager) {
        stopBluetoothSco(audioManager);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                audioManager.clearCommunicationDevice();
            } catch (SecurityException error) {
                Log.w(TAG, "Failed to clear communication device", error);
            }
        }

        audioManager.setSpeakerphoneOn(false);
        audioManager.setMode(AudioManager.MODE_NORMAL);
        callVolumeControlsActive = false;
        callVolumeControlStream = AudioManager.STREAM_VOICE_CALL;
        callVolumeControlRoute = ROUTE_EARPIECE;

        if (getActivity() != null) {
            getActivity().setVolumeControlStream(AudioManager.STREAM_MUSIC);
        }

        Log.d(TAG, "Released call audio routing");
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
        return ROUTE_EARPIECE;
    }

    @SuppressWarnings("deprecation")
    private String applyRoute(AudioManager audioManager, String route) {
        Log.d(TAG, "Switching call audio route to " + route);

        if (ROUTE_BLUETOOTH.equals(route)) {
            if (trySetCommunicationDevice(audioManager, ROUTE_BLUETOOTH)) {
                audioManager.setSpeakerphoneOn(false);
                bindVolumeControlsToRoute(audioManager, ROUTE_BLUETOOTH);
                return ROUTE_BLUETOOTH;
            }

            try {
                audioManager.setSpeakerphoneOn(false);
                audioManager.startBluetoothSco();
                audioManager.setBluetoothScoOn(true);
                bindVolumeControlsToRoute(audioManager, ROUTE_BLUETOOTH);
                return ROUTE_BLUETOOTH;
            } catch (SecurityException error) {
                Log.w(TAG, "Bluetooth route is not permitted", error);
                return applyRoute(audioManager, ROUTE_EARPIECE);
            }
        }

        stopBluetoothSco(audioManager);

        if (ROUTE_SPEAKER.equals(route)) {
            trySetCommunicationDevice(audioManager, ROUTE_SPEAKER);
            audioManager.setSpeakerphoneOn(true);
            bindVolumeControlsToRoute(audioManager, ROUTE_SPEAKER);
            return ROUTE_SPEAKER;
        }

        trySetCommunicationDevice(audioManager, ROUTE_EARPIECE);
        audioManager.setSpeakerphoneOn(false);
        bindVolumeControlsToRoute(audioManager, ROUTE_EARPIECE);
        return ROUTE_EARPIECE;
    }

    static int getVolumeControlStreamForRoute(String route) {
        return ROUTE_SPEAKER.equals(route)
            ? AudioManager.STREAM_MUSIC
            : AudioManager.STREAM_VOICE_CALL;
    }

    private void bindVolumeControlsToRoute(AudioManager audioManager, String route) {
        int volumeControlStream = getVolumeControlStreamForRoute(route);
        callVolumeControlsActive = true;
        callVolumeControlStream = volumeControlStream;
        callVolumeControlRoute = route;

        if (getActivity() != null) {
            getActivity().setVolumeControlStream(volumeControlStream);
        }

        Log.d(
            TAG,
            "Call audio route bound: " +
                buildAudioDebugSummary(audioManager, route, volumeControlStream)
        );
    }

    public static boolean handleCallVolumeKeyEvent(Context context, KeyEvent event) {
        if (!callVolumeControlsActive) {
            return false;
        }

        int keyCode = event.getKeyCode();
        if (
            keyCode != KeyEvent.KEYCODE_VOLUME_UP &&
            keyCode != KeyEvent.KEYCODE_VOLUME_DOWN
        ) {
            return false;
        }

        if (event.getAction() == KeyEvent.ACTION_UP) {
            return true;
        }

        if (event.getAction() != KeyEvent.ACTION_DOWN) {
            return false;
        }

        AudioManager audioManager =
            (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) {
            return false;
        }

        int direction = keyCode == KeyEvent.KEYCODE_VOLUME_UP
            ? AudioManager.ADJUST_RAISE
            : AudioManager.ADJUST_LOWER;
        audioManager.adjustStreamVolume(
            callVolumeControlStream,
            direction,
            AudioManager.FLAG_SHOW_UI
        );

        Log.d(
            TAG,
            "Call volume key adjusted route=" +
                callVolumeControlRoute +
                ", stream=" +
                getStreamName(callVolumeControlStream)
        );
        return true;
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
        int volumeControlStream = getVolumeControlStreamForRoute(currentRoute);
        AudioDeviceInfo activeOutputDevice = getActiveOutputDevice(audioManager, currentRoute);
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
        result.put("audioMode", getAudioModeName(audioManager.getMode()));
        result.put("audioModeValue", audioManager.getMode());
        result.put("volumeControlStream", getStreamName(volumeControlStream));
        result.put("volumeControlStreamValue", volumeControlStream);
        result.put(
            "voiceCallVolume",
            audioManager.getStreamVolume(AudioManager.STREAM_VOICE_CALL)
        );
        result.put(
            "voiceCallMaxVolume",
            audioManager.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL)
        );
        result.put("musicVolume", audioManager.getStreamVolume(AudioManager.STREAM_MUSIC));
        result.put(
            "musicMaxVolume",
            audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        );
        result.put("speakerphoneOn", audioManager.isSpeakerphoneOn());
        result.put("bluetoothScoOn", audioManager.isBluetoothScoOn());
        result.put("wiredHeadsetConnected", hasWiredRoute(audioManager));
        result.put(
            "activeOutputType",
            activeOutputDevice != null
                ? getDeviceTypeName(activeOutputDevice.getType())
                : "unknown"
        );
        result.put(
            "activeOutputName",
            activeOutputDevice != null
                ? String.valueOf(activeOutputDevice.getProductName())
                : "unknown"
        );

        return result;
    }

    private String buildAudioDebugSummary(
        AudioManager audioManager,
        String route,
        int volumeControlStream
    ) {
        AudioDeviceInfo activeOutputDevice = getActiveOutputDevice(audioManager, route);

        return "route=" + route +
            ", mode=" + getAudioModeName(audioManager.getMode()) +
            ", volumeControlStream=" + getStreamName(volumeControlStream) +
            ", activeOutputType=" +
            (activeOutputDevice != null
                ? getDeviceTypeName(activeOutputDevice.getType())
                : "unknown") +
            ", speakerphoneOn=" + audioManager.isSpeakerphoneOn() +
            ", bluetoothScoOn=" + audioManager.isBluetoothScoOn() +
            ", wiredHeadsetConnected=" + hasWiredRoute(audioManager) +
            ", voiceCallVolume=" +
            audioManager.getStreamVolume(AudioManager.STREAM_VOICE_CALL) +
            "/" +
            audioManager.getStreamMaxVolume(AudioManager.STREAM_VOICE_CALL) +
            ", musicVolume=" +
            audioManager.getStreamVolume(AudioManager.STREAM_MUSIC) +
            "/" +
            audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
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

    private boolean hasWiredRoute(AudioManager audioManager) {
        try {
            AudioDeviceInfo[] devices = audioManager.getDevices(
                AudioManager.GET_DEVICES_OUTPUTS
            );
            for (AudioDeviceInfo device : devices) {
                if (isWiredDevice(device)) {
                    return true;
                }
            }
        } catch (SecurityException error) {
            Log.w(TAG, "Cannot read wired output devices", error);
        }

        return false;
    }

    private AudioDeviceInfo getActiveOutputDevice(
        AudioManager audioManager,
        String route
    ) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                AudioDeviceInfo communicationDevice = audioManager.getCommunicationDevice();
                if (communicationDevice != null) {
                    return communicationDevice;
                }
            } catch (SecurityException error) {
                Log.w(TAG, "Cannot read active communication device", error);
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
            Log.w(TAG, "Cannot read active output device", error);
        }

        return null;
    }

    private boolean isDeviceForRoute(AudioDeviceInfo device, String route) {
        if (ROUTE_BLUETOOTH.equals(route)) {
            return isBluetoothDevice(device);
        }

        if (ROUTE_SPEAKER.equals(route)) {
            return device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER;
        }

        return device.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE ||
            isWiredDevice(device);
    }

    private boolean isWiredDevice(AudioDeviceInfo device) {
        int type = device.getType();
        return type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
            type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
            type == AudioDeviceInfo.TYPE_USB_HEADSET;
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

    private String getAudioModeName(int mode) {
        switch (mode) {
            case AudioManager.MODE_NORMAL:
                return "MODE_NORMAL";
            case AudioManager.MODE_RINGTONE:
                return "MODE_RINGTONE";
            case AudioManager.MODE_IN_CALL:
                return "MODE_IN_CALL";
            case AudioManager.MODE_IN_COMMUNICATION:
                return "MODE_IN_COMMUNICATION";
            default:
                return "MODE_UNKNOWN_" + mode;
        }
    }

    private static String getStreamName(int stream) {
        switch (stream) {
            case AudioManager.STREAM_VOICE_CALL:
                return "STREAM_VOICE_CALL";
            case AudioManager.STREAM_MUSIC:
                return "STREAM_MUSIC";
            case AudioManager.STREAM_RING:
                return "STREAM_RING";
            case AudioManager.STREAM_NOTIFICATION:
                return "STREAM_NOTIFICATION";
            case AudioManager.STREAM_ALARM:
                return "STREAM_ALARM";
            case AudioManager.STREAM_SYSTEM:
                return "STREAM_SYSTEM";
            default:
                return "STREAM_UNKNOWN_" + stream;
        }
    }

    private String getDeviceTypeName(int type) {
        switch (type) {
            case AudioDeviceInfo.TYPE_BUILTIN_EARPIECE:
                return "TYPE_BUILTIN_EARPIECE";
            case AudioDeviceInfo.TYPE_BUILTIN_SPEAKER:
                return "TYPE_BUILTIN_SPEAKER";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                return "TYPE_WIRED_HEADSET";
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                return "TYPE_WIRED_HEADPHONES";
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
                return "TYPE_BLUETOOTH_SCO";
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                return "TYPE_BLUETOOTH_A2DP";
            case AudioDeviceInfo.TYPE_HEARING_AID:
                return "TYPE_HEARING_AID";
            case AudioDeviceInfo.TYPE_USB_HEADSET:
                return "TYPE_USB_HEADSET";
            default:
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (type == AudioDeviceInfo.TYPE_BLE_HEADSET) {
                        return "TYPE_BLE_HEADSET";
                    }

                    if (type == AudioDeviceInfo.TYPE_BLE_SPEAKER) {
                        return "TYPE_BLE_SPEAKER";
                    }
                }

                return "TYPE_UNKNOWN_" + type;
        }
    }
}
