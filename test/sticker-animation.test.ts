import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { chatStickers } from '../src/utils/stickers';
import durations from '../src/utils/sticker-durations.json';
import {
  inspectStickerAnimation,
  prepareKeyboardSticker
} from '../src/utils/sticker-animation';

const finiteGif = new Uint8Array(
  Buffer.from(
    'R0lGODlhAgACAIEAAP8AAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEBAAAh+QQACgAAACwAAAAAAgACAAAIBgABCAQQEAAh+QQBFAABACwAAAAAAgACAIEAAP8AAAAAAAAAAAAIBgABCAQQEAA7',
    'base64'
  )
);
const gifLoopOffset = (bytes: Uint8Array) =>
  Buffer.from(bytes).indexOf('NETSCAPE2.0') + 13;

describe('непрерывная анимация стикеров', () => {
  test('все 15 локальных файлов анимированы, зациклены и имеют готовое превью', async () => {
    for (const sticker of chatStickers) {
      const source = await readFile(
        new URL(`../public${sticker.src}`, import.meta.url)
      );
      const bytes = new Uint8Array(source);
      const before = bytes.slice();
      const duration = inspectStickerAnimation(bytes);
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBe((durations as Record<string, number>)[sticker.id]);
      // Анализатор меняет конечное число повторов на 0; готовые ресурсы уже зациклены.
      expect(bytes).toEqual(before);
      expect(
        (
          await readFile(
            new URL(`../public${sticker.previewSrc}`, import.meta.url)
          )
        ).length
      ).toBeGreaterThan(0);
    }
  });

  test('WebP из клавиатуры повторяется без изменения кадров и типа файла', async () => {
    const original = new Uint8Array(
      await readFile(
        new URL('../public/stickers/sep-robots/v1/heart.webp', import.meta.url)
      )
    );
    const bytes = original.slice();
    const loopOffset = Buffer.from(bytes).indexOf('ANIM') + 12;
    bytes[loopOffset] = 1;
    const result = await prepareKeyboardSticker(
      new File([bytes], 'keyboard.webp', { type: 'image/webp' })
    );
    expect(result.durationMs).toBe(durations['sep-robot-heart']);
    expect(result.file.name).toBe('keyboard.webp');
    expect(result.file.type).toBe('image/webp');
    expect(new Uint8Array(await result.file.arrayBuffer())).toEqual(original);
  });

  test('GIF из клавиатуры с ограниченным повторением становится бесконечным', async () => {
    const result = await prepareKeyboardSticker(
      new File([finiteGif], 'keyboard.gif', { type: 'image/gif' })
    );
    const bytes = new Uint8Array(await result.file.arrayBuffer());
    const offset = gifLoopOffset(bytes);
    expect(result.durationMs).toBe(300);
    expect(bytes[offset]).toBe(0);
    expect(bytes[offset + 1]).toBe(0);
    const expected = finiteGif.slice();
    expected[offset] = 0;
    expected[offset + 1] = 0;
    expect(bytes).toEqual(expected);
  });

  test('GIF без расширения повторения получает его без перекодирования', async () => {
    const start = Buffer.from(finiteGif).indexOf('NETSCAPE2.0') - 3;
    const withoutLoop = new Uint8Array([
      ...finiteGif.slice(0, start),
      ...finiteGif.slice(start + 19)
    ]);
    const result = await prepareKeyboardSticker(
      new File([withoutLoop], 'keyboard.gif', { type: 'image/gif' })
    );
    const bytes = new Uint8Array(await result.file.arrayBuffer());
    expect(result.durationMs).toBe(300);
    expect(bytes.length).toBe(finiteGif.length);
    expect(bytes[gifLoopOffset(bytes)]).toBe(0);
    const second = await prepareKeyboardSticker(result.file);
    expect(new Uint8Array(await second.file.arrayBuffer())).toEqual(bytes);
  });

  test('статичные и повреждённые изображения не получают анимационные метаданные', () => {
    for (const bytes of [
      new Uint8Array(),
      new Uint8Array([71, 73, 70]),
      new Uint8Array(Buffer.from('RIFF\x00\x00\x00\x00WEBP'))
    ]) {
      expect(inspectStickerAnimation(bytes)).toBe(0);
    }
  });
});
