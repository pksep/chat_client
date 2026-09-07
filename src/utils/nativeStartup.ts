export const NATIVE_STARTUP_READY_EVENT = 'chat:native-startup-ready';
export const NOTIFICATION_TOPIC_SHELL_READY_EVENT =
  'chat:notification-topic-shell-ready';

export const dispatchNativeStartupReady = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(NATIVE_STARTUP_READY_EVENT));
};

export const dispatchNotificationTopicShellReady = (): void => {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(NOTIFICATION_TOPIC_SHELL_READY_EVENT));
};
