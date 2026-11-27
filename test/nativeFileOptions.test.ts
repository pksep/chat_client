import { expect, test } from 'bun:test';
import { MediaType } from '@pksep/zod-shared-chat';
import {
  getNativeDownloadSize,
  nativeFileUrlKey
} from '../src/utils/native-file-options';
import type { IMedia } from '../src/components/interfaces/interfaces';

test('после обработки изображений и видео исходный размер не сравнивается с размером скачиваемого объекта', () => {
  expect(
    getNativeDownloadSize({ type: MediaType.Image, size: 595564 } as IMedia)
  ).toBeUndefined();
  expect(
    getNativeDownloadSize({ type: MediaType.Video, size: 345678 } as IMedia)
  ).toBeUndefined();
  expect(
    getNativeDownloadSize({ type: MediaType.File, size: 123456 } as IMedia)
  ).toBe(123456);
});

test('слайдер, меню и проверка скачанного файла используют один ключ, сохраняя параметры доступа', () => {
  const base =
    'https://files.test/api/media/object/photo.webp?token=public-fixture';
  expect(
    nativeFileUrlKey(base + '&downloadName=image.png&preview=1&v=old#view')
  ).toBe(base);
  expect(nativeFileUrlKey(base)).toBe(base);
  expect(nativeFileUrlKey(base.replace('photo.webp', 'another.webp'))).not.toBe(
    base
  );
  expect(nativeFileUrlKey(base.replace('public-fixture', 'other'))).not.toBe(
    base
  );
});
