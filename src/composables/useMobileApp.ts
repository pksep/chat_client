import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { MobilePlatformEnum } from '../components/interfaces/interfaces';
import { afterStartupPaint } from '../utils/after-startup-paint';
import {
  RuStoreInstallStatus,
  RuStoreUpdateAvailability,
  completeRuStoreFlexibleUpdate,
  getRuStoreAppUpdateInfo,
  isRuStoreUpdateSupported,
  startRuStoreFlexibleUpdate,
  subscribeRuStoreUpdateState,
  type RuStoreAppUpdateInfo,
  type RuStoreInstallState
} from '../services/useRuStoreUpdate';
import { markLiveKitPageReloadIntent } from '../services/live-kit-page-reload-intent';

const RUSTORE_APP_URL = 'https://www.rustore.ru/catalog/app/sep.pksep.app';
const WEB_UPDATE_INFO_URL = '/web-update.json';
const WEB_UPDATE_CHECK_INTERVAL_MS = 60_000;
const WEB_UPDATE_VERSION_STORAGE_KEY = 'chat_web_seen_update_version';

export type MobileAppProfileUpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'latest';

const mobilePlatform = ref<MobilePlatformEnum | null>(null);
const isMobileApp = ref(false);
const showDownloadModal = ref(false);
const showUpdateBanner = ref(false);
const updateInstallStatus = ref(RuStoreInstallStatus.UNKNOWN);
const updateDownloadPercent = ref<number | null>(null);
const isUpdateFlowPending = ref(false);
const nativeAppUpdateInfo = ref<RuStoreAppUpdateInfo | null>(null);
const isWebUpdateBanner = ref(false);
const latestWebUpdateVersion = ref<number | null>(null);
const isCheckingForUpdates = ref(false);
const hasCheckedForUpdates = ref(false);
const currentAppVersion = ref(__APP_VERSION__);
let webUpdateIntervalId: number | null = null;
let activeConsumers = 0;
let detectPromise: Promise<void> | null = null;
let pendingWebUpdate: Promise<void> | null = null;
let lastWebUpdateCheckAt = 0;
let webUpdateGeneration = 0;
let removeWebUpdateListeners: (() => void) | null = null;
let nativeUpdateSubscriptionPromise: Promise<void> | null = null;

const shouldShowNativeUpdateBanner = (
  appUpdateInfo: RuStoreAppUpdateInfo | null
): boolean => {
  if (!appUpdateInfo) {
    return false;
  }

  return (
    appUpdateInfo.updateAvailability ===
      RuStoreUpdateAvailability.UPDATE_AVAILABLE ||
    appUpdateInfo.updateAvailability ===
      RuStoreUpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS ||
    appUpdateInfo.installStatus === RuStoreInstallStatus.DOWNLOADED ||
    appUpdateInfo.installStatus === RuStoreInstallStatus.DOWNLOADING ||
    appUpdateInfo.installStatus === RuStoreInstallStatus.INSTALLING ||
    appUpdateInfo.installStatus === RuStoreInstallStatus.PENDING
  );
};

const isActiveNativeInstallStatus = (installStatus: number): boolean =>
  installStatus === RuStoreInstallStatus.DOWNLOADED ||
  installStatus === RuStoreInstallStatus.DOWNLOADING ||
  installStatus === RuStoreInstallStatus.INSTALLING ||
  installStatus === RuStoreInstallStatus.PENDING;

