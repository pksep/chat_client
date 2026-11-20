import { expect, test } from 'bun:test';
import { desktopBrowserPlatform } from '../src/utils/desktop-app-downloads';

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
