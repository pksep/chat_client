import { nextTick } from 'vue';
import { isTauri } from '@tauri-apps/api/core';
import { initializeTopicPerformanceFixture } from './topic-performance-harness';
import { setConfig } from '../../src/services/useConfig';
import { readChatClipboardContent } from '../../src/utils/chat-clipboard';

const endpoint = 'http://127.0.0.1:5210';
const result = document.querySelector<HTMLOutputElement>('#result')!;
const realFetch = window.fetch.bind(window);
// Изолирован только chat API. Загрузка файлов и Tauri IPC остаются настоящими.
window.fetch = async (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href
  );
  if (
    url.origin === location.origin &&
    url.pathname.startsWith('/performance-api/')
  )
    return Response.json([]);
  if (![location.origin, endpoint].includes(url.origin))
    throw new Error('Внешний запрос запрещён в локальной проверке');
  return realFetch(input, init);
};
const report = async (value: unknown) => {
  result.textContent = JSON.stringify(value);
  await fetch(`${endpoint}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });
};
const sizes = await (await fetch(`${endpoint}/reports`)).json();
const fixture = await initializeTopicPerformanceFixture(1);
setConfig({
  CHAT_API_DOMAIN: `${location.origin}/performance-api`,
  CHAT_PATH_TO_FILE_CDN: `${endpoint}/media/object`
});
fixture.navigate('performance-0');
while (!document.querySelector('.ProseMirror'))
  await new Promise(resolve => setTimeout(resolve, 50));
// Начальная пустая история должна примениться до локальных сообщений.
while (!document.body.textContent?.includes('Сообщений пока нет'))
  await new Promise(resolve => setTimeout(resolve, 50));
let images = false;
let caption = true;
const seed = async () => {
  const extension = images ? 'png' : 'txt';
  fixture.seed('performance-0', [
    {
      id: 'native-menu-message',
      topicId: 'performance-0',
      text: caption ? '<p>Подпись к двум локальным вложениям</p>' : '',
      type: 'TEXT',
      senderUserId: 'peer-0',
      senderUser: fixture.topics[0].user,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'READ',
      media: ['A', 'B'].map(letter => ({
        id: `native-menu-${letter}`,
        path: `menu-${letter}.${extension}`,
        originName: `SEP Chat Menu ${letter}.${extension}`,
        size: images ? sizes.pngSize : sizes.textSize,
        type: images ? 'IMAGE' : 'FILE',
        ex: { width: 256, height: 256 }
      })),
      reactions: [],
      messageRead: [],
      isReadByMe: true
    }
  ] as Parameters<typeof fixture.seed>[1]);
  await nextTick();
  await report({ step: 'ready', tauri: isTauri(), images, caption });
};
document.querySelector('#files')!.addEventListener('click', () => {
  images = false;
  void seed();
});
document.querySelector('#images')!.addEventListener('click', () => {
  images = true;
  void seed();
});
document.querySelector('#caption')!.addEventListener('click', () => {
  caption = !caption;
  void seed();
});
document.querySelector('#paste')!.addEventListener('paste', event => {
  const clipboard = (event as ClipboardEvent).clipboardData;
  const content = readChatClipboardContent(
    clipboard?.getData('text/html') || ''
  );
  event.preventDefault();
  void report({
    step: 'paste',
    types: Array.from(clipboard?.types || []),
    mediaId: content?.kind === 'media' ? content.media.id : null
  });
});
document.addEventListener('contextmenu', event => {
  const mediaId = (event.target as Element).closest(
    '[data-message-context="message"]'
  )
    ? null
    : (event.target as Element)
        .closest('[data-message-media-id]')
        ?.getAttribute('data-message-media-id');
  window.setTimeout(() => {
    const buttons = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-testid*="MessageBubble-"]'
      )
    ]
      .filter(
        button =>
          button.tagName === 'BUTTON' && button.getBoundingClientRect().width
      )
      .map(button => button.textContent?.trim());
    void report({
      step: 'menu',
      mediaId: mediaId || null,
      images,
      caption,
      buttons
    });
  }, 400);
});
await seed();
