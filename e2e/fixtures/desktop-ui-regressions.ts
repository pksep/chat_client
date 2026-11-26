import { createApp, nextTick } from 'vue';
import ChatStickerPicker from '../../src/components/Messages/ChatStickerPicker.vue';
import { useAiAssistant } from '../../src/composables/useAiAssistant';

export async function checkDesktopUiRegressions(): Promise<void> {
  const ai = useAiAssistant();
  if (ai.activeTab.value !== 'chats' || ai.activeView.value !== 'chat')
    throw new Error('Tauri не открыл обычный ИИ-чат по умолчанию');

  const host = document.createElement('div');
  host.innerHTML =
    '<div class="emoji-picker--open"><div class="v3-emoji-picker"></div></div>';
  const target = document.createElement('div');
  document.body.append(host, target);
  const app = createApp(ChatStickerPicker, { host, enabled: true });
  app.mount(target);
  try {
    await nextTick();
    const tab = host.querySelectorAll<HTMLButtonElement>(
      '.chat-sticker-picker__mode-button'
    )[1];
    if (!tab) throw new Error('Нет переключателя стикеров');
    tab.click();
    await nextTick();
    if (tab.getAttribute('aria-pressed') !== 'true')
      throw new Error('Первый клик стикеров потерян до готовности body');
    const body = document.createElement('div');
    body.className = 'v3-body';
    host.firstElementChild!.append(body);
    await new Promise(resolve => setTimeout(resolve, 50));
    await nextTick();
    const panel = body.querySelector('.chat-sticker-picker');
    if (!panel || panel.getAttribute('aria-hidden') !== 'false')
      throw new Error('Стикеры не открылись после готовности body');
  } finally {
    app.unmount();
    host.remove();
    target.remove();
  }
}
