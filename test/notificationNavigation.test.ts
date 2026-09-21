import { afterEach, describe, expect, test } from 'bun:test';
import {
  consumeNotificationTopicRefreshRequest,
  navigateToNotificationTarget,
  notificationTopicRefreshRequest,
  resolveNotificationMessageId
} from '../src/services/useNotificationNavigation';
import {
  needsNotificationMessageContext,
  mergeNotificationMessageSnapshots
} from '../src/utils/notificationMessages';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

const installWindowMock = () => {
  let href = 'http://localhost:5173/';
  const location = {
    get href() {
      return href;
    },
    set href(value: string) {
      href = value;
    },
    origin: 'http://localhost:5173'
  };

  Object.assign(globalThis, {
    document: {
      title: 'Chat'
    },
    window: {
      location,
      history: {
        replaceState: (_state: unknown, _title: string, url: string) => {
          href = String(url);
        }
      }
    }
  });
};

afterEach(() => {
  notificationTopicRefreshRequest.value = null;

  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    globalThis.window = originalWindow;
  }

  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalThis, 'document');
  } else {
    globalThis.document = originalDocument;
  }
});

describe('notification navigation', () => {
  test('keeps a forced latest-page refresh when notifications arrive consecutively', () => {
    installWindowMock();

    navigateToNotificationTarget({
      topicId: 'topic-1',
      messageId: 'first-message'
    });
    navigateToNotificationTarget({
      topicId: 'topic-1',
      messageId: 'second-message'
    });

    expect(notificationTopicRefreshRequest.value).toMatchObject({
      topicId: 'topic-1',
      scrollToBottom: true,
      messageId: 'second-message'
    });
  });

  test('keeps the existing topic refresh behavior without a message id', () => {
    installWindowMock();

    navigateToNotificationTarget({ topicId: 'topic-2' });

    const request = notificationTopicRefreshRequest.value;

    expect(request).toMatchObject({
      topicId: 'topic-2',
      scrollToBottom: true
    });
    expect(
      consumeNotificationTopicRefreshRequest('topic-2', request?.id || 0)
    ).toBe(true);
  });

  test('resolves nested message ids from notification payloads', () => {
    expect(
      resolveNotificationMessageId({
        data: { message: { id: 'nested-message' } }
      })
    ).toBe('nested-message');
  });

  test('keeps both messages when WebSocket and notification fetch race', () => {
    const firstMessage = { id: 'first-message', text: 'first' };
    const secondMessage = { id: 'second-message', text: 'second' };
    const refreshedSecondMessage = {
      id: 'second-message',
      text: 'second-refreshed'
    };

    const merged = mergeNotificationMessageSnapshots(
      [firstMessage],
      [refreshedSecondMessage],
      [firstMessage, secondMessage]
    );

    expect(merged.map(message => message.id)).toEqual([
      'first-message',
      'second-message'
    ]);
    expect(merged[1]?.text).toBe('second');
  });

  test('keeps messages whose notifications were missed before the tapped one', () => {
    const merged = mergeNotificationMessageSnapshots(
      [],
      [{ id: 'message-3' }],
      [{ id: 'message-1' }, { id: 'message-2' }, { id: 'message-3' }]
    );

    expect(new Set(merged.map(message => message.id))).toEqual(
      new Set(['message-1', 'message-2', 'message-3'])
    );
  });

  test('keeps every message newer than the tapped notification', () => {
    const merged = mergeNotificationMessageSnapshots(
      [{ id: 'message-1' }, { id: 'message-2' }, { id: 'message-3' }],
      [
        { id: 'message-1' },
        { id: 'message-2' },
        { id: 'message-3' },
        { id: 'message-4' },
        { id: 'message-5' }
      ]
    );

    expect(new Set(merged.map(message => message.id))).toEqual(
      new Set(['message-1', 'message-2', 'message-3', 'message-4', 'message-5'])
    );
  });

  test('не запрашивает контекст для уведомления из последней страницы', () => {
    expect(needsNotificationMessageContext('new', [{ id: 'new' }], [])).toBe(
      false
    );
  });

  test('не загружает промежуточную историю для старого уведомления из кеша', () => {
    const history = Array.from({ length: 50000 }, (_, index) => ({
      id: String(index)
    }));
    expect(
      needsNotificationMessageContext('0', history.slice(-72), history)
    ).toBe(false);
  });

  test('восстанавливает контекст при отставании последней страницы от уведомления', () => {
    expect(needsNotificationMessageContext('new', [{ id: 'old' }], [])).toBe(
      true
    );
    expect(needsNotificationMessageContext(undefined, [], [])).toBe(false);
  });
});
