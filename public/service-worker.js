self.addEventListener('push', event => {
  console.log(event);

  let data = {};
  try {
    data = event.data?.json() || {};
  } catch {
    data = {
      title: 'Новое уведомление',
      body: event.data?.text() || ''
    };
  }

  const title = data.title || 'Новое уведомление';
  const options = {
    body: data.body || '',
    icon: data.icon || '/images/favicon.ico',
    data: data.url || '/'
  };

  event.waitUntil(
    (async () => {
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
