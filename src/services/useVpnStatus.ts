import { Capacitor, registerPlugin } from '@capacitor/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { readonly, ref } from 'vue';

interface VpnStatusPayload {
  adapterNames?: string[];
  isActive: boolean;
}

interface VpnStatusPlugin {
  getVpnStatus: () => Promise<VpnStatusPayload>;
  openVpnSettings: () => Promise<void>;
}

const VPN_STATUS_POLL_INTERVAL_MS = 5000;
const VpnStatus = registerPlugin<VpnStatusPlugin>('VpnStatus');

const isVpnActive = ref(false);
const vpnAdapterNames = ref<string[]>([]);
let vpnStatusPollInterval: ReturnType<typeof setInterval> | null = null;
let isVpnStatusRefreshInFlight = false;
let areVpnStatusListenersBound = false;

const isTauriRuntime = (): boolean => {
  try {
    return isTauri();
  } catch {
    return false;
  }
};

const isCapacitorVpnStatusSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const isVpnStatusSupported = (): boolean =>
  isTauriRuntime() || isCapacitorVpnStatusSupported();

export const refreshVpnStatus = async (): Promise<void> => {
  if (!isVpnStatusSupported()) {
    isVpnActive.value = false;
    vpnAdapterNames.value = [];
    return;
  }

  if (isVpnStatusRefreshInFlight) {
    return;
  }

  isVpnStatusRefreshInFlight = true;

  try {
    const payload = isCapacitorVpnStatusSupported()
      ? await VpnStatus.getVpnStatus()
      : await invoke<VpnStatusPayload>('get_vpn_status');
    isVpnActive.value = !!payload.isActive;
    vpnAdapterNames.value = payload.adapterNames || [];
  } catch (error) {
    console.warn('Failed to get VPN status:', error);
    isVpnActive.value = false;
    vpnAdapterNames.value = [];
  } finally {
    isVpnStatusRefreshInFlight = false;
  }
};

export const openVpnSettings = async (): Promise<void> => {
  if (isCapacitorVpnStatusSupported()) {
    await VpnStatus.openVpnSettings();
    return;
  }

  if (isTauriRuntime()) {
    await invoke('open_vpn_settings');
  }
};

export const ensureVpnStatusPolling = (): void => {
  if (!isVpnStatusSupported()) {
    isVpnActive.value = false;
    vpnAdapterNames.value = [];
    return;
  }

  void refreshVpnStatus();

  if (!vpnStatusPollInterval) {
    vpnStatusPollInterval = setInterval(() => {
      void refreshVpnStatus();
    }, VPN_STATUS_POLL_INTERVAL_MS);
  }

  if (!areVpnStatusListenersBound) {
    window.addEventListener('focus', () => {
      void refreshVpnStatus();
    });
    window.addEventListener('online', () => {
      void refreshVpnStatus();
    });
    areVpnStatusListenersBound = true;
  }
};

export const getIsVpnActive = () => isVpnActive.value;
export const useVpnStatus = () => ({
  isVpnActive: readonly(isVpnActive),
  vpnAdapterNames: readonly(vpnAdapterNames),
  ensureVpnStatusPolling,
  openVpnSettings,
  refreshVpnStatus
});
