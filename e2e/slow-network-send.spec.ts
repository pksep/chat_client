import { expect, test, type Page } from '@playwright/test';
import {
  message,
  openFixture,
  openTopic
} from './fixtures/topic-performance-page';

async function prepareVideoSend(page: Page) {
  await page.addInitScript(() => {
    (window as any).Capacitor = {
      PluginHeaders: [
        {
          name: 'NativeFile',
          methods: [
            'getMessageUploadCapabilities',
            'prepareMessageUpload',
            'stageMessageUploadChunk',
            'enqueueMessageUpload',
            'getMessageUpload',
            'cancelMessageUpload'
          ].map(name => ({ name, rtype: 'promise' }))
        }
      ],
      nativePromise: async (_plugin: string, method: string, options: any) => {
        if (method === 'getMessageUploadCapabilities') return { version: 1 };
        const state = (window as any).videoSend;
        state.nativeCalls.push({ method, options });
        if (method === 'prepareMessageUpload') {
          const cache = await import('/src/services/useTopicMessagesCache.ts');
          const rows = await cache.loadPendingUploadMessages(
            options.message.topicId
          );
          const meta = rows.find(row => row.id === options.id);
          state.nativeFlagAtPrepare = JSON.parse(
            meta!.ex as string
          ).nativeUpload;
          state.nativeMessage = meta;
          return { status: 'staging' };
        }
        if (method === 'getMessageUpload') {
          await state.nativeCompletionGate;
          const pending = state.nativeMessage;
          return {
            status: 'completed',
            message: {
              ...pending,
              id: 'confirmed-video',
              createdAt: new Date().toISOString(),
              status: 'DELIVERED',
              media: pending.media.map((media: any) => ({
                ...media,
                path: 'native.mp4'
              }))
            }
          };
        }
        return {};
      }
    };
  });
  const state = await openFixture(page, { shell: true });
  await openTopic(page, 0);
  await expect(message(page, 0)).toBeVisible();
  await expect(page.locator('.chat__input--booting')).toHaveCount(0);
  await page.evaluate(async () => {
    const fixture = (window as any).topicPerformance;
    const { controlConnection, Capacitor } = await import(
      '/e2e/fixtures/network-harness.ts'
    );
    const { mountMessageSender } = await import(
      '/e2e/fixtures/message-send-harness.ts'
    );
    controlConnection();
    Capacitor.isNativePlatform = () => true;
    Capacitor.getPlatform = () => 'android';
    (window as any).videoSend = { uploads: 0, sends: [], nativeCalls: [] };
    fixture.sdk.uploadFile = async () => {
      (window as any).videoSend.uploads++;
      return { objectName: 'isolated-video.mp4', thumbnailObjectName: null };
    };
    fixture.sdk.sendWebSocketEvent = (type: string, payload: any) => {
      if (type === 'sendMessage') (window as any).videoSend.sends.push(payload);
      return true;
    };
    (window as any).videoSender = mountMessageSender('performance-0');
  });
  return state;
}

test('видео видно и сохранено до медленной проверки фоновой отправки Android', async ({
  page
}) => {
  const state = await prepareVideoSend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let capabilityRequests = 0;
  await page.route('**/messages/native-upload-capabilities', async route => {
    capabilityRequests++;
    await gate;
    await route.fulfill({ status: 404, body: '' });
  });
  await page.evaluate(() => {
    (window as any).videoSend.done = (
      window as any
    ).videoSender.handleAttachSharedFiles([
      new File(['isolated video bytes'], 'slow-network.mp4', {
        type: 'video/mp4'
      })
    ]);
  });
  try {
    await expect.poll(() => capabilityRequests).toBe(1);
    await expect(
      page.locator('.message[data-is-me-sender="true"]')
    ).toBeVisible({ timeout: 1500 });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const cache = await import('/src/services/useTopicMessagesCache.ts');
          const rows = await cache.loadPendingUploadMessages('performance-0');
          const pending = rows.find(
            row => row.media?.[0]?.originName === 'slow-network.mp4'
          );
          if (!pending) return false;
          const payload = await cache.loadPendingUploadFile(
            'performance-0',
            pending.id,
            '0'
          );
          return (await payload?.file.text()) === 'isolated video bytes';
        })
      )
      .toBe(true);
    expect(await page.evaluate(() => (window as any).videoSend.uploads)).toBe(
      0
    );
  } finally {
    release();
  }
  await page.evaluate(() => (window as any).videoSend.done);
  expect(
    await page.evaluate(() => ({
      uploads: (window as any).videoSend.uploads,
      sends: (window as any).videoSend.sends.length,
      native:
        JSON.parse((window as any).videoSend.sends[0].ex).nativeUpload === true
    }))
  ).toEqual({ uploads: 1, sends: 1, native: false });
  expect(state.errors).toEqual([]);
});

