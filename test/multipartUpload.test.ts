import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  MAX_UPLOAD_FILE_SIZE,
  MAX_UPLOAD_FILE_SIZE_ERROR,
  getUploadFileSizeError,
  getMultipartFileFingerprint,
  getMultipartUploadPersistenceKey,
  MultipartUploadSession,
  MultipartUploadTransport,
  removePersistedMultipartUpload,
  uploadMultipartFile
} from '../src/services/useChatSDK/multipart-upload';

const STORAGE_KEY = 'sep-chat:multipart-uploads:v1';
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
let storage: Map<string, string>;

const createSession = (
  uploadedParts: MultipartUploadSession['uploadedParts'] = []
): MultipartUploadSession => ({
  uploadId: 'upload-1',
  objectName: 'object.bin',
  chunkSize: 4,
  partCount: 3,
  size: 12,
  contentType: 'application/octet-stream',
  expiresAt: Date.now() + 60_000,
  status: 'active',
  uploadedParts
});

const createFile = (name = 'multipart.bin') =>
  new File([Uint8Array.from({ length: 12 }, (_, index) => index)], name, {
    type: 'application/octet-stream',
    lastModified: 12345
  });

beforeEach(() => {
  storage = new Map();
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    },
    window: {
      setTimeout: (callback: () => void) => {
        queueMicrotask(callback);
        return 1;
      },
      clearTimeout: () => undefined
    }
  });
});

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    globalThis.window = originalWindow;
  }

  if (originalLocalStorage === undefined) {
    Reflect.deleteProperty(globalThis, 'localStorage');
  } else {
    globalThis.localStorage = originalLocalStorage;
  }
});

