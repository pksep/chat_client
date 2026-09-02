import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  uploadMultipartFile,
  type MultipartUploadSession,
  type MultipartUploadTransport
} from '../src/services/useChatSDK/multipart-upload';

if (typeof window === 'undefined') {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: globalThis
  });
}

const createSession = (file: File): MultipartUploadSession => ({
  uploadId: 'upload-id',
  objectName: file.name,
  chunkSize: file.size,
  partCount: 1,
  size: file.size,
  contentType: file.type,
  expiresAt: Date.now() + 60_000,
  status: 'active',
  uploadedParts: []
});

const createTransport = (
  uploadPart: MultipartUploadTransport['uploadPart']
): MultipartUploadTransport => ({
  init: async file => createSession(file),
  status: async () => createSession(new File(['0123456789'], 'large.bin')),
  uploadPart,
  complete: async () => ({
    objectName: 'large.bin',
    hash: 'hash',
    etag: 'etag'
  }),
  abort: async () => undefined
});

describe('uploadMultipartFile progress', () => {
  it('reports only bytes emitted by the XHR transport', async () => {
    const file = new File(['0123456789'], 'large.bin', {
      type: 'application/octet-stream'
    });
    const progress: number[] = [];
    const transport = createTransport(
      async (_session, _partNumber, _part, onProgress) => {
        onProgress(2);
        onProgress(7);
        onProgress(10);
      }
    );

    await uploadMultipartFile(file, transport, {
      concurrency: 1,
      retryCount: 0,
      onProgress: percent => progress.push(percent)
    });

    assert.deepEqual(progress, [0, 20, 70, 100]);
  });

  it('does not move backwards while an XHR part is retried', async () => {
    const file = new File(['0123456789'], 'large.bin', {
      type: 'application/octet-stream'
    });
    const progress: number[] = [];
    let attempt = 0;
    const transport = createTransport(
      async (_session, _partNumber, _part, onProgress) => {
        attempt += 1;

        if (attempt === 1) {
          onProgress(5);
          throw Object.assign(new Error('retry'), { status: 500 });
        }

        onProgress(2);
        onProgress(10);
      }
    );

    await uploadMultipartFile(file, transport, {
      concurrency: 1,
      retryCount: 1,
      onProgress: percent => progress.push(percent)
    });

    assert.deepEqual(progress, [0, 50, 100]);
  });
});
