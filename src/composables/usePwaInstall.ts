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

  // Determines if we're currently running in standalone PWA mode
  const isRunningAsApp = computed(() => isStandalone.value);

  // Determines if button should be shown at all:
  // - Show "Download to Device" when canInstall is true (browser, not installed)
  // - Show "Go to Application" when isInstalled is true but not running as app
  const shouldShowButton = computed(
    () => canInstall.value || (isInstalled.value && !isStandalone.value)
  );

  // Determines the button label:
  // - "Download to Device" when PWA can be installed
  // - "Go to Application" when PWA is installed but user is in browser
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

  // Opens the installed PWA by navigating to the app URL
  // Modern browsers will open the installed PWA when navigating to its URL
  const handleOpenApp = () => {
    // Get the app's start URL from the current origin
    const startUrl = window.location.origin;
    // Open in a new window/tab - browsers with installed PWA will open the PWA
    window.open(startUrl, '_blank');
  };

  // Combined action handler that determines what to do based on state
  const handleButtonAction = async () => {
    if (canInstall.value) {
      await handleInstall();
    } else if (isInstalled.value && !isStandalone.value) {
      handleOpenApp();
    }
  };

  const checkDisplayMode = () => {
    // Check if running in standalone mode (PWA)
    const standaloneMatch = window.matchMedia('(display-mode: standalone)');
    isStandalone.value = standaloneMatch.matches;

    // iOS Safari uses navigator.standalone
    if ('standalone' in navigator && (navigator as any).standalone === true) {
      isStandalone.value = true;
    }

    // If in standalone mode, the app is installed
    if (isStandalone.value) {
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

    // Listen for display mode changes
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
