import { App as CapacitorApp } from '@capacitor/app';
import { onBeforeUnmount, watch, type WatchSource } from 'vue';

export enum BackButtonPriority {
  navigation = 0,
  screen = 10,
  overlay = 20,
  keyboard = 30
}

const backButtonHandlers: Array<{
  handler: () => void;
  priority: BackButtonPriority;
}> = [];
let initialized = false;

export function useBackButton() {
  if (!initialized) {
    CapacitorApp.addListener('backButton', () => {
      if (backButtonHandlers.length > 0) {
        // Окна и меню закрываются раньше экранов и перехода из переписки.
        const top = backButtonHandlers.reduce((previous, current) =>
          current.priority >= previous.priority ? current : previous
        );
        top.handler();
      } else {
        void CapacitorApp.exitApp();
      }
    });
    initialized = true;
  }

  const addHandler = (
    handler: () => void,
    priority = BackButtonPriority.navigation
  ) => {
    if (!backButtonHandlers.some(entry => entry.handler === handler)) {
      backButtonHandlers.push({ handler, priority });
    }
  };

  const removeHandler = (handler: () => void) => {
    const index = backButtonHandlers.findIndex(
      entry => entry.handler === handler
    );
    if (index !== -1) {
      backButtonHandlers.splice(index, 1);
    }
  };

  return { addHandler, removeHandler };
}

export function useBackButtonHandler(
  active: WatchSource<boolean>,
  handler: () => void,
  priority = BackButtonPriority.screen
): void {
  const { addHandler, removeHandler } = useBackButton();
  watch(
    active,
    enabled => {
      if (enabled) addHandler(handler, priority);
      else removeHandler(handler);
    },
    { immediate: true, flush: 'sync' }
  );
  onBeforeUnmount(() => removeHandler(handler));
}
