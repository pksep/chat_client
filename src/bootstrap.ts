void (async () => {
  performance.mark('chat-startup:bootstrap');
  await window.__chatNativeStartupCleanup;
  performance.mark('chat-startup:native-route-ready');
  await import('./main');
})();

export {};
