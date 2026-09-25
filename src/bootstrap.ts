void (async () => {
  performance.mark('chat-startup:bootstrap');
  await window.__chatNativeStartupCleanup;
  performance.mark('chat-startup:native-route-ready');
  const mainReady = import('./main');
  if (
    'androidBridge' in window &&
    /^\/(dialogs|group)\/[^/]+/.test(window.location.pathname)
  ) {
    // Маршрут уже выбран. Чтение и компиляция переписки идут вместе с main,
    // чтобы готовая история не ждала следующего каскада импорта после SDK.
    void import('./components/MessageList.vue')
      .then(() => performance.mark('chat-startup:message-list-preloaded'))
      .catch(error => {
        console.warn('Не удалось заранее подготовить переписку:', error);
      });
  }
  await mainReady;
})();

export {};
