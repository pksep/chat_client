import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readResponseBlobWithinLimit } from '../src/services/useMediaBlobCache';

describe('media blob cache limit', () => {
  it('cancels a response whose declared size exceeds the cache limit', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        cancel: () => {
          cancelled = true;
        }
      }),
      {
        headers: {
          'content-length': '1000',
          'content-type': 'video/mp4'
        }
      }
    );

    const blob = await readResponseBlobWithinLimit(response, 100);

    assert.equal(blob, null);
    assert.equal(cancelled, true);
  });

  it('stops an unknown-length stream as soon as it crosses the limit', async () => {
    let cancelled = false;
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([1, 2]));
          controller.enqueue(Uint8Array.from([3, 4]));
        },
        cancel: () => {
          cancelled = true;
        }
      }),
      { headers: { 'content-type': 'application/octet-stream' } }
    );

    const blob = await readResponseBlobWithinLimit(response, 3);

    assert.equal(blob, null);
    assert.equal(cancelled, true);
  });

  it('returns a small streamed body intact', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Uint8Array.from([1, 2]));
          controller.enqueue(Uint8Array.from([3]));
          controller.close();
        }
      }),
      { headers: { 'content-type': 'application/octet-stream' } }
    );

    const blob = await readResponseBlobWithinLimit(response, 3);

    assert.ok(blob);
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [1, 2, 3]);
  });
});
