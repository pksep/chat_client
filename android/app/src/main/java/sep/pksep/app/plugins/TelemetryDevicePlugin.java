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

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "TelemetryDevice")
public class TelemetryDevicePlugin extends Plugin {
    private static final String NETWORK_STATUS_CHANGE_EVENT = "networkStatusChange";
    private static final int DEFAULT_HTTP_PROBE_TIMEOUT_MS = 3500;
    private static final int MAX_HTTP_PROBE_TIMEOUT_MS = 8000;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private Network lastObservedNetwork;
    private long networkRevision;
    private final ConcurrentHashMap<Network, Boolean> blockedNetworks = new ConcurrentHashMap<>();

    @Override
    public void load() {
        connectivityManager =
            (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        if (connectivityManager == null) {
            return;
        }

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                notifyCurrentNetworkStatus();
            }

            @Override
            public void onLost(Network network) {
                blockedNetworks.remove(network);
                notifyLostNetworkStatus(network);
            }

            @Override
            public void onBlockedStatusChanged(Network network, boolean blocked) {
                blockedNetworks.put(network, blocked);
                notifyCurrentNetworkStatus();
            }

            @Override
            public void onCapabilitiesChanged(
                Network network,
                NetworkCapabilities networkCapabilities
            ) {
                notifyCurrentNetworkStatus();
            }
        };

        connectivityManager.registerDefaultNetworkCallback(networkCallback);
    }

    @Override
    protected void handleOnDestroy() {
        if (connectivityManager != null && networkCallback != null) {
            try {
                connectivityManager.unregisterNetworkCallback(networkCallback);
            } catch (Exception ignored) {
                // Android мог уже удалить callback.
            }
        }

        networkCallback = null;
        blockedNetworks.clear();
        connectivityManager = null;
        super.handleOnDestroy();
    }

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

    @PluginMethod
    public void getNetworkStatus(PluginCall call) {
        call.resolve(buildNetworkStatus());
    }

    /**
     * Runs outside WebView so a retained report tells us whether the carrier
     * can reach the chat host at all, and not only that JavaScript fetch failed.
     */
    @PluginMethod
    public void probeHttp(PluginCall call) {
        String rawUrl = call.getString("url");
        Integer requestedTimeoutMs = call.getInt("timeoutMs");
        final int timeoutMs = Math.min(
            Math.max(
                requestedTimeoutMs == null ? DEFAULT_HTTP_PROBE_TIMEOUT_MS : requestedTimeoutMs,
                500
            ),
            MAX_HTTP_PROBE_TIMEOUT_MS
        );

        if (rawUrl == null || rawUrl.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        final String targetUrl = rawUrl.trim();

        new Thread(() -> {
            HttpURLConnection connection = null;
            JSObject result = buildNetworkStatus();
            long startedAt = System.nanoTime();
            result.put("reachable", false);

            try {
                URL url = new URL(targetUrl);
                String protocol = url.getProtocol();

                if (!"https".equalsIgnoreCase(protocol) && !"http".equalsIgnoreCase(protocol)) {
                    throw new IllegalArgumentException("Only HTTP(S) URLs are supported");
                }

                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("GET");
                connection.setInstanceFollowRedirects(true);
                connection.setUseCaches(false);
                connection.setConnectTimeout(timeoutMs);
                connection.setReadTimeout(timeoutMs);
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("Accept", "application/json, text/plain, */*");

                int status = connection.getResponseCode();
                result.put("httpStatus", status);
                // A 4xx response still proves that DNS, TLS and the HTTP route
                // to the chat host are available. Server 5xx is unhealthy.
                result.put("reachable", status < 500);
            } catch (Exception error) {
                result.put("errorClass", error.getClass().getSimpleName());
                String message = error.getMessage();
                if (message != null && !message.isEmpty()) {
                    result.put("errorMessage", message.substring(0, Math.min(message.length(), 300)));
                }
            } finally {
                result.put(
                    "durationMs",
                    Math.max(0L, (System.nanoTime() - startedAt) / 1_000_000L)
                );

                if (connection != null) {
                    connection.disconnect();
                }

                call.resolve(result);
            }
        }, "chat-network-diagnostic").start();
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
        JSObject networkStatus = buildNetworkStatus();
        Iterator<String> keys = networkStatus.keys();

        while (keys.hasNext()) {
            String key = keys.next();
            result.put(key, networkStatus.opt(key));
        }
    }

    private void notifyCurrentNetworkStatus() {
        notifyListeners(NETWORK_STATUS_CHANGE_EVENT, buildNetworkStatus(), true);
    }

    private void notifyLostNetworkStatus(Network lostNetwork) {
        JSObject status = buildNetworkStatus();
        Network activeNetwork =
            connectivityManager == null ? null : connectivityManager.getActiveNetwork();

        if (activeNetwork == null || activeNetwork.equals(lostNetwork)) {
            status.put("networkConnected", false);
            status.put("networkValidated", false);
        }

        notifyListeners(NETWORK_STATUS_CHANGE_EVENT, status, true);
    }

    private synchronized long getNetworkRevision(Network network) {
        if (network == null ? lastObservedNetwork != null : !network.equals(lastObservedNetwork)) {
            lastObservedNetwork = network;
            networkRevision++;
        }
        return networkRevision;
    }

    private JSObject buildNetworkStatus() {
        JSObject result = new JSObject();
        ConnectivityManager manager = connectivityManager;

        if (manager == null) {
            manager =
                (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        }

        if (manager == null) {
            result.put("networkConnected", false);
            result.put("networkValidated", false);
            return result;
        }

        Network activeNetwork = manager.getActiveNetwork();
        result.put("networkMetered", manager.isActiveNetworkMetered());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            result.put("networkRestrictBackgroundStatus", manager.getRestrictBackgroundStatus());
        }
        // Счётчик живёт только в процессе; идентификаторы Wi-Fi и сети не передаются.
        result.put("networkRevision", getNetworkRevision(activeNetwork));
        if (activeNetwork == null) {
            result.put("networkConnected", false);
            result.put("networkValidated", false);
            return result;
        }

        // Android 10+ сообщает ограничения для UID приложения отдельно от VALIDATED.
        Boolean blocked = blockedNetworks.get(activeNetwork);
        if (blocked != null) result.put("networkBlocked", blocked);

        NetworkCapabilities capabilities =
            manager.getNetworkCapabilities(activeNetwork);

        result.put("networkConnected", capabilities != null);

        if (capabilities == null) {
            result.put("networkValidated", false);
            return result;
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

        return result;
    }
}
