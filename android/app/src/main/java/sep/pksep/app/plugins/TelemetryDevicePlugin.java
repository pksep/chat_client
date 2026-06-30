package sep.pksep.app.plugins;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Build;
import android.util.DisplayMetrics;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.TimeZone;

@CapacitorPlugin(name = "TelemetryDevice")
public class TelemetryDevicePlugin extends Plugin {
    @PluginMethod
    public void getDeviceInfo(PluginCall call) {
        JSObject result = new JSObject();

        result.put("platform", "android");
        result.put("manufacturer", Build.MANUFACTURER);
        result.put("brand", Build.BRAND);
        result.put("model", Build.MODEL);
        result.put("device", Build.DEVICE);
        result.put("product", Build.PRODUCT);
        result.put("hardware", Build.HARDWARE);
        result.put("androidRelease", Build.VERSION.RELEASE);
        result.put("androidSdk", Build.VERSION.SDK_INT);
        result.put("locale", Locale.getDefault().toLanguageTag());
        result.put("timezone", TimeZone.getDefault().getID());

        DisplayMetrics displayMetrics = getContext().getResources().getDisplayMetrics();
        result.put("screenWidthPx", displayMetrics.widthPixels);
        result.put("screenHeightPx", displayMetrics.heightPixels);
        result.put("density", displayMetrics.density);
        result.put("densityDpi", displayMetrics.densityDpi);

        addAppInfo(result);
        addNetworkInfo(result);

        call.resolve(result);
    }

    private void addAppInfo(JSObject result) {
        try {
            PackageManager packageManager = getContext().getPackageManager();
            PackageInfo packageInfo = packageManager.getPackageInfo(
                getContext().getPackageName(),
                0
            );

            result.put("packageName", getContext().getPackageName());
            result.put("appVersionName", packageInfo.versionName);
            result.put("appVersionCode", getVersionCode(packageInfo));
        } catch (Exception ignored) {
            result.put("packageName", getContext().getPackageName());
        }
    }

    private long getVersionCode(PackageInfo packageInfo) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            return packageInfo.getLongVersionCode();
        }

        return packageInfo.versionCode;
    }

    private void addNetworkInfo(JSObject result) {
        ConnectivityManager connectivityManager =
            (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        if (connectivityManager == null) {
            return;
        }

        Network activeNetwork = connectivityManager.getActiveNetwork();
        if (activeNetwork == null) {
            result.put("networkConnected", false);
            return;
        }

        NetworkCapabilities capabilities =
            connectivityManager.getNetworkCapabilities(activeNetwork);

        result.put("networkConnected", capabilities != null);

        if (capabilities == null) {
            return;
        }

        result.put("networkVpn", capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN));
        result.put("networkWifi", capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
        result.put("networkCellular", capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR));
        result.put("networkEthernet", capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            result.put("networkValidated", capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            result.put("downstreamKbps", capabilities.getLinkDownstreamBandwidthKbps());
            result.put("upstreamKbps", capabilities.getLinkUpstreamBandwidthKbps());
        }
    }
}
