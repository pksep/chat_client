import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ref } from 'vue';
import { isTauriRuntime } from './useTauriNotifications';

interface TauriWindowStatePayload {
  focused?: boolean;
  minimized?: boolean;
  visible?: boolean;
}

const TAURI_WINDOW_STATE_EVENT = 'sep-chat://window-state';
const USER_IDLE_TIMEOUT_MS = 120_000;
const USER_ACTIVITY_EVENTS = [
  'keydown',
  'mousedown',
  'mousemove',
  'pointerdown',
  'pointermove',
  'touchstart',
  'wheel'
] as const;

const tauriWindowFocused = ref(true);
const tauriWindowVisible = ref(true);
const tauriWindowMinimized = ref(false);
const capacitorAppActive = ref(true);
const isUserIdle = ref(false);

let isTauriWindowStateBound = false;
let isCapacitorAppStateBound = false;
let isUserActivityTrackingBound = false;
let tauriWindowStatePollInterval: ReturnType<typeof setInterval> | null = null;
let userIdleTimeout: ReturnType<typeof setTimeout> | null = null;
let lastUserActivityAt = Date.now();
const windowStateChangeCallbacks = new Set<() => void>();

const notifyWindowStateChange = (): void => {
  windowStateChangeCallbacks.forEach(callback => {
    try {
      callback();
    } catch (error) {
      console.error('Failed to notify app visibility change:', error);
    }
  });
};

const applyTauriWindowState = (nextState: TauriWindowStatePayload): void => {
  const nextFocused =
    typeof nextState.focused === 'boolean'
      ? nextState.focused
      : tauriWindowFocused.value;
  const nextVisible =
    typeof nextState.visible === 'boolean'
      ? nextState.visible
      : tauriWindowVisible.value;
  const nextMinimized =
    typeof nextState.minimized === 'boolean'
      ? nextState.minimized
      : tauriWindowMinimized.value;
  const hasChanges =
    tauriWindowFocused.value !== nextFocused ||
    tauriWindowVisible.value !== nextVisible ||
    tauriWindowMinimized.value !== nextMinimized;
  const becameInteractive =
    hasChanges && nextVisible && !nextMinimized && nextFocused;
  const wasIdle = isUserIdle.value;

  tauriWindowFocused.value = nextFocused;
  tauriWindowVisible.value = nextVisible;
  tauriWindowMinimized.value = nextMinimized;

  if (becameInteractive) {
    markAppUserActivity();
  }

  if (hasChanges) {
    if (becameInteractive && wasIdle) {
      return;
    }

    notifyWindowStateChange();
  }
};

const scheduleUserIdleTimeout = (): void => {
  if (userIdleTimeout) {
    clearTimeout(userIdleTimeout);
  }

  const idleInMs = Math.max(
    0,
    USER_IDLE_TIMEOUT_MS - (Date.now() - lastUserActivityAt)
  );

  userIdleTimeout = setTimeout(() => {
    userIdleTimeout = null;

    if (Date.now() - lastUserActivityAt < USER_IDLE_TIMEOUT_MS) {
      scheduleUserIdleTimeout();
      return;
    }

    if (!isUserIdle.value) {
      isUserIdle.value = true;
      notifyWindowStateChange();
    }
  }, idleInMs);
};

export const markAppUserActivity = (): void => {
  const wasIdle = isUserIdle.value;

  lastUserActivityAt = Date.now();
  isUserIdle.value = false;
  scheduleUserIdleTimeout();

  if (wasIdle) {
    notifyWindowStateChange();
  }
};

const ensureUserActivityTracking = (): void => {
  if (
    isUserActivityTrackingBound ||
    typeof window === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return;
  }

  USER_ACTIVITY_EVENTS.forEach(eventName => {
    window.addEventListener(eventName, markAppUserActivity, {
      passive: true
    });
  });

  window.addEventListener('focus', markAppUserActivity);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      markAppUserActivity();
    }
  });

  scheduleUserIdleTimeout();
  isUserActivityTrackingBound = true;
};

const applyCapacitorAppState = (isActive: boolean): void => {
  if (capacitorAppActive.value === isActive) {
    return;
  }

  capacitorAppActive.value = isActive;

  if (isActive) {
    markAppUserActivity();
  }

  notifyWindowStateChange();
};

const ensureCapacitorAppStateTracking = (): void => {
  if (!Capacitor.isNativePlatform() || isCapacitorAppStateBound) {
    return;
  }

  isCapacitorAppStateBound = true;

  void CapacitorApp.getState()
    .then(({ isActive }) => applyCapacitorAppState(isActive))
    .catch(error => {
      console.warn('Failed to resolve native app state:', error);
    });

  void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
    applyCapacitorAppState(isActive);
  });
};

export const syncTauriWindowState = async (): Promise<void> => {
  if (!isTauriRuntime()) {
    applyTauriWindowState({
      focused: true,
      minimized: false,
      visible: true
    });
    return;
  }

  try {
    const appWindow = getCurrentWindow();
    const [focused, visible, minimized] = await Promise.all([
      appWindow.isFocused(),
      appWindow.isVisible(),
      appWindow.isMinimized()
    ]);

    applyTauriWindowState({
      focused,
      minimized,
      visible
    });
  } catch (error) {
    console.warn('Failed to resolve Tauri window state:', error);
  }
};

export const ensureTauriWindowStateTracking = (): void => {
  ensureUserActivityTracking();
  ensureCapacitorAppStateTracking();

  if (!isTauriRuntime() || isTauriWindowStateBound) {
    return;
  }

  const appWindow = getCurrentWindow();

  void syncTauriWindowState();

  void listen<TauriWindowStatePayload>(TAURI_WINDOW_STATE_EVENT, event => {
    applyTauriWindowState(event.payload || {});
  });

  void appWindow.onFocusChanged(({ payload: focused }) => {
    applyTauriWindowState({ focused });
    void syncTauriWindowState();
  });

  void appWindow.onResized(() => {
    void syncTauriWindowState();
  });

  window.addEventListener('focus', () => {
    void syncTauriWindowState();
  });

  window.addEventListener('blur', () => {
    void syncTauriWindowState();
  });

  document.addEventListener('visibilitychange', () => {
    void syncTauriWindowState();
  });

  if (!tauriWindowStatePollInterval) {
    tauriWindowStatePollInterval = setInterval(() => {
      void syncTauriWindowState();
    }, 1000);
  }

  isTauriWindowStateBound = true;
};

export const subscribeToAppVisibilityChanges = (
  callback: () => void
): (() => void) => {
  windowStateChangeCallbacks.add(callback);

  return () => {
    windowStateChangeCallbacks.delete(callback);
  };
};

export const getIsAppActivelyVisible = (): boolean => {
  const canUseVisibleAsFocused =
    Capacitor.isNativePlatform() ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
  const tauriWindowReady =
    !isTauriRuntime() ||
    (tauriWindowVisible.value &&
      !tauriWindowMinimized.value &&
      (tauriWindowFocused.value || canUseVisibleAsFocused));

  return (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    (!Capacitor.isNativePlatform() || capacitorAppActive.value) &&
    !isUserIdle.value &&
    (document.hasFocus() || canUseVisibleAsFocused) &&
    tauriWindowReady
  );
};

export const getIsAppBackgrounded = (): boolean => !getIsAppActivelyVisible();

export const getIsAppUserIdle = (): boolean => isUserIdle.value;
