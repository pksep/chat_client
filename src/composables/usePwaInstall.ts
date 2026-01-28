import { ref, computed, onMounted, onBeforeUnmount } from 'vue';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePwaInstall() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
  const canInstall = ref(false);
  const isInstalled = ref(false);
  const isStandalone = ref(false);

  const isRunningAsApp = computed(() => isStandalone.value);

  const shouldShowButton = computed(
    () => canInstall.value || (isInstalled.value && !isStandalone.value)
  );
  console.log('shouldShowButton', isStandalone.value);

  const buttonLabel = computed(() => {
    if (canInstall.value) {
      return 'Загрузить на устройство';
    }
    if (isInstalled.value && !isStandalone.value) {
      return 'Перейти в приложение';
    }
    return '';
  });

  const beforeInstallHandler = (e: Event) => {
    e.preventDefault();
    deferredPrompt.value = e as BeforeInstallPromptEvent;
    canInstall.value = true;
  };

  const appInstalledHandler = () => {
    isInstalled.value = true;
    canInstall.value = false;
    deferredPrompt.value = null;
  };

  const handleInstall = async () => {
    if (!deferredPrompt.value) return;

    await deferredPrompt.value.prompt();
    const { outcome } = await deferredPrompt.value.userChoice;

    if (outcome === 'accepted') {
      canInstall.value = false;
      deferredPrompt.value = null;
    }
  };

  const handleOpenApp = () => {
    const startUrl = window.location.origin;
    window.open(startUrl, '_blank');
  };

  const handleButtonAction = async () => {
    if (canInstall.value) {
      await handleInstall();
    } else if (isInstalled.value && !isStandalone.value) {
      handleOpenApp();
    }
  };

  const checkDisplayMode = () => {
    const standaloneMatch = window.matchMedia('(display-mode: standalone)');
    isStandalone.value = standaloneMatch.matches;

    if ('standalone' in navigator && (navigator as any).standalone === true) {
      isStandalone.value = true;
    }

    if (!isStandalone.value) {
      isInstalled.value = true;
    }
  };

  const handleDisplayModeChange = (e: MediaQueryListEvent) => {
    isStandalone.value = e.matches;
    if (e.matches) {
      isInstalled.value = true;
    }
  };

  onMounted(() => {
    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    window.addEventListener('appinstalled', appInstalledHandler);

    checkDisplayMode();

    const standaloneMatch = window.matchMedia('(display-mode: standalone)');
    standaloneMatch.addEventListener('change', handleDisplayModeChange);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
    window.removeEventListener('appinstalled', appInstalledHandler);

    const standaloneMatch = window.matchMedia('(display-mode: standalone)');
    standaloneMatch.removeEventListener('change', handleDisplayModeChange);
  });

  return {
    canInstall,
    isInstalled,
    isStandalone,
    isRunningAsApp,
    shouldShowButton,
    buttonLabel,
    handleInstall,
    handleOpenApp,
    handleButtonAction
  };
}
