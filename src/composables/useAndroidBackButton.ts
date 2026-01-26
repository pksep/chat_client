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
  /**
   * Custom back handler. Return `true` if the event was handled (e.g., modal closed),
   * return `false` or `undefined` to continue with context-aware navigation.
   */
  onBack?: () => boolean | void;
  onForward?: () => void;
  handleExit?: () => void;
  addToHistory?: boolean;
  state?: any;
  title?: string;
  enableContextAwareNavigation?: boolean;
}

/**
 * Detects if the current device is a mobile device based on viewport width and user agent.
 */
export const isMobileDevice = (): boolean => {
  return (
    window.innerWidth <= 768 ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    )
  );
};

/**
 * Detects if the app is running as a PWA (standalone mode).
 */
export const isPWA = (): boolean => {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true
  );
};

/**
 * Detects if the device is running Android.
 */
export const isAndroid = (): boolean => {
  return /android/i.test(navigator.userAgent);
};

/**
 * Detects if the device is running iOS.
 */
export const isIOS = (): boolean => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
};

/**
 * Gets platform-specific exit handler.
 * On Android PWA, attempts to close the window.
 * On iOS PWA, shows an instruction since programmatic closing is not possible.
 * In regular browser, navigates back in history.
 */
export const getPlatformSpecificExitHandler = (): (() => void) => {
  if (isPWA()) {
    if (isAndroid()) {
      return () => {
        // Android PWA can typically be closed programmatically
        window.close();
      };
    } else if (isIOS()) {
      return () => {
        // iOS PWA cannot be closed programmatically
        // Navigate to default route as fallback
        navigateToDefault();
      };
    }
  }
  // Regular browser - go back in history
  return () => {
    window.history.back();
  };
};

/**
 * Performs context-aware back navigation based on current route.
 * - From specific dialog/group → to list view
 * - From list view → to default (main screen)
 * - From AI/Assistant → to assistant list or default
 * - From default (main screen) on mobile → attempt to exit app
 */
const performContextAwareBackNavigation = (
  customExitHandler?: () => void
): void => {
  const route = currentRoute.value;

  // If on default/main screen on mobile, attempt to exit the app
  if (route.type === RouteTypes.DEFAULT && isMobileDevice()) {
    if (customExitHandler) {
      customExitHandler();
    } else {
      const exitHandler = getPlatformSpecificExitHandler();
      exitHandler();
    }
    return;
  }

  // Navigate based on current route context
  switch (route.type) {
    case RouteTypes.DIALOGS:
      if (route.id) {
        // From specific dialog → to dialogs list
        navigateToDialogsList();
      } else {
        // From dialogs list → to default (main screen)
        navigateToDefault();
      }
      break;

    case RouteTypes.GROUP:
      if (route.id) {
        // From specific group → to groups list
        navigateToGroupsList();
      } else {
        // From groups list → to default (main screen)
        navigateToDefault();
      }
      break;

    case RouteTypes.AI:
      // From AI chat → to assistant section
      navigateToAssistant();
      break;

    case RouteTypes.ASSISTANT:
      // From assistant section → to default (main screen)
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

  // Track history length for forward navigation detection
  const previousHistoryLength = ref(
    typeof window !== 'undefined' ? window.history.length : 0
  );
  const canGoForward = ref(false);

  const handlePopState = (event: PopStateEvent) => {
    event.preventDefault();

    // If custom onBack is provided, call it first
    // If it returns true, the event was handled (e.g., modal was closed)
    if (onBack) {
      const handled = onBack();
      if (handled === true) {
        // Re-push state to prevent actual navigation
        window.history.pushState({}, document.title, window.location.href);
        return;
      }
    }

    // If context-aware navigation is enabled, use it
    if (enableContextAwareNavigation) {
      performContextAwareBackNavigation(handleExit);
    } else {
      // Default behavior: push new state to prevent actual navigation
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
    // Check if page was loaded from back/forward cache
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

    // Initialize history length tracking
    previousHistoryLength.value = window.history.length;
  });

  onUnmounted(() => {
    window.removeEventListener('popstate', handlePopState);
    window.removeEventListener('pageshow', handlePageShow);
  });

  /**
   * Navigates to the main screen and updates history.
   */
  const navigateToMainScreen = (): void => {
    window.history.pushState({}, document.title, window.location.pathname);
    navigateToDefault();
  };

  /**
   * Manually triggers the back navigation logic.
   * Useful for UI back buttons.
   */
  const triggerBack = (): void => {
    // If custom onBack is provided, call it first
    if (onBack) {
      const handled = onBack();
      if (handled === true) {
        return;
      }
    }

    // If context-aware navigation is enabled, use it
    if (enableContextAwareNavigation) {
      performContextAwareBackNavigation(handleExit);
    } else {
      window.history.back();
    }
  };

  /**
   * Navigates forward in history if possible.
   */
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
