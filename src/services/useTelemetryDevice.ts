import { Capacitor, registerPlugin } from '@capacitor/core';

type TelemetryDeviceInfo = Record<string, unknown>;

interface TelemetryDevicePlugin {
  getDeviceInfo: () => Promise<TelemetryDeviceInfo>;
}

const TelemetryDevice =
  registerPlugin<TelemetryDevicePlugin>('TelemetryDevice');

const TELEMETRY_INSTALLATION_ID_KEY = 'chat.telemetry.installationId';

let cachedDeviceContext: TelemetryDeviceInfo | null = null;
let isDeviceContextHydrating = false;

const createUuid = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const getTelemetryInstallationId = (): string => {
  if (typeof localStorage === 'undefined') {
    return `install-${createUuid()}`;
  }

  const existing = localStorage.getItem(TELEMETRY_INSTALLATION_ID_KEY);
  if (existing) {
    return existing;
  }

  const nextInstallationId = `install-${createUuid()}`;
  localStorage.setItem(TELEMETRY_INSTALLATION_ID_KEY, nextInstallationId);
  return nextInstallationId;
};

const getBrowserDeviceContext = (): TelemetryDeviceInfo => {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const screenInfo = typeof screen !== 'undefined' ? screen : undefined;
  const viewport =
    typeof window !== 'undefined'
      ? {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        }
      : {};

  return {
    installationId: getTelemetryInstallationId(),
    platform: Capacitor.getPlatform(),
    isNative: Capacitor.isNativePlatform(),
    language: nav?.language,
    languages: nav?.languages,
    hardwareConcurrency: nav?.hardwareConcurrency,
    deviceMemory: (nav as
      | (Navigator & { deviceMemory?: number })
      | undefined)
      ?.deviceMemory,
    userAgent: nav?.userAgent,
    screenWidthPx: screenInfo?.width,
    screenHeightPx: screenInfo?.height,
    colorDepth: screenInfo?.colorDepth,
    viewport
  };
};

export const hydrateTelemetryDeviceContext = async (): Promise<void> => {
  if (isDeviceContextHydrating) {
    return;
  }

  isDeviceContextHydrating = true;

  try {
    const baseContext = getBrowserDeviceContext();
    const nativeContext =
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
        ? await TelemetryDevice.getDeviceInfo()
        : {};

    cachedDeviceContext = {
      ...baseContext,
      ...nativeContext,
      installationId: getTelemetryInstallationId()
    };
  } catch (error) {
    cachedDeviceContext = getBrowserDeviceContext();
    console.warn('[Telemetry] Failed to hydrate native device context:', error);
  } finally {
    isDeviceContextHydrating = false;
  }
};

export const getTelemetryDeviceContext = (): TelemetryDeviceInfo => {
  if (!cachedDeviceContext) {
    cachedDeviceContext = getBrowserDeviceContext();
    void hydrateTelemetryDeviceContext();
  }

  return cachedDeviceContext;
};
