package sep.pksep.app.plugins;

import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.NetworkInterface;
import java.util.Collections;
import java.util.Locale;

@CapacitorPlugin(name = "VpnStatus")
public class VpnStatusPlugin extends Plugin {
    private static final String[] VPN_INTERFACE_MARKERS = {
        "tun",
        "tap",
        "ppp",
        "ipsec",
        "wg",
        "wireguard",
        "vpn"
    };

    @PluginMethod
    public void getVpnStatus(PluginCall call) {
        JSArray adapterNames = new JSArray();
        boolean isActive = collectConnectivityManagerVpnAdapters(adapterNames);

        if (!isActive) {
            isActive = collectNetworkInterfaceVpnAdapters(adapterNames);
        }

        JSObject result = new JSObject();
        result.put("isActive", isActive);
        result.put("adapterNames", adapterNames);
        call.resolve(result);
    }

    @PluginMethod
    public void openVpnSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_VPN_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            try {
                Intent fallbackIntent = new Intent(Settings.ACTION_SETTINGS);
                fallbackIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallbackIntent);
                call.resolve();
            } catch (Exception fallbackError) {
                call.reject("Failed to open VPN settings", fallbackError);
            }
        }
    }

    private boolean collectConnectivityManagerVpnAdapters(JSArray adapterNames) {
        ConnectivityManager connectivityManager =
            (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        if (connectivityManager == null) {
            return false;
        }

        boolean hasVpn = false;

        for (Network network : connectivityManager.getAllNetworks()) {
            NetworkCapabilities capabilities =
                connectivityManager.getNetworkCapabilities(network);

            if (capabilities == null || !capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                continue;
            }

            hasVpn = true;
            LinkProperties linkProperties = connectivityManager.getLinkProperties(network);
            String interfaceName = linkProperties != null
                ? linkProperties.getInterfaceName()
                : null;

            if (!isNullOrBlank(interfaceName)) {
                adapterNames.put(interfaceName);
            }
        }

        if (hasVpn && adapterNames.length() == 0) {
            adapterNames.put("VPN");
        }

        return hasVpn;
    }

    private boolean collectNetworkInterfaceVpnAdapters(JSArray adapterNames) {
        try {
            boolean hasVpn = false;

            for (NetworkInterface networkInterface : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!networkInterface.isUp()) {
                    continue;
                }

                String name = networkInterface.getName();
                String displayName = networkInterface.getDisplayName();

                if (!matchesVpnInterface(name) && !matchesVpnInterface(displayName)) {
                    continue;
                }

                hasVpn = true;
                adapterNames.put(!isNullOrBlank(name) ? name : displayName);
            }

            return hasVpn;
        } catch (Exception ignored) {
            return false;
        }
    }

    private boolean matchesVpnInterface(String value) {
        if (isNullOrBlank(value)) {
            return false;
        }

        String normalized = value.toLowerCase(Locale.ROOT);

        for (String marker : VPN_INTERFACE_MARKERS) {
            if (normalized.contains(marker)) {
                return true;
            }
        }

        return false;
    }

    private boolean isNullOrBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
