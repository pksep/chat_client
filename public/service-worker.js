try {
  importScripts('/chat-background-sync-sw.js');
} catch (error) {
  console.warn('[ChatBackgroundSyncSW] Не удалось импортировать helper', error);
}

const CHAT_BACKGROUND_SYNC_TAG = 'chat-background-sync';
const INCOMING_CALL_MAX_AGE_MS = 60_000;
const NOTIFICATION_STATE_DB = 'chat-notification-state';
const NOTIFICATION_STATE_STORE = 'topic-state';
const notificationStateFallback = new Map();
let notificationStateDbPromise = null;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

const appContexts = new Map();
const pushUserAgent = self.navigator?.userAgent || '';
// Apple требует showNotification для каждого push, даже в открытой PWA,
// иначе подписка может быть отозвана как за скрытую фоновую работу.
const requiresVisiblePush =
  /iPhone|iPad|iPod/.test(pushUserAgent) ||
  (/Safari/.test(pushUserAgent) &&
    !/Chrome|Chromium|Edg\/|OPR\//.test(pushUserAgent));

const isTopicVisibleInClient = async topicId => {
  if (!topicId) return false;
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });
  const liveIds = new Set(windows.map(client => client.id));
  for (const id of appContexts.keys()) {
    if (!liveIds.has(id)) appContexts.delete(id);
  }
  return windows.some(client => {
    const context = appContexts.get(client.id);
    return (
      client.visibilityState === 'visible' &&
      client.focused &&
      context?.focused &&
      context.topicId === topicId
    );
  });
};

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

