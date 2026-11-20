import { expect, test } from 'bun:test';
import {
  desktopAppDownloadsFor,
  desktopBrowserPlatform
} from '../src/utils/desktop-app-downloads';

test('определяет desktop-систему и отличает iPad от Mac', () => {
  const platform = (value: string, ua = value, touch = 0) =>
    desktopBrowserPlatform({
      platform: value,
      userAgent: ua,
      maxTouchPoints: touch
    });
  expect(platform('Win32')).toBe('windows');
  expect(platform('MacIntel')).toBe('macos');
  expect(platform('Linux x86_64')).toBe('linux');
  expect(platform('Linux', 'Android')).toBe('mobile');
  expect(platform('MacIntel', 'Safari', 5)).toBe('mobile');
  expect(platform('Linux', 'CrOS')).toBe('unknown');
});
test('на Mac доступны обе архитектуры; выбор другой системы сохраняется', () => {
  const downloads = desktopAppDownloadsFor('macos');
  expect(downloads.map(item => item.label)).toEqual([
    'Mac Apple Silicon',
    'Mac Intel',
    'Windows',
    'Linux'
  ]);
  expect(downloads[0].url).toBe(
    'https://chat-server-prod.pksep.ru/api/downloads/desktop/macos-arm64'
  );
  expect(downloads[1].url).toBe(
    'https://chat-server-prod.pksep.ru/api/downloads/desktop/macos-x64'
  );
  expect(desktopAppDownloadsFor('linux')[0].url).toBe(
    'https://chat-server-prod.pksep.ru/api/downloads/desktop/linux-x64'
  );
});
