import { onMounted, ref } from 'vue';

export function useIosInstallPrompt() {
  const isOpen = ref(false);

  const removeInstallQueryParam = (): void => {
    const url = new URL(window.location.href);

    url.searchParams.delete('installIOS');

    window.history.replaceState({}, document.title, url.toString());
  };

  const closeInstallHelp = (): void => {
    isOpen.value = false;
    removeInstallQueryParam();
  };

  onMounted(() => {
    if (window.location.pathname.split('/').filter(Boolean)[0] === 'call') {
      return;
    }

    if (new URL(window.location.href).searchParams.has('installIOS')) {
      isOpen.value = true;
    }
  });

  return {
    isOpen,
    closeInstallHelp
  };
}
