import { afterEach, expect, test } from 'bun:test';
import { gzipSync, strToU8 } from 'fflate';
import { loadTgsAnimation } from '../src/utils/tgs-animation';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
test('пикер и сообщение получают независимые кадры из одного оригинала TGS', async () => {
  let requests = 0;
  globalThis.fetch = (async () => {
    requests += 1;
    return new Response(
      gzipSync(
        strToU8(
          JSON.stringify({ w: 512, h: 512, layers: [{ name: 'original' }] })
        )
      )
    );
  }) as typeof fetch;
  const [picker, message] = await Promise.all([
    loadTgsAnimation('/test-clones.tgs'),
    loadTgsAnimation('/test-clones.tgs')
  ]);
  expect(requests).toBe(1);
  (picker.layers as { name: string }[])[0].name = 'changed';
  expect((message.layers as { name: string }[])[0].name).toBe('original');
  expect((await loadTgsAnimation('/test-clones.tgs')).layers).toEqual([
    { name: 'original' }
  ]);
  expect(requests).toBe(1);
});
test('неудачная загрузка TGS не мешает повторной попытке', async () => {
  globalThis.fetch = (async () =>
    new Response('', { status: 503 })) as typeof fetch;
  await expect(loadTgsAnimation('/test-retry.tgs')).rejects.toThrow();
  globalThis.fetch = (async () =>
    new Response(
      gzipSync(strToU8(JSON.stringify({ w: 512, h: 512, layers: [] })))
    )) as typeof fetch;
  expect((await loadTgsAnimation('/test-retry.tgs')).w).toBe(512);
});
