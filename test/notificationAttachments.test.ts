import { expect, test } from 'bun:test';
import { getNotificationAttachmentPreview } from '../src/utils/notification-attachments';
import type { IMedia } from '../src/components/interfaces/interfaces';

const media = (type: string, originName = '') =>
  ({ type, originName }) as IMedia;

test('русские подписи медиа сохраняют различие между фото и отправкой как файла', () => {
  expect(getNotificationAttachmentPreview([media('IMAGE', 'photo.jpg')])).toBe(
    'Фото'
  );
  expect(getNotificationAttachmentPreview([media('VIDEO', 'video.mp4')])).toBe(
    'Видео'
  );
  expect(getNotificationAttachmentPreview([media('FILE', 'photo.jpg')])).toBe(
    'Файл: photo.jpg'
  );
  expect(getNotificationAttachmentPreview([media('FILE', 'Счёт.pdf')])).toBe(
    'Документ: Счёт.pdf'
  );
  expect(getNotificationAttachmentPreview([media('FILE', 'запись.OPUS')])).toBe(
    'Аудиофайл: запись.OPUS'
  );
});

test('несколько разных вложений считаются по типам с русскими окончаниями', () => {
  expect(
    getNotificationAttachmentPreview([
      media('IMAGE'),
      media('IMAGE'),
      media('VIDEO'),
      media('FILE', '1.pdf'),
      media('FILE', '2.pdf')
    ])
  ).toBe('2 фото, 1 видео, 2 документа');
  for (const [count, expected] of [
    [1, 'Файл'],
    [2, '2 файла'],
    [5, '5 файлов'],
    [11, '11 файлов'],
    [21, '21 файл'],
    [22, '22 файла']
  ] as const)
    expect(
      getNotificationAttachmentPreview(
        Array.from({ length: count }, () => media('FILE'))
      )
    ).toBe(expected);
  expect(getNotificationAttachmentPreview()).toBe('');
});
