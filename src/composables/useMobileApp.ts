import { Capacitor } from '@capacitor/core';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { MobilePlatformEnum } from '../components/interfaces/interfaces';
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
import { isTauriRuntime } from '../services/useTauriNotifications';
import {
  checkTauriUpdate,
  installTauriUpdate,
  type TauriUpdateInfo
} from '../services/useTauriUpdate';

const RUSTORE_APP_URL = 'https://www.rustore.ru/catalog/app/sep.pksep.app';
const WEB_UPDATE_INFO_URL = '/web-update.json';
const WEB_UPDATE_CHECK_INTERVAL_MS = 60_000;
const WEB_UPDATE_VERSION_STORAGE_KEY = 'chat_web_seen_update_version';

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
    appUpdateInfo.installStatus === RuStoreInstallStatus.PENDING
  );
};

export function useMobileApp() {
  const mobilePlatform = ref<MobilePlatformEnum | null>(null);
  const isMobileApp = ref(false);
  const showDownloadModal = ref(false);
  const showUpdateBanner = ref(false);
  const updateInstallStatus = ref(RuStoreInstallStatus.UNKNOWN);
  const isUpdateFlowPending = ref(false);
  const nativeAppUpdateInfo = ref<RuStoreAppUpdateInfo | null>(null);
  const tauriAppUpdateInfo = ref<TauriUpdateInfo | null>(null);
  const isTauriUpdateBanner = ref(false);
  const isWebUpdateBanner = ref(false);
  const latestWebUpdateVersion = ref<number | null>(null);
  let webUpdateIntervalId: number | null = null;

  const isBrowserWebRuntime = () =>
    !Capacitor.isNativePlatform() && !isTauriRuntime();

  const applyNativeUpdateInfo = (
    appUpdateInfo: RuStoreAppUpdateInfo | null
  ) => {
    nativeAppUpdateInfo.value = appUpdateInfo;
    updateInstallStatus.value =
      appUpdateInfo?.installStatus ?? RuStoreInstallStatus.UNKNOWN;
    showUpdateBanner.value = shouldShowNativeUpdateBanner(appUpdateInfo);
  };

  const applyNativeInstallState = (installState: RuStoreInstallState) => {
    updateInstallStatus.value =
      installState.installStatus ?? RuStoreInstallStatus.UNKNOWN;

    nativeAppUpdateInfo.value = {
      updateAvailability:
        nativeAppUpdateInfo.value?.updateAvailability ??
        RuStoreUpdateAvailability.UPDATE_AVAILABLE,
      installStatus: updateInstallStatus.value,
      availableVersionCode: nativeAppUpdateInfo.value?.availableVersionCode
    };
    showUpdateBanner.value = shouldShowNativeUpdateBanner(
      nativeAppUpdateInfo.value
    );
  };

  const refreshNativeUpdateInfo = async () => {
    if (!isRuStoreUpdateSupported()) {
      applyNativeUpdateInfo(null);
      return;
    }

    try {
      const appUpdateInfo = await getRuStoreAppUpdateInfo();
      applyNativeUpdateInfo(appUpdateInfo);
    } catch (error) {
      console.warn('Failed to get RuStore update info:', error);
      applyNativeUpdateInfo(null);
    }
  };

  const initNativeUpdateHandling = async () => {
    if (!isRuStoreUpdateSupported()) {
      return;
    }

    try {
      await subscribeRuStoreUpdateState(installState => {
        applyNativeInstallState(installState);
      });
    } catch (error) {
      console.warn('Failed to subscribe to RuStore update state:', error);
    }

    await refreshNativeUpdateInfo();
  };

  const fetchWebUpdateVersion = async (): Promise<number | null> => {
    const response = await fetch(
      `${WEB_UPDATE_INFO_URL}?t=${Date.now().toString()}`,
      {
        cache: 'no-store'
      }
    );

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
    if (!isBrowserWebRuntime()) {
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

  const checkWebUpdate = async () => {
    if (!isBrowserWebRuntime()) {
      return;
    }

    try {
      const nextVersion = await fetchWebUpdateVersion();
      applyWebUpdateVersion(nextVersion);
    } catch (error) {
      console.warn('Failed to check web update version:', error);
    }
  };

  const initWebUpdateHandling = async () => {
    if (!isBrowserWebRuntime()) {
      isWebUpdateBanner.value = false;
      return;
    }

    await checkWebUpdate();

    webUpdateIntervalId = window.setInterval(() => {
      void checkWebUpdate();
    }, WEB_UPDATE_CHECK_INTERVAL_MS);
  };

  const persistCurrentWebUpdateVersion = () => {
    if (!isBrowserWebRuntime()) {
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

  const refreshTauriUpdateInfo = async () => {
    if (!isTauriRuntime()) {
      tauriAppUpdateInfo.value = null;
      isTauriUpdateBanner.value = false;
      return;
    }

    try {
      const updateInfo = await checkTauriUpdate();
      tauriAppUpdateInfo.value = updateInfo;
      isTauriUpdateBanner.value = !!updateInfo;
      showUpdateBanner.value = !!updateInfo;
    } catch (error) {
      console.warn('Failed to check Tauri update:', error);
      tauriAppUpdateInfo.value = null;
      isTauriUpdateBanner.value = false;
      showUpdateBanner.value = false;
    }
  };

  const initTauriUpdateHandling = async () => {
    if (!isTauriRuntime()) {
      return;
    }

    await refreshTauriUpdateInfo();
  };

  const detect = async () => {
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

    if (isTauriRuntime()) {
      await initTauriUpdateHandling();
      return;
    }

    await initWebUpdateHandling();
    await initNativeUpdateHandling();
  };

  const handleInstall = () => {
    if (!mobilePlatform.value) return;

    const start = Date.now();

    if (mobilePlatform.value === MobilePlatformEnum.ANDROID) {
      window.location.href = 'myapp://open';

      setTimeout(() => {
        if (Date.now() - start < 1500) {
          window.location.href = RUSTORE_APP_URL;
        }
      }, 1200);

      return;
    }

    if (mobilePlatform.value === MobilePlatformEnum.APPLE) {
      window.location.href = 'myapp://open';

      setTimeout(() => {
        if (Date.now() - start < 1500) {
          window.location.href = 'https://your-domain.com/open';
        }
      }, 1200);
    }
  };

  const handleUpdateClick = async () => {
    if (isTauriRuntime()) {
      if (isUpdateFlowPending.value) {
        return;
      }

      isUpdateFlowPending.value = true;

      try {
        const didInstall = await installTauriUpdate();

        if (!didInstall) {
          await refreshTauriUpdateInfo();
        }
      } catch (error) {
        console.warn('Failed to install Tauri update:', error);
        await refreshTauriUpdateInfo();
      } finally {
        isUpdateFlowPending.value = false;
      }

      return;
    }

    if (!isRuStoreUpdateSupported()) {
      persistCurrentWebUpdateVersion();
      window.location.reload();
      return;
    }

    if (
      updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADING ||
      updateInstallStatus.value === RuStoreInstallStatus.PENDING ||
      isUpdateFlowPending.value
    ) {
      return;
    }

    isUpdateFlowPending.value = true;

    try {
      if (updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADED) {
        await completeRuStoreFlexibleUpdate();
        return;
      }

      await refreshNativeUpdateInfo();

      if (!nativeAppUpdateInfo.value) {
        window.location.href = RUSTORE_APP_URL;
        return;
      }

      await startRuStoreFlexibleUpdate();
    } catch (error) {
      console.warn('Failed to start RuStore update flow:', error);
      window.location.href = RUSTORE_APP_URL;
    } finally {
      isUpdateFlowPending.value = false;
    }
  };

  const dismissUpdateBanner = () => {
    if (isTauriUpdateBanner.value) {
      isTauriUpdateBanner.value = false;
      showUpdateBanner.value = false;
      return;
    }

    persistCurrentWebUpdateVersion();
    showUpdateBanner.value = false;
  };

  const updateActionLabel = computed(() => {
    if (isTauriRuntime()) {
      return isUpdateFlowPending.value ? 'Загрузка...' : 'Обновить';
    }

    if (!Capacitor.isNativePlatform()) {
      return 'Обновить';
    }

    if (isUpdateFlowPending.value) {
      return 'Загрузка...';
    }

    switch (updateInstallStatus.value) {
      case RuStoreInstallStatus.DOWNLOADING:
      case RuStoreInstallStatus.PENDING:
        return 'Загрузка...';
      case RuStoreInstallStatus.DOWNLOADED:
        return 'Перезапустить';
      default:
        return 'Установить';
    }
  });

  const isUpdateActionDisabled = computed(
    () =>
      isUpdateFlowPending.value ||
      (Capacitor.isNativePlatform() &&
        (updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADING ||
          updateInstallStatus.value === RuStoreInstallStatus.PENDING))
  );

  onMounted(() => {
    void detect();
  });

  onBeforeUnmount(() => {
    if (webUpdateIntervalId !== null) {
      window.clearInterval(webUpdateIntervalId);
      webUpdateIntervalId = null;
    }
  });

  return {
    mobilePlatform,
    isMobileApp,
    showDownloadModal,
    showUpdateBanner,
    updateActionLabel,
    isUpdateActionDisabled,
    handleInstall,
    handleUpdateClick,
    dismissUpdateBanner
  };
}