test('поздняя поддержка Android передаёт одно сохранённое видео в native worker', async ({
  page
}) => {
  const state = await prepareVideoSend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/messages/native-upload-capabilities', async route => {
    await gate;
    await route.fulfill({ json: { version: 1 } });
  });
  await page.evaluate(() => {
    (window as any).videoSend.done = (
      window as any
    ).videoSender.handleAttachSharedFiles([
      new File(['isolated video bytes'], 'native-video.mp4', {
        type: 'video/mp4'
      })
    ]);
  });
  try {
    await expect(
      page.locator('.message[data-is-me-sender="true"]')
    ).toBeVisible();
    expect(
      await page.evaluate(() => (window as any).videoSend.nativeCalls)
    ).toEqual([]);
  } finally {
    release();
  }
  await page.evaluate(() => (window as any).videoSend.done);
  await expect(
    page.locator('[data-message-id="confirmed-video"]')
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      const state = (window as any).videoSend;
      const chunk = state.nativeCalls.find(
        (call: any) => call.method === 'stageMessageUploadChunk'
      );
      return {
        uploads: state.uploads,
        sends: state.sends.length,
        nativeFlagAtPrepare: state.nativeFlagAtPrepare,
        methods: state.nativeCalls.map((call: any) => call.method),
        bytes: chunk ? atob(chunk.options.base64) : null
      };
    })
  ).toEqual({
    uploads: 0,
    sends: 0,
    nativeFlagAtPrepare: true,
    methods: [
      'prepareMessageUpload',
      'stageMessageUploadChunk',
      'enqueueMessageUpload',
      'getMessageUpload'
    ],
    bytes: 'isolated video bytes'
  });
  expect(state.errors).toEqual([]);
});

test('удалённое до проверки поддержки видео не отправляется после её ответа', async ({
  page
}) => {
  const state = await prepareVideoSend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/messages/native-upload-capabilities', async route => {
    await gate;
    await route.fulfill({ json: { version: 1 } });
  });
  await page.evaluate(() => {
    (window as any).videoSend.done = (
      window as any
    ).videoSender.handleAttachSharedFiles([
      new File(['isolated video bytes'], 'cancelled-video.mp4', {
        type: 'video/mp4'
      })
    ]);
  });
  try {
    await expect(
      page.locator('.message[data-is-me-sender="true"]')
    ).toBeVisible();
    await page.evaluate(async () => {
      const messages = (window as any).topicPerformance.messages;
      const pending = messages
        .getFullMessagesByTopicId('performance-0')
        .find((row: any) => row.senderUserId === 'performance-user');
      await messages.deleteMessageFromLocal('performance-0', pending.id);
    });
  } finally {
    release();
  }
  await page.evaluate(() => (window as any).videoSend.done);
  await expect(page.locator('.message[data-is-me-sender="true"]')).toHaveCount(
    0
  );
  expect(
    await page.evaluate(() => ({
      uploads: (window as any).videoSend.uploads,
      sends: (window as any).videoSend.sends.length,
      nativeCalls: (window as any).videoSend.nativeCalls
    }))
  ).toEqual({ uploads: 0, sends: 0, nativeCalls: [] });
  expect(state.errors).toEqual([]);
});

