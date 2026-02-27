import { App as CapacitorApp } from '@capacitor/app';

const backButtonHandlers: (() => void)[] = [];
let initialized = false;

export function useBackButton() {
  if (!initialized) {
    CapacitorApp.addListener('backButton', () => {
      if (backButtonHandlers.length > 0) {
        // Execute the last handler (the one most recently added, like a top-level modal)
        backButtonHandlers[backButtonHandlers.length - 1]();
      } else {
        // You could handle default fallback here or just default behavior
      }
    });
    initialized = true;
  }

  const addHandler = (handler: () => void) => {
    if (!backButtonHandlers.includes(handler)) {
      backButtonHandlers.push(handler);
    }
  };

  const removeHandler = (handler: () => void) => {
    const index = backButtonHandlers.indexOf(handler);
    if (index !== -1) {
      backButtonHandlers.splice(index, 1);
    }
  };

  return { addHandler, removeHandler };
}