export function useMobileApp() {
  const applyNativeUpdateInfo = (
    appUpdateInfo: RuStoreAppUpdateInfo | null
  ) => {
    nativeAppUpdateInfo.value = appUpdateInfo;
    updateInstallStatus.value =
      appUpdateInfo?.installStatus ?? RuStoreInstallStatus.UNKNOWN;
    if (
      updateInstallStatus.value !== RuStoreInstallStatus.DOWNLOADING &&
      updateInstallStatus.value !== RuStoreInstallStatus.PENDING
    ) {
      updateDownloadPercent.value = null;
    }
    showUpdateBanner.value = shouldShowNativeUpdateBanner(appUpdateInfo);
  };

  const applyNativeInstallState = (installState: RuStoreInstallState) => {
    updateInstallStatus.value =
      installState.installStatus ?? RuStoreInstallStatus.UNKNOWN;

    const bytesDownloaded = Number(installState.bytesDownloaded);
    const totalBytesToDownload = Number(installState.totalBytesToDownload);

    if (
      updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADING &&
      Number.isFinite(bytesDownloaded) &&
      Number.isFinite(totalBytesToDownload) &&
      totalBytesToDownload > 0
    ) {
      updateDownloadPercent.value = Math.min(
        100,
        Math.max(0, Math.round((bytesDownloaded / totalBytesToDownload) * 100))
      );
    } else if (updateInstallStatus.value !== RuStoreInstallStatus.PENDING) {
      updateDownloadPercent.value = null;
    }

    const previousUpdateAvailability =
      nativeAppUpdateInfo.value?.updateAvailability ??
      RuStoreUpdateAvailability.UNKNOWN;
    const nextUpdateAvailability = isActiveNativeInstallStatus(
      updateInstallStatus.value
    )
      ? RuStoreUpdateAvailability.UPDATE_AVAILABLE
      : previousUpdateAvailability;

    nativeAppUpdateInfo.value = {
      updateAvailability: nextUpdateAvailability,
      installStatus: updateInstallStatus.value,
      availableVersionCode: nativeAppUpdateInfo.value?.availableVersionCode
    };
    showUpdateBanner.value = shouldShowNativeUpdateBanner(
      nativeAppUpdateInfo.value
    );
  };

  const refreshNativeUpdateInfo = async (): Promise<boolean> => {
    if (!isRuStoreUpdateSupported()) {
      applyNativeUpdateInfo(null);
      return false;
    }

    try {
      const appUpdateInfo = await getRuStoreAppUpdateInfo();
      applyNativeUpdateInfo(appUpdateInfo);
      return !!appUpdateInfo;
    } catch (error) {
      console.warn('Failed to get RuStore update info:', error);
      return false;
    }
  };

  const initNativeUpdateHandling = async () => {
    if (!isRuStoreUpdateSupported()) {
      return;
    }

    if (!nativeUpdateSubscriptionPromise) {
      nativeUpdateSubscriptionPromise = subscribeRuStoreUpdateState(
        installState => {
          applyNativeInstallState(installState);
        }
      )
        .then(() => undefined)
        .catch(error => {
          nativeUpdateSubscriptionPromise = null;
          console.warn('Failed to subscribe to RuStore update state:', error);
        });
    }

    await nativeUpdateSubscriptionPromise;
    await refreshNativeUpdateInfo();
  };

  const loadCurrentAppInfo = async () => {
    if (!Capacitor.isNativePlatform()) {
      currentAppVersion.value = '';
      return;
    }

    try {
      const appInfo = await CapacitorApp.getInfo();
      currentAppVersion.value = appInfo.version || __APP_VERSION__;
    } catch (error) {
      console.warn('Failed to get current app info:', error);
      currentAppVersion.value = __APP_VERSION__;
    }
  };

  const fetchWebUpdateVersion = async (): Promise<number | null> => {
    const response = await fetch(WEB_UPDATE_INFO_URL, { cache: 'no-cache' });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      version?: number | string;
    };
    const parsedVersion = Number.parseInt(String(payload.version || ''), 10);

    return Number.isFinite(parsedVersion) ? parsedVersion : null;
  };

  const applyWebUpdateVersion = (nextVersion: number | null) => {
    if (Capacitor.isNativePlatform()) {
      isWebUpdateBanner.value = false;
      return;
    }

    if (!Number.isFinite(nextVersion)) {
      return;
    }

    latestWebUpdateVersion.value = nextVersion;

    const storedVersion = Number.parseInt(
      localStorage.getItem(WEB_UPDATE_VERSION_STORAGE_KEY) || '',
      10
    );

    if (!Number.isFinite(storedVersion)) {
      localStorage.setItem(WEB_UPDATE_VERSION_STORAGE_KEY, String(nextVersion));
      isWebUpdateBanner.value = false;
      showUpdateBanner.value = false;
      return;
    }

    isWebUpdateBanner.value = storedVersion < nextVersion;
    showUpdateBanner.value = isWebUpdateBanner.value;
  };

  const checkWebUpdate = (force = false): Promise<void> => {
    if (pendingWebUpdate) return pendingWebUpdate;
    if (
      Capacitor.isNativePlatform() ||
      !navigator.onLine ||
      (!force &&
        (activeConsumers === 0 ||
          document.visibilityState !== 'visible' ||
          Date.now() - lastWebUpdateCheckAt < WEB_UPDATE_CHECK_INTERVAL_MS))
    ) {
      return Promise.resolve();
    }
    lastWebUpdateCheckAt = Date.now();
    pendingWebUpdate = (async () => {
      try {
        const nextVersion = await fetchWebUpdateVersion();
        applyWebUpdateVersion(nextVersion);
      } catch (error) {
        console.warn('Failed to check web update version:', error);
      }
    })().finally(() => {
      pendingWebUpdate = null;
    });
    return pendingWebUpdate;
  };

  const initWebUpdateHandling = async (generation: number) => {
    if (Capacitor.isNativePlatform()) {
      isWebUpdateBanner.value = false;
      return;
    }

    await checkWebUpdate();

    if (activeConsumers === 0 || generation !== webUpdateGeneration) return;

    if (!removeWebUpdateListeners) {
      const checkWhenActive = () => {
        void checkWebUpdate();
      };
      document.addEventListener('visibilitychange', checkWhenActive);
      window.addEventListener('online', checkWhenActive);
      removeWebUpdateListeners = () => {
        document.removeEventListener('visibilitychange', checkWhenActive);
        window.removeEventListener('online', checkWhenActive);
      };
    }

    if (webUpdateIntervalId === null) {
      webUpdateIntervalId = window.setInterval(() => {
        void checkWebUpdate();
      }, WEB_UPDATE_CHECK_INTERVAL_MS);
    }
  };

  const persistCurrentWebUpdateVersion = () => {
    if (Capacitor.isNativePlatform()) {
      return;
    }

    if (!Number.isFinite(latestWebUpdateVersion.value)) {
      return;
    }

    localStorage.setItem(
      WEB_UPDATE_VERSION_STORAGE_KEY,
      String(latestWebUpdateVersion.value)
    );
    isWebUpdateBanner.value = false;
  };

  const detect = async () => {
    const generation = webUpdateGeneration;
    const ua = navigator.userAgent || '';

    if (/Android/i.test(ua)) {
      mobilePlatform.value = MobilePlatformEnum.ANDROID;
      isMobileApp.value = true;
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      mobilePlatform.value = MobilePlatformEnum.APPLE;
      isMobileApp.value = true;
    } else {
      mobilePlatform.value = null;
      isMobileApp.value = false;
    }

    if (isMobileApp.value) {
      const isPWA =
        window.matchMedia('(display-mode: standalone)').matches ||
        ('standalone' in navigator &&
          (
            navigator as Navigator & {
              standalone?: boolean;
            }
          ).standalone === true);
      const isNative = Capacitor.isNativePlatform();

      if (!isPWA && !isNative) {
        showDownloadModal.value = true;
      }
    }

    await afterStartupPaint();
    if (generation !== webUpdateGeneration || activeConsumers === 0) return;

    isCheckingForUpdates.value = true;

    try {
      await loadCurrentAppInfo();
      await initWebUpdateHandling(generation);
      await initNativeUpdateHandling();
      hasCheckedForUpdates.value = true;
    } finally {
      isCheckingForUpdates.value = false;
    }
  };

  const handleInstall = () => {
    if (!mobilePlatform.value) return;

    if (mobilePlatform.value === MobilePlatformEnum.ANDROID) {
      window.location.href = RUSTORE_APP_URL;

      return;
    }

    if (mobilePlatform.value === MobilePlatformEnum.APPLE) {
      const start = Date.now();

      window.location.href = 'myapp://open';

      setTimeout(() => {
        if (Date.now() - start < 1500) {
          window.location.href = 'https://your-domain.com/open';
        }
      }, 1200);
    }
  };

  const handleUpdateClick = async () => {
    if (!isRuStoreUpdateSupported()) {
      persistCurrentWebUpdateVersion();
      markLiveKitPageReloadIntent();
      window.location.reload();
      return;
    }

    if (
      updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADING ||
      updateInstallStatus.value === RuStoreInstallStatus.PENDING ||
      updateInstallStatus.value === RuStoreInstallStatus.INSTALLING ||
      isUpdateFlowPending.value
    ) {
      return;
    }

    isUpdateFlowPending.value = true;

    const completeUpdate = async () => {
      updateInstallStatus.value = RuStoreInstallStatus.INSTALLING;
      try {
        await completeRuStoreFlexibleUpdate();
        applyNativeUpdateInfo({
          updateAvailability: RuStoreUpdateAvailability.UPDATE_NOT_AVAILABLE,
          installStatus: RuStoreInstallStatus.UNKNOWN
        });
      } catch (error) {
        if (updateInstallStatus.value === RuStoreInstallStatus.INSTALLING) {
          updateInstallStatus.value = RuStoreInstallStatus.DOWNLOADED;
        }
        throw error;
      }
    };

    try {
      if (updateInstallStatus.value !== RuStoreInstallStatus.DOWNLOADED) {
        if (!(await refreshNativeUpdateInfo())) return;
      }

      if (updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADED) {
        await completeUpdate();
        return;
      }

      if (
        isActiveNativeInstallStatus(updateInstallStatus.value) ||
        !showUpdateBanner.value
      ) {
        return;
      }
      await startRuStoreFlexibleUpdate();
    } catch (error) {
      console.warn('Failed to start RuStore update flow:', error);
    } finally {
      isUpdateFlowPending.value = false;
    }
  };

  const checkForUpdates = async () => {
    isCheckingForUpdates.value = true;

    try {
      if (Capacitor.isNativePlatform()) {
        await loadCurrentAppInfo();
        await refreshNativeUpdateInfo();
        hasCheckedForUpdates.value = true;
        return;
      }

      await checkWebUpdate(true);
      hasCheckedForUpdates.value = true;
    } finally {
      isCheckingForUpdates.value = false;
    }
  };

  const updateActionLabel = computed(() => {
    if (!Capacitor.isNativePlatform()) {
      return 'Обновить';
    }

    if (updateInstallStatus.value === RuStoreInstallStatus.INSTALLING) {
      return 'Установлено';
    }

    if (updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADED) {
      return 'Перезапустить';
    }

    if (typeof updateDownloadPercent.value === 'number') {
      return `${updateDownloadPercent.value}%`;
    }

    if (
      isUpdateFlowPending.value ||
      updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADING ||
      updateInstallStatus.value === RuStoreInstallStatus.PENDING
    ) {
      return '0%';
    }

    return 'Установить';
  });

  const updateProgress = computed<number | null | undefined>(() => {
    if (
      !Capacitor.isNativePlatform() ||
      updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADED ||
      updateInstallStatus.value === RuStoreInstallStatus.INSTALLING
    ) {
      return undefined;
    }

    if (
      isUpdateFlowPending.value ||
      updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADING ||
      updateInstallStatus.value === RuStoreInstallStatus.PENDING
    ) {
      return updateDownloadPercent.value ?? 0;
    }

    return undefined;
  });

  const isUpdateActionDisabled = computed(
    () =>
      Capacitor.isNativePlatform() &&
      (isUpdateFlowPending.value ||
        updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADING ||
        updateInstallStatus.value === RuStoreInstallStatus.INSTALLING ||
        updateInstallStatus.value === RuStoreInstallStatus.PENDING)
  );

  const profileUpdateState = computed<MobileAppProfileUpdateState>(() => {
    if (isCheckingForUpdates.value) {
      return 'checking';
    }

    if (updateProgress.value !== undefined) {
      return 'downloading';
    }

    if (
      updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADED ||
      updateInstallStatus.value === RuStoreInstallStatus.INSTALLING
    ) {
      return 'downloaded';
    }

    if (showUpdateBanner.value) {
      return 'available';
    }

    if (hasCheckedForUpdates.value) {
      return 'latest';
    }

    return 'idle';
  });

  onMounted(() => {
    activeConsumers += 1;

    if (!detectPromise) {
      detectPromise = detect();
    }

    void detectPromise;
  });

  onBeforeUnmount(() => {
    activeConsumers = Math.max(0, activeConsumers - 1);

    if (activeConsumers > 0) {
      return;
    }

    if (webUpdateIntervalId !== null) {
      window.clearInterval(webUpdateIntervalId);
      webUpdateIntervalId = null;
    }

    detectPromise = null;
    webUpdateGeneration += 1;
    removeWebUpdateListeners?.();
    removeWebUpdateListeners = null;
  });

  return {
    mobilePlatform,
    isMobileApp,
    showDownloadModal,
    showUpdateBanner,
    updateActionLabel,
    updateProgress,
    profileUpdateState,
    isUpdateActionDisabled,
    isCheckingForUpdates,
    hasCheckedForUpdates,
    currentAppVersion,
    handleInstall,
    handleUpdateClick,
    checkForUpdates
  };
}
