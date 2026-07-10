import { ref, onMounted, onBeforeUnmount } from 'vue';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePwaInstall() {
  const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
  const canInstall = ref(false);
  const isInstalled = ref(false);
  const isCallWindowRoute = (): boolean =>
    window.location.pathname.split('/').filter(Boolean)[0] === 'call';

  const beforeInstallHandler = (e: Event) => {
    if (isCallWindowRoute()) {
      return;
    }

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

  onMounted(() => {
    if (isCallWindowRoute()) {
      return;
    }

    window.addEventListener('beforeinstallprompt', beforeInstallHandler);
    window.addEventListener('appinstalled', appInstalledHandler);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      isInstalled.value = true;
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener('beforeinstallprompt', beforeInstallHandler);
    window.removeEventListener('appinstalled', appInstalledHandler);
  });

  return {
    canInstall,
    isInstalled,
    handleInstall
  };
}
