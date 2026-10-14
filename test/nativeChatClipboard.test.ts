import { expect, mock, test } from 'bun:test';
import { MediaType } from '@pksep/zod-shared-chat';
import type { IMedia } from '../src/components/interfaces/interfaces';

mock.module('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'android'
  }
}));

mock.module('@capacitor/clipboard', () => ({
  Clipboard: { write: async () => {} }
}));

mock.module('../src/services/useConfig', () => ({
  getConfig: () => ({ CHAT_API_DOMAIN: 'https://chat.example.test/api' })
}));

Object.defineProperty(globalThis, 'window', {
  value: { location: { href: 'https://chat.example.test/' } },
  configurable: true
});

const {
  canCopyChatMedia,
  encodeNativeChatClipboardContent,
  readNativeChatClipboardContent
} = await import('../src/utils/chat-clipboard');

const content = {
  version: 1 as const,
  backend: 'https://chat.example.test/api',
  kind: 'media' as const,
  media: {
    id: 'a6994da0-fbdf-4b5d-b548-26c69ca30f3a',
    path: 'media/photo.jpg',
    originName: 'photo.jpg',
    type: MediaType.Image,
    size: 1024
  }
};

test('Android chat clipboard serializes only validated media metadata', () => {
  expect(
    readNativeChatClipboardContent(encodeNativeChatClipboardContent(content))
  ).toEqual(content);
  expect(readNativeChatClipboardContent('ordinary clipboard text')).toBeNull();
});

test('Android permits an image reference without WebView pixel restrictions', () => {
  const media = {
    size: 1024,
    type: MediaType.Image,
    ex: { width: 100_000, height: 100_000 }
  } as IMedia;

  expect(canCopyChatMedia(media)).toBe(true);
});