const parsePushTimestamp = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const openNotificationStateDb = () => {
  if (!notificationStateDbPromise) {
    notificationStateDbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(NOTIFICATION_STATE_DB, 1);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(NOTIFICATION_STATE_STORE)) {
          db.createObjectStore(NOTIFICATION_STATE_STORE, {
            keyPath: 'topicId'
          });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return notificationStateDbPromise;
};

const updateTopicNotificationState = async (topicId, updater) => {
  if (!topicId) {
    return null;
  }

  try {
    const db = await openNotificationStateDb();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(NOTIFICATION_STATE_STORE, 'readwrite');
      const store = transaction.objectStore(NOTIFICATION_STATE_STORE);
      const request = store.get(topicId);
      let result = null;

      request.onsuccess = () => {
        const current = request.result || {
          topicId,
          clearedAt: 0,
          latestAt: 0
        };
        const update = updater(current);
        result = update.result;
        store.put({
          ...current,
          ...update.state,
          topicId,
          updatedAt: Date.now()
        });
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch (error) {
    console.warn('Не удалось сохранить состояние уведомлений:', error);
    const current = notificationStateFallback.get(topicId) || {
      topicId,
      clearedAt: 0,
      latestAt: 0
    };
    const update = updater(current);
    notificationStateFallback.set(topicId, {
      ...current,
      ...update.state,
      updatedAt: Date.now()
    });
    return update.result;
  }
};

const markTopicNotificationsCleared = (topicId, stateAt) =>
  updateTopicNotificationState(topicId, current => ({
    state: {
      clearedAt: Math.max(Number(current.clearedAt) || 0, stateAt)
    },
    result: true
  }));

const shouldShowTopicNotification = (topicId, stateAt) => {
  if (!topicId || stateAt === null) {
    return Promise.resolve(true);
  }

  return updateTopicNotificationState(topicId, current => {
    const clearedAt = Number(current.clearedAt) || 0;
    const latestAt = Number(current.latestAt) || 0;
    const shouldShow = stateAt > clearedAt && stateAt > latestAt;

    return {
      state: shouldShow ? { latestAt: stateAt } : {},
      result: shouldShow
    };
  });
};

const isFreshIncomingCallPayload = (payload, now = Date.now()) => {
  if (
    payload.type !== 'incoming_call' ||
    String(payload.topicType || '').toUpperCase() === 'GROUP'
  ) {
    return false;
  }

  const expiresAt = parsePushTimestamp(payload.expiresAt);
  if (expiresAt !== null && now >= expiresAt) {
    return false;
  }

  const sentAt = parsePushTimestamp(payload.sentAt);
  return sentAt === null || now - sentAt <= INCOMING_CALL_MAX_AGE_MS;
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

const closeNotificationsForTopic = async (topicId, stateAt = null) => {
  if (!topicId) {
    return;
  }

  const notifications = await self.registration.getNotifications();

  notifications.forEach(notification => {
    const notificationTopicId =
      notification.data?.topicId || notification.tag || null;

    const notificationStateAt = parsePushTimestamp(
      notification.data?.stateAt || notification.data?.sentAt
    );
    if (
      notificationTopicId === topicId &&
      (stateAt === null ||
        notificationStateAt === null ||
        notificationStateAt <= stateAt)
    ) {
      notification.close();
    }
  });
};

const closeIncomingCallNotification = async roomId => {
  if (!roomId) {
    return;
  }

  const notifications = await self.registration.getNotifications();
  notifications.forEach(notification => {
    if (notification.data?.roomId === roomId) {
      notification.close();
    }
  });
};

const getNotificationMessageId = notification => {
  const data = notification?.data || {};

  return (
    data.messageId ||
    data.message?.id ||
    data.data?.messageId ||
    data.data?.message?.id ||
    null
  );
};

const buildNotificationNavigationUrl = payload => {
  const targetUrl = new URL(getNotificationUrl(payload), self.location.origin);
  const messageId = getNotificationMessageId({ data: payload });

  if (messageId) {
    targetUrl.searchParams.set('notificationMessageId', String(messageId));
  }

  return targetUrl.toString();
};

const closeNotificationForMessage = async (topicId, messageId) => {
  if (!messageId) {
    return;
  }

  const notifications = await self.registration.getNotifications();
  const topicNotifications = topicId
    ? notifications.filter(notification => {
        const notificationTopicId =
          notification.data?.topicId || notification.tag || null;

        return notificationTopicId === topicId;
      })
    : notifications;
  const exactNotifications = topicNotifications.filter(
    notification => String(getNotificationMessageId(notification)) === messageId
  );
  const notificationsToClose =
    exactNotifications.length > 0
      ? exactNotifications
      : topicId
        ? topicNotifications.filter(
            notification => getNotificationMessageId(notification) === null
          )
        : [];

  notificationsToClose.forEach(notification => {
    notification.close();
  });
};

const closeDeletedMessageNotificationsFromEvents = async events => {
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.eventType !== 'message.delete') {
      continue;
    }

    const payload = event.payload || {};
    const topicId = event.topicId || payload.topicId || null;
    const messageId =
      payload.messageId || payload.id || event.messageId || null;

    if (topicId && messageId) {
      await closeNotificationForMessage(String(topicId), String(messageId));
    }
  }
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
    await closeDeletedMessageNotificationsFromEvents(
      result.snapshot?.events || []
    );
    await notifyChatBackgroundSyncUpdated(source);
  } else if (result?.retryable) {
    await registerChatBackgroundSyncRetry();
  }

  return result;
};

self.addEventListener('message', event => {
  if (event.data?.type === 'APP_CONTEXT') {
    if (event.source?.id) {
      appContexts.set(event.source.id, {
        focused: Boolean(event.data.focused),
        topicId: event.data.topicId || null
      });
    }
  }

  if (event.data?.type === 'CLEAR_TOPIC_NOTIFICATIONS') {
    const stateAt = parsePushTimestamp(event.data.stateAt) || Date.now();
    event.waitUntil(
      Promise.all([
        markTopicNotificationsCleared(event.data.topicId, stateAt),
        closeNotificationsForTopic(event.data.topicId, stateAt)
      ])
    );
  }

  if (event.data?.type === 'CLEAR_ALL_NOTIFICATIONS') {
    event.waitUntil(closeAllNotifications());
  }

  if (event.data?.type === 'CLEAR_MESSAGE_NOTIFICATION') {
    event.waitUntil(
      closeNotificationForMessage(event.data.topicId, event.data.messageId)
    );
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
        const stateAt =
          parsePushTimestamp(payload.stateAt) ||
          parsePushTimestamp(payload.sentAt) ||
          Date.now();
        await markTopicNotificationsCleared(topicId, stateAt);
        await closeNotificationsForTopic(topicId, stateAt);
        return;
      }

      if (payload.action === 'DISMISS_INCOMING_CALL') {
        await closeIncomingCallNotification(payload.roomId);
        return;
      }

      if (payload.action === 'CHAT_SYNC') {
        // Уведомление не должно ждать сети и полной синхронизации истории.
        event.waitUntil(
          runChatBackgroundSyncFromPayload(payload, 'push').catch(error => {
            console.warn(
              '[ChatBackgroundSyncSW] Ошибка синхронизации push',
              error
            );
          })
        );

        if (
          !payload.title &&
          !payload.body &&
          payload.type !== 'incoming_call'
        ) {
          return;
        }
      }

      if (!requiresVisiblePush && (await isTopicVisibleInClient(topicId))) {
        const stateAt = Date.now();
        await markTopicNotificationsCleared(topicId, stateAt);
        await closeNotificationsForTopic(topicId, stateAt);
        return;
      }

      const title = payload.title || 'New message';
      const url = getNotificationUrl(payload);
      const isIncomingCall = isFreshIncomingCallPayload(payload);
      if (payload.type === 'incoming_call' && !isIncomingCall) {
        await closeIncomingCallNotification(payload.roomId);
        return;
      }
      const notificationStateAt =
        parsePushTimestamp(payload.stateAt) ||
        parsePushTimestamp(payload.sentAt);
      if (
        payload.type !== 'incoming_call' &&
        !(await shouldShowTopicNotification(topicId, notificationStateAt))
      ) {
        return;
      }
      const tag = payload.tag || payload.roomId || topicId || 'chat-message';

      await self.registration.showNotification(title, {
        body: payload.body || '',
        icon: payload.icon || '/images/favicon.ico?v=20260909-dark',
        badge: payload.icon || '/images/favicon.ico?v=20260909-dark',
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
  const isIncomingCall =
    payload.type === 'incoming_call' &&
    String(payload.topicType || '').toUpperCase() !== 'GROUP';
  const action =
    event.action === 'accept' || event.action === 'decline'
      ? event.action
      : null;
  const absoluteUrl =
    isIncomingCall && action
      ? buildCallActionUrl(payload, action)
      : buildNotificationNavigationUrl(payload);

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
