import { MobilePlatformEnum } from '../components/interfaces/interfaces';
import { ref, onMounted } from 'vue';
import { Capacitor } from '@capacitor/core';

export function useMobileApp() {
  const mobilePlatform = ref<MobilePlatformEnum | null>(null);
  const isMobileApp = ref(false);
  const showDownloadModal = ref(false);

  const detect = () => {
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
        ('standalone' in navigator && (navigator as any).standalone === true);
      const isNative = Capacitor.isNativePlatform();

      if (!isPWA && !isNative) {
        showDownloadModal.value = true;
      }
    }
  };

  const handleInstall = () => {
    if (!mobilePlatform.value) return;

    // ANDROID
    if (mobilePlatform.value === MobilePlatformEnum.ANDROID) {
      const start = Date.now();

      // пробуем открыть приложение
      window.location.href = 'myapp://open';

      // если не открылось — качаем APK
      setTimeout(() => {
        if (Date.now() - start < 1500) {
          window.location.href = '/release/android/app.apk';
        }
      }, 1200);

      return;
    }

    // IOS
    if (mobilePlatform.value === MobilePlatformEnum.APPLE) {
      /**
       * iOS:
       * если app установлен → откроется через Universal Link
       * если нет → просто откроется сайт (ничего делать не нужно)
       */
      window.location.href = 'https://your-domain.com/open';
    }
  };

  onMounted(detect);

  return {
    mobilePlatform,
    isMobileApp,
    showDownloadModal,
    handleInstall
  };
}
