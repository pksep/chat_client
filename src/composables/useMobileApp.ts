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

    const start = Date.now();
    const apkUrl = `${window.location.origin}/release/android/app.apk`;

    // ANDROID
    if (mobilePlatform.value === MobilePlatformEnum.ANDROID) {
      /**
       * Используем intent:// для Chrome на Android.
       * Если приложение установлено — оно откроется.
       * Если нет — браузер перенаправит на S.browser_fallback_url (прямую ссылку на APK).
       */
      const intentUrl = `intent://open#Intent;scheme=myapp;package=sep.pksep.app;S.browser_fallback_url=${encodeURIComponent(apkUrl)};end`;
      window.location.href = intentUrl;
      return;
    }

    // IOS
    if (mobilePlatform.value === MobilePlatformEnum.APPLE) {
      /**
       * iOS:
       * Пробуем открыть через кастомную схему.
       * Если не открылось за 1.5 сек — значит приложения нет.
       */
      window.location.href = 'myapp://open';

      setTimeout(() => {
        if (Date.now() - start < 1500) {
          // Для iOS нет прямой загрузки APK/IPA обычно,
          // можно редиректить в App Store или на лендинг
          window.location.href = 'https://your-domain.com/open';
        }
      }, 1200);
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