test('смена аккаунта во время проверки поддержки не отправляет старое видео', async ({
  page
}) => {
  const state = await prepareVideoSend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  await page.route('**/messages/native-upload-capabilities', async route => {
    await gate;
    await route.fulfill({ json: { version: 1 } });
  });
  await page.evaluate(() => {
    (window as any).videoSend.done = (
      window as any
    ).videoSender.handleAttachSharedFiles([
      new File(['isolated video bytes'], 'old-account-video.mp4', {
        type: 'video/mp4'
      })
    ]);
  });
  try {
    await expect(
      page.locator('.message[data-is-me-sender="true"]')
    ).toBeVisible();
    await page.evaluate(() => {
      (window as any).videoSender.setAuthUser(null);
    });
  } finally {
    release();
  }
  await page.evaluate(() => (window as any).videoSend.done);
  expect(
    await page.evaluate(() => ({
      uploads: (window as any).videoSend.uploads,
      sends: (window as any).videoSend.sends.length,
      nativeCalls: (window as any).videoSend.nativeCalls
    }))
  ).toEqual({ uploads: 0, sends: 0, nativeCalls: [] });
  expect(state.errors).toEqual([]);
});

test('позднее завершение Android не возвращает удалённое видео', async ({
  page
}) => {
  const state = await prepareVideoSend(page);
  await page.route('**/messages/native-upload-capabilities', route =>
    route.fulfill({ json: { version: 1 } })
  );
  await page.evaluate(() => {
    const state = (window as any).videoSend;
    state.nativeCompletionGate = new Promise(resolve => {
      state.releaseNative = resolve;
    });
    state.done = (window as any).videoSender.handleAttachSharedFiles([
      new File(['isolated video bytes'], 'deleted-native-video.mp4', {
        type: 'video/mp4'
      })
    ]);
  });
  try {
    await expect
      .poll(() =>
        page.evaluate(() =>
          (window as any).videoSend.nativeCalls.some(
            (call: any) => call.method === 'getMessageUpload'
          )
        )
      )
      .toBe(true);
    await page.evaluate(async () => {
      const state = (window as any).videoSend;
      await (window as any).topicPerformance.messages.deleteMessageFromLocal(
        'performance-0',
        state.nativeMessage.id
      );
    });
  } finally {
    await page.evaluate(() => (window as any).videoSend.releaseNative());
  }
  await page.evaluate(() => (window as any).videoSend.done);
  await expect(page.locator('.message[data-is-me-sender="true"]')).toHaveCount(
    0
  );
  expect(state.errors).toEqual([]);
});

test('серия видео разделяет проверку сервера и использует недавний ответ', async ({
  page
}) => {
  const state = await prepareVideoSend(page);
  let release!: () => void;
  const gate = new Promise<void>(resolve => (release = resolve));
  let capabilityRequests = 0;
  await page.route('**/messages/native-upload-capabilities', async route => {
    capabilityRequests++;
    await gate;
    await route.fulfill({ status: 404, body: '' });
  });
  await page.evaluate(() => {
    const send = (name: string) =>
      (window as any).videoSender.handleAttachSharedFiles([
        new File(['isolated video bytes'], name, { type: 'video/mp4' })
      ]);
    (window as any).videoSend.done = Promise.all([
      send('first.mp4'),
      send('second.mp4')
    ]);
  });
  try {
    await expect(
      page.locator('.message[data-is-me-sender="true"]')
    ).toHaveCount(2);
    await expect.poll(() => capabilityRequests).toBeGreaterThan(0);
    await page.waitForTimeout(250);
    expect(capabilityRequests).toBe(1);
    expect(await page.evaluate(() => (window as any).videoSend.uploads)).toBe(
      0
    );
  } finally {
    release();
  }
  await page.evaluate(() => (window as any).videoSend.done);
  await page.evaluate(async () => {
    await (window as any).videoSender.handleAttachSharedFiles([
      new File(['isolated video bytes'], 'third.mp4', { type: 'video/mp4' })
    ]);
  });
  expect(capabilityRequests).toBe(1);
  expect(
    await page.evaluate(() => ({
      uploads: (window as any).videoSend.uploads,
      sends: (window as any).videoSend.sends.length
    }))
  ).toEqual({ uploads: 3, sends: 3 });
  expect(state.errors).toEqual([]);
});
