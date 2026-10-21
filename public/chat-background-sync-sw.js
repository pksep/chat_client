(function () {
  const DB_NAME = 'chat-web-background-sync-db';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const SESSION_KEY = 'session';
  const SNAPSHOT_KEY = 'snapshot';
  const STATUS_KEY = 'status';
  const PENDING_HINTS_KEY = 'pendingHints';
  const MAX_PENDING_TOPIC_IDS = 32;
  const MAX_MESSAGE_TOPICS = 8;
  const MESSAGE_LIMIT = 50;
  const HTTP_REQUEST_TIMEOUT_MS = 10000;

  let runningSync = null;

  const nowIso = () => new Date().toISOString();

  const isBlank = value => value == null || String(value).trim() === '';

  const trimToEmpty = value => (value == null ? '' : String(value).trim());

  const chooseMaxPts = (currentPts, incomingPts) => {
    if (isBlank(incomingPts)) {
      return trimToEmpty(currentPts);
    }

    if (isBlank(currentPts)) {
      return trimToEmpty(incomingPts);
    }

    const current = Number(currentPts);
    const incoming = Number(incomingPts);

    if (Number.isFinite(current) && Number.isFinite(incoming)) {
      return incoming > current
        ? trimToEmpty(incomingPts)
        : trimToEmpty(currentPts);
    }

    return trimToEmpty(incomingPts);
  };

  const openDb = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  const getValue = async key => {
    const db = await openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);

      request.onsuccess = () =>
        resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  };

  const setValue = async (key, value) => {
    const db = await openDb();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ key, value });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  };

  const deleteValue = async key => {
    const db = await openDb();

    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  };

  const setStatus = async status => {
    await setValue(STATUS_KEY, {
      ...status,
      updatedAt: status.updatedAt || nowIso()
    });
  };

  const getSession = async () => getValue(SESSION_KEY);

  const clearSession = async () => {
    await Promise.all([
      deleteValue(SESSION_KEY),
      deleteValue(SNAPSHOT_KEY),
      deleteValue(STATUS_KEY),
      deleteValue(PENDING_HINTS_KEY)
    ]);
    await setStatus({ state: 'session_cleared' });
  };

  const getLastPts = async () => {
    const snapshot = await getValue(SNAPSHOT_KEY);

    return trimToEmpty(snapshot && (snapshot.lastPts || snapshot.toPts));
  };

  // Чтение и изменение очереди выполняются одной транзакцией: push и retry
  // могут добавлять задания одновременно с завершением сетевого запроса.
  const changePendingHints = async update => {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(PENDING_HINTS_KEY);
      let previous;
      request.onsuccess = () => {
        previous = (request.result && request.result.value) || {};
        const next = update(previous);
        if (next) store.put({ key: PENDING_HINTS_KEY, value: next });
        else store.delete(PENDING_HINTS_KEY);
      };
      tx.oncomplete = () => {
        db.close();
        resolve(previous);
      };
      tx.onabort = tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  };

  const appendPendingHint = async hint =>
    changePendingHints(current => ({
      topicIds: [
        ...new Set(
          [
            ...(Array.isArray(current.topicIds) ? current.topicIds : []),
            ...(Array.isArray(hint.topicIds) ? hint.topicIds : []),
            hint.topicId
          ]
            .map(trimToEmpty)
            .filter(Boolean)
        )
      ].slice(-MAX_PENDING_TOPIC_IDS),
      pts: chooseMaxPts(current.pts, hint.pts),
      eventId: trimToEmpty(hint.eventId || current.eventId),
      reason: trimToEmpty(hint.reason || current.reason || 'background'),
      updatedAt: nowIso()
    }));

  const consumePendingHints = async () => {
    const hints = await changePendingHints(() => null);

    return {
      topicIds: Array.isArray(hints.topicIds)
        ? [...new Set(hints.topicIds.map(trimToEmpty).filter(Boolean))]
        : [],
      pts: trimToEmpty(hints.pts),
      eventId: trimToEmpty(hints.eventId),
      reason: trimToEmpty(hints.reason || 'background')
    };
  };

  const hasPendingHints = async () => {
    const hints = (await getValue(PENDING_HINTS_KEY)) || {};

    return (
      !isBlank(hints.reason) ||
      !isBlank(hints.pts) ||
      !isBlank(hints.eventId) ||
      (Array.isArray(hints.topicIds) && hints.topicIds.length > 0)
    );
  };

  const readJson = async response => {
    const body = await response.text();

    if (!response.ok) {
      const error = new Error(
        `HTTP ${response.status}${body ? `: ${body}` : ''}`
      );
      error.status = response.status;
      throw error;
    }

    return body.trim() ? JSON.parse(body) : null;
  };

  const fetchJson = async (session, path) => {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new DOMException(
            'Сервер синхронизации не ответил вовремя',
            'TimeoutError'
          )
        );
        controller.abort();
      }, HTTP_REQUEST_TIMEOUT_MS);
    });
    try {
      return await Promise.race([
        (async () => {
          const response = await fetch(`${session.apiUrl}${path}`, {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${session.token}`
            },
            signal: controller.signal
          });
          return readJson(response);
        })(),
        timeout
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const asArray = payload => {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
      return payload.data;
    }

    return [];
  };

  const fetchTopics = async session => {
    const limit = 50;
    const topics = new Map();
    for (let page = 1; ; page++) {
      const payload = await fetchJson(
        session,
        `/topics?page=${page}&limit=${limit}&scope=sidebar`
      );
      const rows = asArray(payload);
      const previousSize = topics.size;
      rows.forEach(topic => topics.set(topic.id, topic));
      const totalPages = payload?.meta?.totalPages ?? payload?.totalPages;
      const total = payload?.meta?.totalItems ?? payload?.total;
      const hasNext = Number.isFinite(totalPages)
        ? page < totalPages
        : Number.isFinite(total)
          ? page * limit < total
          : rows.length >= limit;
      if (!hasNext) return [...topics.values()];
      if (topics.size === previousSize)
        throw new Error('Сервер вернул повторную или пустую страницу чатов');
    }
  };

  const fetchPtsDelta = async (session, lastPts) => {
    const query = lastPts ? `?from=${encodeURIComponent(lastPts)}` : '';

    try {
      const separator = query ? '&' : '?';
      const payload = await fetchJson(
        session,
        `/sync/pts${query}${separator}limit=500`
      );

      if (!payload || typeof payload !== 'object') {
        return null;
      }

      return {
        fromPts: payload.fromPts || lastPts || null,
        toPts: payload.toPts || payload.lastPts || null,
        lastPts: payload.lastPts || payload.toPts || null,
        events: Array.isArray(payload.events) ? payload.events : [],
        topics: Array.isArray(payload.topics) ? payload.topics : [],
        messagesByTopic: payload.messagesByTopic || {}
      };
    } catch (error) {
      if (error.status === 404) {
        return null;
      }

      throw error;
    }
  };

  const resolveTopicId = topic =>
    trimToEmpty(topic && (topic.id || topic.topicId));

  const resolvePriorityTopicIds = (hints, delta, topics) => {
    const topicIds = new Set(hints.topicIds || []);
    const recentTopicIds = [];

    if (Array.isArray(delta && delta.events)) {
      for (const event of delta.events) {
        const eventTopicId = trimToEmpty(event && event.topicId);

        if (eventTopicId) {
          topicIds.add(eventTopicId);
        }

        if (topicIds.size >= MAX_MESSAGE_TOPICS) {
          return Array.from(topicIds).slice(0, MAX_MESSAGE_TOPICS);
        }
      }
    }

    for (const topic of topics) {
      const topicId = resolveTopicId(topic);

      if (!topicId) {
        continue;
      }

      if (
        Number(topic.unreadMessageCount || 0) > 0 ||
        topic.taggedMe === true ||
        topic.hasUnreadReaction === true
      ) {
        topicIds.add(topicId);
      } else if (topic.lastMessage) {
        recentTopicIds.push(topicId);
      }

      if (topicIds.size >= MAX_MESSAGE_TOPICS) {
        return Array.from(topicIds).slice(0, MAX_MESSAGE_TOPICS);
      }
    }

    for (const topicId of recentTopicIds) {
      topicIds.add(topicId);

      if (topicIds.size >= MAX_MESSAGE_TOPICS) {
        break;
      }
    }

    return Array.from(topicIds).slice(0, MAX_MESSAGE_TOPICS);
  };

  const fetchMessagesByTopic = async (session, topicIds) => {
    const result = {};

    for (const topicId of topicIds) {
      try {
        const payload = await fetchJson(
          session,
          `/messages/topic/${encodeURIComponent(topicId)}?limit=${MESSAGE_LIMIT}&newMessages=true`
        );
        const messages = asArray(payload);

        if (messages.length > 0) {
          result[topicId] = messages;
        }
      } catch (error) {
        if (
          error.status == null ||
          error.status === 401 ||
          error.status === 403 ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500
        ) {
          // Позиция синхронизации не должна продвигаться без запрошенной истории.
          throw error;
        }

        console.warn(
          '[ChatBackgroundSyncSW] Не удалось загрузить сообщения топика',
          {
            topicId,
            error: error.message || String(error)
          }
        );
      }
    }

    return result;
  };

  const saveSnapshot = async snapshot => {
    await setValue(SNAPSHOT_KEY, {
      available: true,
      ...snapshot,
      updatedAt: snapshot.updatedAt || nowIso()
    });
  };

  const runSyncOnce = async () => {
    const hints = await consumePendingHints();
    const session = await getSession();

    if (!session || !session.token || !session.apiUrl) {
      const status = {
        state: 'failed',
        reason: hints.reason,
        topicId: hints.topicIds[0] || null,
        pts: hints.pts || null,
        eventId: hints.eventId || null,
        error: 'Web-сессия синхронизации чата отсутствует',
        retryable: false
      };

      await setStatus(status);
      console.warn(
        '[ChatBackgroundSyncSW] Фоновая web-синхронизация не выполнена',
        status
      );
      return { ok: false, retryable: false, status };
    }

    await setStatus({
      state: 'started',
      reason: hints.reason,
      topicId: hints.topicIds[0] || null,
      pts: hints.pts || null,
      eventId: hints.eventId || null
    });
    console.info(
      '[ChatBackgroundSyncSW] Фоновая web-синхронизация началась',
      hints
    );

    try {
      const lastPts = await getLastPts();
      const delta = await fetchPtsDelta(session, lastPts);
      const topics = await fetchTopics(session);
      const topicIds = resolvePriorityTopicIds(hints, delta, topics);
      const messagesByTopic = await fetchMessagesByTopic(session, topicIds);
      const nextPts = chooseMaxPts(
        chooseMaxPts(lastPts, hints.pts),
        delta && (delta.toPts || delta.lastPts)
      );
      const status = {
        state: 'completed',
        reason: hints.reason,
        topicId: hints.topicIds[0] || null,
        pts: hints.pts || null,
        eventId: hints.eventId || null,
        topicCount: topics.length,
        messageTopicCount: Object.keys(messagesByTopic).length,
        eventCount: delta && delta.events ? delta.events.length : 0,
        updatedAt: nowIso()
      };
      const snapshot = {
        available: true,
        userId: session.userId || null,
        lastPts: nextPts || null,
        fromPts: delta && delta.fromPts,
        toPts: (delta && delta.toPts) || nextPts || null,
        events: (delta && delta.events) || [],
        topics:
          delta && delta.topics && delta.topics.length ? delta.topics : topics,
        messagesByTopic: {
          ...((delta && delta.messagesByTopic) || {}),
          ...messagesByTopic
        },
        status,
        updatedAt: nowIso()
      };

      await saveSnapshot(snapshot);
      await setStatus(status);
      console.info(
        '[ChatBackgroundSyncSW] Фоновая web-синхронизация завершена',
        status
      );

      return { ok: true, retryable: false, snapshot, status };
    } catch (error) {
      const retryable = error.status !== 401 && error.status !== 403;
      const status = {
        state: 'failed',
        reason: hints.reason,
        topicId: hints.topicIds[0] || null,
        pts: hints.pts || null,
        eventId: hints.eventId || null,
        error: error.message || String(error),
        retryable
      };

      if (retryable) {
        await appendPendingHint({
          topicIds: hints.topicIds || [],
          pts: hints.pts || '',
          eventId: hints.eventId || '',
          reason: hints.reason || 'retry',
          updatedAt: nowIso()
        });
      }

      await setStatus(status);
      console.warn(
        '[ChatBackgroundSyncSW] Фоновая web-синхронизация не выполнена',
        status
      );

      return { ok: false, retryable, status };
    }
  };

  const runChatBackgroundSync = async hint => {
    const request = hint || {};
    await appendPendingHint(request);
    await setStatus({
      state: 'scheduled',
      reason: request.reason || 'background',
      topicId: request.topicId || null,
      pts: request.pts || null,
      eventId: request.eventId || null
    });
    console.info(
      '[ChatBackgroundSyncSW] Фоновая web-синхронизация запланирована',
      request
    );

    if (runningSync) {
      return runningSync;
    }

    runningSync = (async () => {
      let result = await runSyncOnce();

      // Повторяемую ошибку продолжит Background Sync или следующее событие сети.
      // Немедленный повтор здесь снова оставляет hints и создаёт бесконечный цикл.
      while (result.ok && (await hasPendingHints())) {
        result = await runSyncOnce();
      }

      return result;
    })().finally(() => {
      runningSync = null;
    });

    return runningSync;
  };

  self.chatBackgroundSync = {
    appendPendingHint,
    clearSession,
    consumePendingHints,
    getLastPts,
    getSession,
    runChatBackgroundSync,
    saveSnapshot,
    setStatus
  };
})();
