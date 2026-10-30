import { beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { IMessage } from '../src/components/interfaces/interfaces';

let android = true;
let apiUrl = 'https://chat.example/api';
let accessToken = 'current-token';
let sessionSequence = 0;
const getMessageUploadCapabilities = mock(
  async (): Promise<{ version: number }> => ({ version: 1 })
);
const prepareMessageUpload = mock<
  (options: any) => Promise<{ status: string }>
>(async () => ({ status: 'staging' }));
const stageMessageUploadChunk = mock<(options: any) => Promise<void>>(
  async () => {}
);
const enqueueMessageUpload = mock<(options: any) => Promise<void>>(
  async () => {}
);
const getMessageUpload = mock<(options: any) => Promise<any>>(async () => ({
  status: 'missing'
}));
const saveSession = mock<(options: any) => Promise<void>>(async () => {});
mock.module('../src/services/native-file-bridge', () => ({
  isAndroidNativePlatform: () => android,
  NativeFile: {
    getMessageUploadCapabilities,
    prepareMessageUpload,
    stageMessageUploadChunk,
    enqueueMessageUpload,
    getMessageUpload
  }
}));
mock.module('../src/services/useConfig', () => ({
  getConfig: () => ({ CHAT_API_DOMAIN: apiUrl })
}));
mock.module('../src/composables/useAuth', () => ({
  getStoredChatAccessToken: () => 'stored-token'
}));
mock.module('../src/composables/useLogin', () => ({
  getAuthToken: () => accessToken
}));
mock.module('../src/services/useTelemetry', () => ({
  createTelemetryTraceId: () => 'test-trace',
  recordTelemetryEvent: () => {}
}));
mock.module('../src/services/useChatBackgroundSync', () => ({
  saveNativeChatBackgroundSyncSession: saveSession
}));
const { canUseNativeMessageUpload, sendNativeMessageUpload } = await import(
  '../src/services/native-message-upload'
);
const message = {
  id: 'client-id',
  senderUserId: 'sender',
  topicId: 'topic',
  text: '<b>Видео</b>',
  createdAt: new Date(),
  ex: JSON.stringify({ clientId: 'client-id', nativeUpload: true }),
  media: [{ type: 'VIDEO', ex: { width: 64, height: 64 } }]
} as IMessage;
const completed = {
  status: 'completed',
  message: {
    ...message,
    id: 'server-id',
    createdAt: new Date().toISOString(),
    media: [{ type: 'VIDEO', path: 'video.mp4' }]
  }
};
// Только браузерный FileReader; сетевые этапы проверяются настоящими HTTP-тестами Java.
globalThis.FileReader = class {
  result: string | null = null;
  onload?: () => void;
  readAsDataURL(blob: Blob) {
    void blob.arrayBuffer().then(bytes => {
      this.result = `data:;base64,${Buffer.from(bytes).toString('base64')}`;
      this.onload?.();
    });
  }
} as any;

describe('native message upload handoff', () => {
  beforeEach(() => {
    android = true;
    apiUrl = 'https://chat.example/api';
    accessToken = `test-session-${++sessionSequence}`;
    getMessageUploadCapabilities.mockReset().mockResolvedValue({ version: 1 });
    prepareMessageUpload.mockReset().mockResolvedValue({ status: 'staging' });
    stageMessageUploadChunk.mockClear();
    enqueueMessageUpload.mockClear();
    saveSession.mockClear();
    getMessageUpload.mockReset().mockResolvedValue(completed);
  });
  test('stages bounded chunks before queueing the whole message and preserves metadata', async () => {
    const file = new File([new Uint8Array(1200000)], 'video.mp4', {
      type: 'video/mp4'
    });
    const sent = await sendNativeMessageUpload(
      message,
      [{ file, isMedia: true }],
      () => {}
    );
    expect(
      stageMessageUploadChunk.mock.calls.map(([chunk]) => chunk.offset)
    ).toEqual([0, 1048576]);
    expect(
      stageMessageUploadChunk.mock.calls.every(
        ([chunk]) => chunk.base64.length <= 1398104
      )
    ).toBe(true);
    expect(enqueueMessageUpload).toHaveBeenCalledTimes(1);
    expect(prepareMessageUpload.mock.calls[0][0].message.ex).toBe(message.ex);
    expect(prepareMessageUpload.mock.calls[0][0].message.text).toBe(
      message.text
    );
    expect(prepareMessageUpload.mock.calls[0][0].files[0].ex).toEqual({
      width: 64,
      height: 64
    });
    expect(sent.id).toBe('server-id');
    expect(sent.createdAt).toBeInstanceOf(Date);
    expect(saveSession).toHaveBeenCalledTimes(1);
  });
  test('reattaches to a durable native job without staging or enqueueing it again', async () => {
    prepareMessageUpload.mockResolvedValue({ status: 'queued' });
    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' });
    await sendNativeMessageUpload(message, [{ file, isMedia: true }], () => {});
    expect(stageMessageUploadChunk).not.toHaveBeenCalled();
    expect(enqueueMessageUpload).not.toHaveBeenCalled();
  });
  test('reports native failure without sending a duplicate from JavaScript', async () => {
    prepareMessageUpload.mockResolvedValue({ status: 'failed' });
    getMessageUpload.mockResolvedValue({
      status: 'failed',
      error: 'test failure'
    });
    const file = new File(['video'], 'video.mp4', { type: 'video/mp4' });
    await expect(
      sendNativeMessageUpload(message, [{ file, isMedia: true }], () => {})
    ).rejects.toThrow('test failure');
    expect(enqueueMessageUpload).not.toHaveBeenCalled();
  });
  test('desktop always retains its existing upload path', async () => {
    android = false;
    expect(await canUseNativeMessageUpload()).toBe(false);
  });
  test('old server without capability retains its existing upload path', async () => {
    const fetch = globalThis.fetch;
    globalThis.fetch = mock(
      async () => new Response('', { status: 404 })
    ) as any;
    try {
      expect(await canUseNativeMessageUpload()).toBe(false);
    } finally {
      globalThis.fetch = fetch;
    }
  });
  test('old Android package without native worker retains its existing upload path', async () => {
    getMessageUploadCapabilities.mockRejectedValueOnce({
      code: 'UNIMPLEMENTED'
    });
    expect(await canUseNativeMessageUpload()).toBe(false);
  });

  test('concurrent videos share a capability request and confirmed support expires', async () => {
    const originalFetch = globalThis.fetch;
    const clock = spyOn(Date, 'now').mockReturnValue(1000);
    let release!: (response: Response) => void;
    const response = new Promise<Response>(resolve => (release = resolve));
    const request = mock(async () => response);
    globalThis.fetch = request as any;
    try {
      const first = canUseNativeMessageUpload();
      const second = canUseNativeMessageUpload();
      await Promise.resolve();
      expect(request).toHaveBeenCalledTimes(1);
      release(Response.json({ version: 1 }));
      expect(await Promise.all([first, second])).toEqual([true, true]);
      expect(await canUseNativeMessageUpload()).toBe(true);
      expect(request).toHaveBeenCalledTimes(1);
      clock.mockReturnValue(61_001);
      request.mockImplementation(async () => Response.json({ version: 1 }));
      expect(await canUseNativeMessageUpload()).toBe(true);
      expect(request).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.fetch = originalFetch;
      clock.mockRestore();
    }
  });

  test('confirmed absence is reused but another account or server is checked again', async () => {
    const originalFetch = globalThis.fetch;
    const request = mock(async () => new Response('', { status: 404 }));
    globalThis.fetch = request as any;
    try {
      expect(await canUseNativeMessageUpload()).toBe(false);
      expect(await canUseNativeMessageUpload()).toBe(false);
      expect(request).toHaveBeenCalledTimes(1);
      accessToken = 'another-test-session';
      expect(await canUseNativeMessageUpload()).toBe(false);
      expect(request).toHaveBeenCalledTimes(2);
      apiUrl = 'https://another-chat.example/api';
      expect(await canUseNativeMessageUpload()).toBe(false);
      expect(request).toHaveBeenCalledTimes(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  for (const failure of [
    'offline',
    'unauthorized',
    'unavailable',
    'invalid-json'
  ]) {
    test(`capability ${failure} is retried and cannot disable native upload for a minute`, async () => {
      const originalFetch = globalThis.fetch;
      const request = mock(async () => Response.json({ version: 1 }));
      request.mockImplementationOnce(async () => {
        if (failure === 'offline') throw new TypeError('Failed to fetch');
        if (failure === 'invalid-json') return new Response('invalid');
        return new Response('', {
          status: failure === 'unauthorized' ? 401 : 503
        });
      });
      globalThis.fetch = request as any;
      try {
        expect(await canUseNativeMessageUpload()).toBe(false);
        expect(await canUseNativeMessageUpload()).toBe(true);
        expect(request).toHaveBeenCalledTimes(2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  }
});
