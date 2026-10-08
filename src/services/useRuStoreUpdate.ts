import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle
} from '@capacitor/core';

export enum RuStoreUpdateAvailability {
  UNKNOWN = 0,
  UPDATE_NOT_AVAILABLE = 1,
  UPDATE_AVAILABLE = 2,
  DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS = 3
}

export enum RuStoreInstallStatus {
  UNKNOWN = 0,
  DOWNLOADED = 1,
  DOWNLOADING = 2,
  FAILED = 3,
  INSTALLING = 4,
  PENDING = 5,
  DOWNLOAD_INTERRUPTED = 6
}

export interface RuStoreAppUpdateInfo {
  updateAvailability: number;
  installStatus: number;
  availableVersionCode?: number;
}

export interface RuStoreInstallState {
  installStatus: number;
  bytesDownloaded?: number;
  totalBytesToDownload?: number;
  installErrorCode?: number;
  packageName?: string;
}

interface RuStoreUpdatePlugin {
  addListener(
    eventName: 'updateStateChanged',
    listenerFunc: (payload: RuStoreInstallState) => void
  ): Promise<PluginListenerHandle>;
  getAppUpdateInfo(): Promise<RuStoreAppUpdateInfo>;
  startFlexibleUpdate(): Promise<{ resultCode: number }>;
  completeFlexibleUpdate(): Promise<void>;
}

const RuStoreUpdate = registerPlugin<RuStoreUpdatePlugin>('RuStoreUpdate');

export const isRuStoreUpdateSupported = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

export const getRuStoreAppUpdateInfo = async () => {
  if (!isRuStoreUpdateSupported()) {
    return null;
  }

  return await RuStoreUpdate.getAppUpdateInfo();
};

export const startRuStoreFlexibleUpdate = async () => {
  if (!isRuStoreUpdateSupported()) {
    return null;
  }

  return await RuStoreUpdate.startFlexibleUpdate();
};

export const completeRuStoreFlexibleUpdate = async () => {
  if (!isRuStoreUpdateSupported()) {
    return;
  }

  await RuStoreUpdate.completeFlexibleUpdate();
};

export const subscribeRuStoreUpdateState = async (
  listener: (payload: RuStoreInstallState) => void
) => {
  if (!isRuStoreUpdateSupported()) {
    return null;
  }

  return await RuStoreUpdate.addListener('updateStateChanged', listener);
};
