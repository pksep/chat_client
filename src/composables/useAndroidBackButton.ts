import { onMounted, onUnmounted } from 'vue';

interface UseAndroidBackButtonOptions {
  onBack?: () => void;
  addToHistory?: boolean;
  state?: any;
  title?: string;
}

export function useAndroidBackButton(
  options: UseAndroidBackButtonOptions = {}
) {
  const {
    onBack,
    addToHistory = true,
    state = null,
    title = document.title
  } = options;

  const handlePopState = (event: PopStateEvent) => {
    event.preventDefault();

    if (onBack) {
      onBack();
    } else {
      window.history.pushState({}, document.title, window.location.pathname);
    }
  };

  onMounted(() => {
    if (addToHistory) {
      window.history.pushState(state, title, window.location.href);
    }

    window.addEventListener('popstate', handlePopState);
  });

  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState);
  });

  const navigateToMainScreen = () => {
    window.history.pushState({}, document.title, window.location.pathname);
  };

  return {
    navigateToMainScreen
  };
}
