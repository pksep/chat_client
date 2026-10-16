import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { IMessage } from '../src/components/interfaces/interfaces';

let android = true;
const getMessageUploadCapabilities = mock(
  async (): Promise<{ version: number }> => ({ version: 1 })
);
const prepareMessageUpload = mock(async (_options: any) => ({
  status: 'staging'
}));
const stageMessageUploadChunk = mock(async (_options: any) => {});
const enqueueMessageUpload = mock(async (_options: any) => {});
const getMessageUpload = mock(
  async (_options: any): Promise<any> => ({ status: 'missing' })
);
const saveSession = mock(async (_options: any) => {});
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
  getConfig: () => ({ CHAT_API_DOMAIN: 'https://chat.example/api' })
}));
mock.module('../src/composables/useAuth', () => ({
  getStoredChatAccessToken: () => 'stored-token'
}));
mock.module('../src/composables/useLogin', () => ({
  getAuthToken: () => 'current-token'
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
});
