self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

let appFocused = false;
let activeTopicId = null;

const normalizePayload = rawData => {
  if (!rawData || typeof rawData !== 'object') {
    return {};
  }

  const nestedData =
    rawData.data && typeof rawData.data === 'object' ? rawData.data : {};
  const rest = { ...rawData };
  delete rest.data;

  return {
    ...nestedData,
    ...rest
  };
};

const getNotificationUrl = payload => {
  if (payload.url) {
    return payload.url;
  }

  if (payload.topicId) {
    if (String(payload.topicType || '').toUpperCase() === 'GROUP') {
      return `/group/${payload.topicId}`;
    }

    return `/dialogs/${payload.topicId}`;
  }

  return '/';
};

const closeNotificationsForTopic = async topicId => {
  if (!topicId) {
    return;
  }

  const notifications = await self.registration.getNotifications();

  notifications.forEach(notification => {
    const notificationTopicId =
      notification.data?.topicId || notification.tag || null;

    if (notificationTopicId === topicId) {
      notification.close();
    }
  });
};

self.addEventListener('message', event => {
  if (event.data?.type === 'APP_CONTEXT') {
    appFocused = Boolean(event.data.focused);
    activeTopicId = event.data.topicId || null;
  }

  if (event.data?.type === 'CLEAR_TOPIC_NOTIFICATIONS') {
    event.waitUntil(closeNotificationsForTopic(event.data.topicId));
  }
});

self.addEventListener('push', event => {
  event.waitUntil(
    (async () => {
      let rawData = {};

      try {
        rawData = event.data?.json() || {};
      } catch {
        rawData = {
          title: 'New message',
          body: event.data?.text() || ''
        };
      }

      const payload = normalizePayload(rawData);
      const topicId = payload.topicId || payload.tag || null;

      if (payload.action === 'CLEAR_CHAT_NOTIFICATIONS') {
        await closeNotificationsForTopic(topicId);
        return;
      }

      if (appFocused && topicId && activeTopicId === topicId) {
        await closeNotificationsForTopic(topicId);
        return;
      }

      const title = payload.title || 'New message';
      const url = getNotificationUrl(payload);
      const tag = payload.tag || topicId || 'chat-message';

      await self.registration.showNotification(title, {
        body: payload.body || '',
        icon: payload.icon || '/images/favicon.ico',
        badge: payload.icon || '/images/favicon.ico',
        tag,
        renotify: true,
        data: {
          ...payload,
          topicId,
          url
        }
      });
    })()
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const targetUrl = getNotificationUrl(event.notification.data || {});
  const absoluteUrl = new URL(targetUrl, self.location.origin).toString();

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        const matchingClient =
          clientList.find(client =>
            client.url.startsWith(self.location.origin)
          ) || clientList[0];

        if (matchingClient) {
          const client = matchingClient;

          client.focus();

          if ('navigate' in client) {
            return client.navigate(absoluteUrl);
          }

          return clients.openWindow(absoluteUrl);
        }

        return clients.openWindow(absoluteUrl);
      })
  );
});
