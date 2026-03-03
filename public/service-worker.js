// ===============================
// SERVICE WORKER UPDATES
// ===============================
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

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
    self.registration
      .getNotifications()
      .then(notifications => {
        // Close all notifications
        notifications.forEach(notification => notification.close());
      })
      .then(() => {
        const url = event.notification.data;

        return clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then(clientList => {
            for (const client of clientList) {
              if (client.url === url && 'focus' in client) {
                return client.focus();
              }
            }
            if (clients.openWindow) {
              return clients.openWindow(url);
            }
          });
      })
  );
});
