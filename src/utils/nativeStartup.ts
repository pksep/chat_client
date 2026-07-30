export const NATIVE_STARTUP_READY_EVENT = 'chat:native-startup-ready';

export const dispatchNativeStartupReady = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(NATIVE_STARTUP_READY_EVENT));
};
