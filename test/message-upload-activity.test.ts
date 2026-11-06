import { expect, test } from 'bun:test';
import type { IUser } from '../src/components/interfaces/interfaces';
import {
  getMessageUploadKind,
  getUploadIndicatorLabel
} from '../src/utils/message-upload-activity';

const user = { id: 'one', initials: 'Иванов И.И.' } as IUser;

test('выбирает вид вложения с учётом отправки как файл', () => {
  expect(getMessageUploadKind({ type: 'image/png' }, true)).toBe('photo');
  expect(getMessageUploadKind({ type: 'video/mp4' }, true)).toBe('video');
  expect(getMessageUploadKind({ type: 'image/png' }, false)).toBe('file');
  expect(getMessageUploadKind({ type: 'application/pdf' }, true)).toBe('file');
});

test('согласует названия вложений и участников', () => {
  expect(getUploadIndicatorLabel('GROUP', [{ user, kind: 'photo' }])).toBe(
    'Иванов И.И. отправляет фото'
  );
  expect(getUploadIndicatorLabel('DM', [{ user, kind: 'video' }])).toBe(
    'Отправляет видео'
  );
  expect(
    getUploadIndicatorLabel('GROUP', [
      { user, kind: 'photo' },
      { user, kind: 'video' }
    ])
  ).toBe('Иванов И.И. отправляет файлы');
  for (const [count, noun] of [
    [2, 'пользователя'],
    [5, 'пользователей'],
    [11, 'пользователей'],
    [21, 'пользователь']
  ]) {
    const uploads = Array.from({ length: Number(count) }, (_, id) => ({
      user: { ...user, id: String(id) },
      kind: 'file' as const
    }));
    expect(getUploadIndicatorLabel('GROUP', uploads)).toBe(
      `${count} ${noun} отправляют файлы`
    );
  }
  expect(getUploadIndicatorLabel('DM', [])).toBe('');
});