describe('multipart browser upload', () => {
  test('reports the configured error only above the 600 MiB limit', () => {
    expect(getUploadFileSizeError({ size: MAX_UPLOAD_FILE_SIZE })).toBeNull();
    expect(
      getUploadFileSizeError({ size: MAX_UPLOAD_FILE_SIZE + 1 })
    ).toBe(MAX_UPLOAD_FILE_SIZE_ERROR);
  });

  test('rejects files above 600 MiB before creating an upload session', async () => {
    const file = {
      name: 'oversized.zip',
      size: 600 * 1024 * 1024 + 1,
      lastModified: 12345,
      type: 'application/zip'
    } as File;
    let initCalled = false;
    const transport: MultipartUploadTransport = {
      init: async () => {
        initCalled = true;
        return createSession();
      },
      status: async () => createSession(),
      uploadPart: async () => undefined,
      complete: async () => ({
        objectName: 'object.zip',
        hash: 'hash',
        etag: 'etag'
      }),
      abort: async () => undefined
    };

    await expect(uploadMultipartFile(file, transport)).rejects.toThrow(
      'Размер файла превышает лимит 600MB'
    );
    expect(initCalled).toBe(false);
  });

  test('slices parts, limits concurrency and retries only the failed part', async () => {
    const file = createFile();
    const session = createSession();
    const attempts = new Map<number, number>();
    const uploadedSlices = new Map<number, number[]>();
    const progress: number[] = [];
    let active = 0;
    let peakActive = 0;
    let statusCalls = 0;
    let completeCalls = 0;
    const transport: MultipartUploadTransport = {
      init: async () => session,
      status: async () => {
        statusCalls += 1;
        return session;
      },
      uploadPart: async (_session, partNumber, part, onProgress) => {
        const attempt = (attempts.get(partNumber) || 0) + 1;
        attempts.set(partNumber, attempt);
        active += 1;
        peakActive = Math.max(peakActive, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;

        if (partNumber === 2 && attempt === 1) {
          throw new Error('temporary part failure');
        }

        uploadedSlices.set(partNumber, [
          ...new Uint8Array(await part.arrayBuffer())
        ]);
        onProgress(part.size);
      },
      complete: async () => {
        completeCalls += 1;
        return { objectName: session.objectName, hash: 'hash', etag: 'etag' };
      },
      abort: async () => undefined
    };

    await expect(
      uploadMultipartFile(file, transport, {
        concurrency: 2,
        retryCount: 1,
        onProgress: value => progress.push(value)
      })
    ).resolves.toMatchObject({ completed: { hash: 'hash' } });

    expect(peakActive).toBeLessThanOrEqual(2);
    expect(attempts).toEqual(
      new Map([
        [1, 1],
        [2, 2],
        [3, 1]
      ])
    );
    expect(statusCalls).toBe(1);
    expect(completeCalls).toBe(1);
    expect(uploadedSlices).toEqual(
      new Map([
        [1, [0, 1, 2, 3]],
        [2, [4, 5, 6, 7]],
        [3, [8, 9, 10, 11]]
      ])
    );
    expect(progress.at(-1)).toBe(100);
    expect(
      progress.every(
        (value, index) => index === 0 || value >= progress[index - 1]
      )
    ).toBe(true);
    removePersistedMultipartUpload(file);
  });

  test('resumes from server status without re-uploading confirmed parts', async () => {
    const file = createFile('resume.bin');
    const session = createSession([
      { partNumber: 1, size: 4, etag: 'etag-1' },
      { partNumber: 2, size: 4, etag: 'etag-2' }
    ]);
    storage.set(
      STORAGE_KEY,
      JSON.stringify({
        [getMultipartFileFingerprint(file)]: {
          uploadId: session.uploadId,
          objectName: session.objectName,
          expiresAt: session.expiresAt
        }
      })
    );
    const uploaded: number[] = [];
    const progress: number[] = [];
    const transport: MultipartUploadTransport = {
      init: async () => {
        throw new Error('init must not be called for a resumable session');
      },
      status: async () => session,
      uploadPart: async (_session, partNumber, part, onProgress) => {
        uploaded.push(partNumber);
        onProgress(part.size);
      },
      complete: async () => ({
        objectName: session.objectName,
        hash: 'hash',
        etag: 'etag'
      }),
      abort: async () => undefined
    };

    await uploadMultipartFile(file, transport, {
      concurrency: 2,
      onProgress: value => progress.push(value)
    });

    expect(uploaded).toEqual([3]);
    expect(progress[0]).toBe(66);
    expect(progress.at(-1)).toBe(100);
    removePersistedMultipartUpload(file);
  });

  test('keeps parallel sends of the same file in independent upload sessions', async () => {
    const file = createFile('same-file.zip');
    let initCalls = 0;
    let statusCalls = 0;
    const transport: MultipartUploadTransport = {
      init: async () => {
        initCalls += 1;
        return {
          ...createSession(),
          uploadId: `upload-${initCalls}`,
          objectName: `object-${initCalls}.zip`
        };
      },
      status: async () => {
        statusCalls += 1;
        throw new Error('a different message must not reuse this session');
      },
      uploadPart: async (_session, _partNumber, part, onProgress) => {
        onProgress(part.size);
      },
      complete: async uploadId => ({
        objectName: `${uploadId}.zip`,
        hash: `hash-${uploadId}`,
        etag: `etag-${uploadId}`
      }),
      abort: async () => undefined
    };

    await uploadMultipartFile(file, transport, {
      persistenceKey: 'message-a:file-0'
    });
    await uploadMultipartFile(file, transport, {
      persistenceKey: 'message-b:file-0'
    });

    expect(initCalls).toBe(2);
    expect(statusCalls).toBe(0);
    const persisted = JSON.parse(storage.get(STORAGE_KEY) || '{}');
    expect(
      persisted[
        getMultipartUploadPersistenceKey(file, 'message-a:file-0')
      ].uploadId
    ).toBe('upload-1');
    expect(
      persisted[
        getMultipartUploadPersistenceKey(file, 'message-b:file-0')
      ].uploadId
    ).toBe('upload-2');

    removePersistedMultipartUpload(file, 'message-a:file-0');
    removePersistedMultipartUpload(file, 'message-b:file-0');
  });

  test('aborts active XHR work and clears the persisted descriptor', async () => {
    const file = createFile('abort.bin');
    const session = createSession();
    const controller = new AbortController();
    let abortCalls = 0;
    const transport: MultipartUploadTransport = {
      init: async () => session,
      status: async () => session,
      uploadPart: async (_session, _partNumber, _part, onProgress, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true }
          );
          onProgress(1);
          queueMicrotask(() => controller.abort());
        }),
      complete: async () => {
        throw new Error('complete must not run after cancel');
      },
      abort: async () => {
        abortCalls += 1;
      }
    };

    await expect(
      uploadMultipartFile(file, transport, {
        concurrency: 1,
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(abortCalls).toBe(1);
    const persisted = JSON.parse(storage.get(STORAGE_KEY) || '{}');
    expect(persisted[getMultipartFileFingerprint(file)]).toBeUndefined();
  });
});
