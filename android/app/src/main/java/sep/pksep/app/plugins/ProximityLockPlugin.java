package sep.pksep.app.plugins;

import android.content.Context;
import android.os.PowerManager;
import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ProximityLock")
public class ProximityLockPlugin extends Plugin {

    private static final String TAG = "ProximityLockPlugin";
    private PowerManager.WakeLock proximityWakeLock;

    @PluginMethod
    public void enable(PluginCall call) {
        Log.d(TAG, "enable called");

        PowerManager powerManager =
                (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);

        if (powerManager != null && proximityWakeLock == null) {
            if (powerManager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
                proximityWakeLock = powerManager.newWakeLock(
                        PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
                        "sep.pksep.app:proximity_lock"
                );
                Log.d(TAG, "Proximity wake lock created");
            } else {
                Log.w(TAG, "PROXIMITY_SCREEN_OFF_WAKE_LOCK not supported on this device");
                call.resolve();
                return;
            }
        }

        if (proximityWakeLock != null && !proximityWakeLock.isHeld()) {
            proximityWakeLock.acquire();
            Log.d(TAG, "Proximity wake lock acquired");
        }

        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Log.d(TAG, "disable called");
        releaseWakeLock();
        call.resolve();
    }

    private void releaseWakeLock() {
        if (proximityWakeLock != null && proximityWakeLock.isHeld()) {
            proximityWakeLock.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY);
            Log.d(TAG, "Proximity wake lock released");
        }
    }

    @Override
    protected void handleOnDestroy() {
        releaseWakeLock();
        proximityWakeLock = null;
    }
}
