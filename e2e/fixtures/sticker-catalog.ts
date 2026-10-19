import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';
import type { CatalogSticker } from '../../src/utils/stickers';

// Искусственные ресурсы тестов не требуют локальных наборов или Telegram.
export const stickerPreviewBytes = readFileSync(
  new URL('./sticker-assets/preview.png', import.meta.url)
);
export const stickerAnimationBytes = readFileSync(
  new URL('./sticker-assets/animation.webp', import.meta.url)
);
const tgs = gzipSync(
  JSON.stringify({
    v: '5.7.4',
    fr: 60,
    ip: 0,
    op: 60,
    w: 512,
    h: 512,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'Тестовая анимация',
        sr: 1,
        ks: {
          o: { a: 0, k: 100 },
          r: { a: 0, k: 0 },
          s: { a: 0, k: [100, 100, 100] },
          a: { a: 0, k: [0, 0, 0] },
          p: {
            a: 1,
            k: [
              {
                t: 0,
                s: [128, 256, 0],
                e: [384, 256, 0],
                o: { x: 0.3, y: 0 },
                i: { x: 0.7, y: 1 }
              },
              {
                t: 30,
                s: [384, 256, 0],
                e: [128, 256, 0],
                o: { x: 0.3, y: 0 },
                i: { x: 0.7, y: 1 }
              },
              { t: 60, s: [128, 256, 0] }
            ]
          }
        },
        shapes: [
          { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [160, 160] } },
          {
            ty: 'fl',
            c: { a: 0, k: [0.9, 0.3, 0.4, 1] },
            o: { a: 0, k: 100 },
            r: 1
          }
        ],
        ip: 0,
        op: 60,
        st: 0,
        bm: 0
      }
    ]
  })
);

export const fixtureSticker = (
  id: string,
  pack: string,
  label: string,
  index = 0,
  format: CatalogSticker['format'] = 'webp'
): CatalogSticker => ({
  id,
  pack,
  label,
  version: 1,
  keywords: [label.toLowerCase(), pack],
  path: `objects/${(index + 1).toString(16).padStart(64, '0')}.${format}`,
  previewPath: `objects/${'a'.repeat(64)}.png`,
  messagePreviewPath: `objects/${'a'.repeat(64)}.png`,
  width: 512,
  height: 512,
  format,
  animationDurationMs: format === 'webp' ? 300 : 1000
});

export async function mockStickerCatalog(page: Page) {
  const packs = [
    ['sep-robots', 'SEP', 15, 'webp'],
    ['ccccccccccaaaaaaaaaatss', 'Коты', 100, 'tgs'],
    ['hamster', 'Хомяк', 1, 'webm'],
    ['fishprometheus', 'Рыба Прометей', 100, 'tgs'],
    ['all-lapenko', 'Лапенко', 1, 'webp'],
    ['flowers', 'Цветы', 1, 'webp'],
    ['unicorn', 'Радужный единорог', 1, 'webp']
  ].map(([id, label, count, format]) => ({
    id: String(id),
    label: String(label),
    count: Number(count),
    format: format as CatalogSticker['format'],
    previewPath: `objects/${'a'.repeat(64)}.png`,
    messagePreviewPath: `objects/${'b'.repeat(64)}.png`,
    thumbnail: {
      path: `objects/${(90000 + Number(count)).toString(16).padStart(64, '0')}.${format === 'tgs' ? 'tgs' : format === 'webm' ? 'webm' : 'webp'}`,
      format: format as CatalogSticker['format'],
      width: 512,
      height: 512
    }
  }));
  const items = packs.flatMap((pack, packIndex) =>
    Array.from({ length: pack.count }, (_, index) =>
      fixtureSticker(
        `${pack.id}-${index}`,
        pack.id,
        `${pack.label} ${pack.id === 'hamster' ? 120 : index + 1}`,
        packIndex * 1000 + index,
        pack.format
      )
    )
  );
  const video = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 32;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ed5465';
      context.fillRect(0, 0, 32, 32);
      const stream = canvas.captureStream(30);
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      const chunks: Blob[] = [];
      recorder.ondataavailable = event => chunks.push(event.data);
      const stopped = new Promise<void>(resolve => {
        recorder.onstop = () => resolve();
      });
      recorder.start();
      let frame = 0;
      const animation = setInterval(() => {
        context.fillStyle = frame++ % 2 ? '#ed5465' : '#4a80dd';
        context.fillRect(0, 0, 32, 32);
      }, 33);
      await new Promise(resolve => setTimeout(resolve, 250));
      recorder.stop();
      clearInterval(animation);
      await stopped;
      stream.getTracks().forEach(track => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
    })
  );
  await page.route(/\/stickers(?:\/|\?|$)/, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/packs'))
      return route.fulfill({ json: { packs } });
    if (url.pathname.includes('/assets/')) {
      const extension = url.pathname.split('.').at(-1);
      return route.fulfill({
        body:
          extension === 'tgs'
            ? tgs
            : extension === 'webm'
              ? video
              : extension === 'webp'
                ? stickerAnimationBytes
                : stickerPreviewBytes,
        contentType:
          extension === 'tgs'
            ? 'application/x-tgsticker'
            : extension === 'webm'
              ? 'video/webm'
              : extension === 'webp'
                ? 'image/webp'
                : 'image/png'
      });
    }
    if (url.pathname.endsWith('/resolve')) {
      const references = route.request().postDataJSON().references as {
        id: string;
      }[];
      return route.fulfill({
        json: {
          items: references.flatMap(reference =>
            items.filter(item => item.id === reference.id)
          )
        }
      });
    }
    const query = (url.searchParams.get('q') || '').trim().toLowerCase();
    const excluded = (url.searchParams.get('excludePacks') || '').split(',');
    const filtered = items.filter(
      item =>
        !excluded.includes(item.pack) &&
        (!url.searchParams.get('pack') ||
          item.pack === url.searchParams.get('pack')) &&
        (!query || item.keywords.some(keyword => keyword.includes(query)))
    );
    const offset = Number(url.searchParams.get('cursor')) || 0;
    const limit = Number(url.searchParams.get('limit')) || 48;
    return route.fulfill({
      json: {
        items: filtered.slice(offset, offset + limit),
        nextCursor:
          offset + limit < filtered.length ? String(offset + limit) : null,
        total: filtered.length,
        revision: 'test'
      }
    });
  });
  return { packs, items };
}
