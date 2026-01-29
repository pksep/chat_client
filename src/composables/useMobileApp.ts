import { ref, onMounted } from 'vue';

type MobilePlatform = 'android' | 'apple' | null;

export function useMobileApp() {
  const platform = ref<MobilePlatform>(null);
  const isMobileApp = ref(false);

  const detect = () => {
    const ua = navigator.userAgent || '';

    if (/Android/i.test(ua)) {
      platform.value = 'android';
      isMobileApp.value = true;
      return;
    }

    if (/iPhone|iPad|iPod/i.test(ua)) {
      platform.value = 'apple';
      isMobileApp.value = true;
      return;
    }

    platform.value = null;
    isMobileApp.value = false;
  };

  const handleInstall = () => {
    if (!platform.value) return;

    // ANDROID
    if (platform.value === 'android') {
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
    if (platform.value === 'apple') {
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
    platform,
    isMobileApp,
    handleInstall
  };
}
