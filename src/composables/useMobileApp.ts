import { Capacitor } from '@capacitor/core';
import { computed, onMounted, ref } from 'vue';
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

const RUSTORE_APP_URL = 'https://www.rustore.ru/catalog/app/sep.pksep.app';

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
    if (!isRuStoreUpdateSupported()) {
      window.location.href = RUSTORE_APP_URL;
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
    showUpdateBanner.value = false;
  };

  const updateActionLabel = computed(() => {
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
      updateInstallStatus.value === RuStoreInstallStatus.DOWNLOADING ||
      updateInstallStatus.value === RuStoreInstallStatus.PENDING
  );

  onMounted(() => {
    void detect();
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
