import { onMounted, onUnmounted, ref, readonly } from 'vue';
import {
  currentRoute,
  navigateToDefault,
  navigateToDialogsList,
  navigateToGroupsList,
  navigateToAssistant,
  RouteTypes
} from './navigation/useUrlRouting';

interface UseAndroidBackButtonOptions {
  onBack?: () => boolean | void;
  onForward?: () => void;
  handleExit?: () => void;
  addToHistory?: boolean;
  state?: any;
  title?: string;
  enableContextAwareNavigation?: boolean;
}

export const isMobileDevice = (): boolean => {
  return (
    window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  );
};

export const isPWA = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
};

export const isAndroid = (): boolean => {
  return /android/i.test(navigator.userAgent);
};

export const isIOS = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

export const getPlatformSpecificExitHandler = (): (() => void) => {
  if (isPWA()) {
    if (isAndroid()) {
      return () => {
        window.close();
      };
    } else if (isIOS()) {
      return () => {
        navigateToDefault();
      };
    }
  }

  return () => {
    window.history.back();
  };
};

const performContextAwareBackNavigation = (
  customExitHandler?: () => void
): void => {
  const route = currentRoute.value;

  if (route.type === RouteTypes.DEFAULT && isMobileDevice()) {
    if (customExitHandler) {
      customExitHandler();
    } else {
      const exitHandler = getPlatformSpecificExitHandler();
      exitHandler();
    }
    return;
  }

  switch (route.type) {
    case RouteTypes.DIALOGS:
      if (route.id) {
        navigateToDialogsList();
      } else {
        navigateToDefault();
      }
      break;

    case RouteTypes.GROUP:
      if (route.id) {
        navigateToGroupsList();
      } else {
        navigateToDefault();
      }
      break;

    case RouteTypes.AI:
      navigateToAssistant();
      break;

    case RouteTypes.ASSISTANT:
      navigateToDefault();
      break;

    default:
      navigateToDefault();
      break;
  }
};

export function useAndroidBackButton(
  options: UseAndroidBackButtonOptions = {}
) {
  const {
    onBack,
    onForward,
    handleExit,
    addToHistory = true,
    state = null,
    title = document.title,
    enableContextAwareNavigation = false
  } = options;

  const previousHistoryLength = ref(
    typeof window !== 'undefined' ? window.history.length : 0
  );
  const canGoForward = ref(false);

  const handlePopState = (event: PopStateEvent) => {
    event.preventDefault();

    if (onBack) {
      const handled = onBack();
      if (handled === true) {
        window.history.pushState({}, document.title, window.location.href);
        return;
      }
    }

    if (enableContextAwareNavigation) {
      performContextAwareBackNavigation(handleExit);
    } else {
      window.history.pushState({}, document.title, window.location.pathname);
    }
  };

  const checkForForwardNavigation = (): void => {
    const currentLength = window.history.length;
    if (currentLength > previousHistoryLength.value) {
      canGoForward.value = false;
      if (onForward) {
        onForward();
      }
    }
    previousHistoryLength.value = currentLength;
  };

  const handlePageShow = (event: PageTransitionEvent): void => {
    if (event.persisted) {
      checkForForwardNavigation();
    }
  };

  onMounted(() => {
    if (addToHistory) {
      window.history.pushState(state, title, window.location.href);
    }

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pageshow', handlePageShow);

    previousHistoryLength.value = window.history.length;
  });

  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener('pageshow', handlePageShow);
  });

  const navigateToMainScreen = (): void => {
    window.history.pushState({}, document.title, window.location.pathname);
    navigateToDefault();
  };

  const triggerBack = (): void => {
    if (onBack) {
      const handled = onBack();
      if (handled === true) {
        return;
      }
    }

    if (enableContextAwareNavigation) {
      performContextAwareBackNavigation(handleExit);
    } else {
      window.history.back();
    }
  };

  const navigateForward = (): void => {
    window.history.forward();
  };

  return {
    navigateToMainScreen,
    triggerBack,
    navigateForward,
    canGoForward: readonly(canGoForward),
    isMobile: isMobileDevice,
    isPWA,
    isAndroid,
    isIOS
  };
}
