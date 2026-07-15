try {
  importScripts('/chat-background-sync-sw.js');
} catch (error) {
  console.warn('[ChatBackgroundSyncSW] Не удалось импортировать helper', error);
}

const CHAT_BACKGROUND_SYNC_TAG = 'chat-background-sync';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

let appFocused = false;
let activeTopicId = null;

const CHAT_ROUTE_TYPES = new Set(['dialogs', 'group']);

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

const getPayloadUrl = payload =>
  payload.url ||
  payload.link ||
  payload.click_action ||
  payload['gcm.notification.click_action'] ||
  null;

const localizeUrlToClientOrigin = value => {
  if (!value) {
    return null;
  }

  try {
    const parsedUrl = new URL(value, self.location.origin);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2 && CHAT_ROUTE_TYPES.has(pathParts[0])) {
      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }

    if (parsedUrl.origin !== self.location.origin) {
      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    }

    return parsedUrl.toString();
  } catch (error) {
    console.warn('Не удалось нормализовать URL уведомления:', error);
    return null;
  }
};

const getNotificationUrl = payload => {
  const payloadUrl = getPayloadUrl(payload);
  const localizedPayloadUrl = localizeUrlToClientOrigin(payloadUrl);

  if (localizedPayloadUrl) {
    return localizedPayloadUrl;
  }

  if (payload.topicId) {
    if (String(payload.topicType || '').toUpperCase() === 'GROUP') {
      return `/group/${payload.topicId}`;
    }

    return `/dialogs/${payload.topicId}`;
  }

  return '/';
};

const buildCallActionUrl = (payload, action) => {
  const targetUrl = new URL(getNotificationUrl(payload), self.location.origin);

  targetUrl.searchParams.set('callAction', action);

  if (payload.roomId) {
    targetUrl.searchParams.set('roomId', payload.roomId);
  }

  if (payload.topicId) {
    targetUrl.searchParams.set('topicId', payload.topicId);
  }

  return targetUrl.toString();
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

const closeAllNotifications = async () => {
  const notifications = await self.registration.getNotifications();

  notifications.forEach(notification => {
    notification.close();
  });
};

const notifyChatBackgroundSyncUpdated = async source => {
  const clientList = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });

  clientList.forEach(client => {
    client.postMessage({
      type: 'CHAT_BACKGROUND_SYNC_UPDATED',
      source
    });
  });
};

const registerChatBackgroundSyncRetry = async () => {
  if (!self.registration.sync?.register) {
    return;
  }

  try {
    await self.registration.sync.register(CHAT_BACKGROUND_SYNC_TAG);
  } catch (error) {
    console.warn(
      '[ChatBackgroundSyncSW] Не удалось зарегистрировать retry sync',
      error
    );
  }
};

const runChatBackgroundSyncFromPayload = async (payload, source) => {
  if (!self.chatBackgroundSync?.runChatBackgroundSync) {
    return { ok: false, retryable: false };
  }

  const result = await self.chatBackgroundSync.runChatBackgroundSync({
    reason: payload.reason || source || 'push',
    topicId: payload.topicId || payload.tag || null,
    pts: payload.pts || payload.toPts || null,
    eventId: payload.eventId || null
  });

  if (result?.ok) {
    await notifyChatBackgroundSyncUpdated(source);
  } else if (result?.retryable) {
    await registerChatBackgroundSyncRetry();
  }

  return result;
};

self.addEventListener('message', event => {
  if (event.data?.type === 'APP_CONTEXT') {
    appFocused = Boolean(event.data.focused);
    activeTopicId = event.data.topicId || null;
  }

  if (event.data?.type === 'CLEAR_TOPIC_NOTIFICATIONS') {
    event.waitUntil(closeNotificationsForTopic(event.data.topicId));
  }

  if (event.data?.type === 'CLEAR_ALL_NOTIFICATIONS') {
    event.waitUntil(closeAllNotifications());
  }

  if (event.data?.type === 'CHAT_BACKGROUND_SYNC_REQUEST') {
    event.waitUntil(
      runChatBackgroundSyncFromPayload(event.data.request || {}, 'app-request')
    );
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

      if (payload.action === 'CHAT_SYNC') {
        await runChatBackgroundSyncFromPayload(payload, 'push');

        if (
          !payload.title &&
          !payload.body &&
          payload.type !== 'incoming_call'
        ) {
          return;
        }
      }

      if (appFocused && topicId && activeTopicId === topicId) {
        await closeNotificationsForTopic(topicId);
        return;
      }

      const title = payload.title || 'New message';
      const url = getNotificationUrl(payload);
      const isIncomingCall = payload.type === 'incoming_call';
      const tag = payload.tag || payload.roomId || topicId || 'chat-message';

      await self.registration.showNotification(title, {
        body: payload.body || '',
        icon: payload.icon || '/images/favicon.ico',
        badge: payload.icon || '/images/favicon.ico',
        tag,
        renotify: true,
        silent: !isIncomingCall,
        requireInteraction: isIncomingCall,
        actions: isIncomingCall
          ? [
              {
                action: 'decline',
                title: 'Decline'
              },
              {
                action: 'accept',
                title: 'Answer'
              }
            ]
          : [],
        data: {
          ...payload,
          topicId,
          url
        }
      });
    })()
  );
});

self.addEventListener('sync', event => {
  if (event.tag !== CHAT_BACKGROUND_SYNC_TAG) {
    return;
  }

  event.waitUntil(
    runChatBackgroundSyncFromPayload(
      {
        reason: 'sync-retry'
      },
      'sync'
    )
  );
});

self.addEventListener('periodicsync', event => {
  if (event.tag !== CHAT_BACKGROUND_SYNC_TAG) {
    return;
  }

  event.waitUntil(
    runChatBackgroundSyncFromPayload(
      {
        reason: 'periodic-sync'
      },
      'periodic-sync'
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  const payload = event.notification.data || {};
  const isIncomingCall = payload.type === 'incoming_call';
  const action =
    event.action === 'accept' || event.action === 'decline'
      ? event.action
      : null;
  const absoluteUrl =
    isIncomingCall && action
      ? buildCallActionUrl(payload, action)
      : new URL(getNotificationUrl(payload), self.location.origin).toString();

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

          if (action) {
            client.postMessage({
              type: 'CALL_ACTION',
              action,
              roomId: payload.roomId || null,
              topicId: payload.topicId || null
            });
          } else {
            client.postMessage({
              type: 'NOTIFICATION_NAVIGATE',
              notification: payload
            });
          }

          return client.focus();
        }

        return clients.openWindow(absoluteUrl);
      })
  );
});
