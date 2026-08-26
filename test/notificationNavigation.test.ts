import { afterEach, describe, expect, test } from 'bun:test';
import {
  STARTUP_SHELL_TOPIC_ROUTE_CLASS,
  consumeNotificationTopicRefreshRequest,
  navigateToNotificationTarget,
  notificationTopicRefreshRequest,
  resolveNotificationMessageId
} from '../src/services/useNotificationNavigation';

const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

const installWindowMock = () => {
  let href = 'http://localhost:5173/';
  const documentClasses = new Set<string>();
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
      title: 'Chat',
      documentElement: {
        classList: {
          add: (className: string) => documentClasses.add(className)
        }
      },
      getElementById: (id: string) => (id === 'startup-shell' ? { id } : null)
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

  return { documentClasses };
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
  test('keeps the latest message id when notifications arrive consecutively', () => {
    const { documentClasses } = installWindowMock();

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
      messageId: 'second-message'
    });
    expect(documentClasses.has(STARTUP_SHELL_TOPIC_ROUTE_CLASS)).toBe(true);
  });

  test('keeps the existing topic refresh behavior without a message id', () => {
    installWindowMock();

    navigateToNotificationTarget({ topicId: 'topic-2' });

    const request = notificationTopicRefreshRequest.value;

    expect(request).toMatchObject({ topicId: 'topic-2' });
    expect(request?.messageId).toBeUndefined();
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
});
