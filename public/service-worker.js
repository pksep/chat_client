// ===============================
// PUSH PRESENCE STATE
// ===============================
let appFocused = false;

// receive focus state from page
self.addEventListener('message', event => {
  if (event.data?.type === 'APP_FOCUS') {
    appFocused = event.data.focused;
  }
});

// ===============================
// PUSH HANDLER
// ===============================
self.addEventListener('push', event => {
  event.waitUntil(
    (async () => {
      // if user is actually watching chat -> no push
      if (appFocused) {
        return;
      }

      let data = {};
      try {
        data = event.data?.json() || {};
      } catch {
        data = {
          title: 'Новое сообщение',
          body: event.data?.text() || ''
        };
      }

      const title = data.title || 'Новое сообщение';

      const options = {
        body: data.body || '',
        icon: data.icon || '/images/favicon.ico',
        data: data.url || '/',
        badge: data.icon || '/images/favicon.ico',
        tag: data.tag || 'chat-message',
        renotify: true
      };

      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const targetUrl = event.notification.data;

      const clientList = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      // Try to find already opened PWA window
      for (const client of clientList) {
        // Check if it's YOUR app (same origin)
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();

          // Navigate existing tab to saved URL
          if ('navigate' in client) {
            await client.navigate(targetUrl);
          }

          return; // STOP — do not open new tab
        }
      }

      // If no PWA window exists → open new
      await clients.openWindow(targetUrl);
    })()
  );
});
