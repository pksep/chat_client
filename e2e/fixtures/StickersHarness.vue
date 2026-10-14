<template>
  <main>
    <nav>
      <button @click="setTheme('light')">Светлая тема</button>
      <button @click="setTheme('dark')">Тёмная тема</button>
      <span data-testid="SendCount"
        >Отправлено: {{ visibleMessages.length }}</span
      >
    </nav>
    <div class="fixture-messages">
      <MessageBubble
        v-for="message in visibleMessages"
        :key="message.id"
        :message="message.text"
        :message-id="String(message.id)"
        :message-ex="message.ex"
        :media="message.media"
        :message-status="message.status"
        :is-me-sender="true"
        :is-dialog="true"
        time="12:30"
        data-testid="StickerMessage"
        @open-sticker-pack="openStickerPack"
      />
    </div>
    <div ref="editorHost" class="fixture-editor">
      <MessageListInput
        v-if="composer"
        ref="composerRef"
        v-model="draft"
        :topic-id="offlineTopicId"
        :edit-message="null"
        :reply-message="null"
        :forward-messages="[]"
        data-testid="StickerComposer"
        @send-sticker="sendSticker"
      />
      <ContentEditor
        v-else
        v-model="draft"
        :stickers="catalog ? [] : chatStickers"
        @unmount-sticker="sendSticker"
      />
    </div>
    <output data-testid="Draft">{{ draft }}</output>
    <ChatStickerPicker
      v-if="catalog && !composer"
      ref="stickerPickerRef"
      :host="editorHost"
      :enabled="true"
      @select="sendSticker"
    />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, reactive, ref } from 'vue';
import { ContentEditor } from '@pksep/yui';
import MessageBubble from '../../src/components/Messages/MessageBubble.vue';
import MessageListInput from '../../src/components/Messages/MessageListInput.vue';
import { chatStickers, createStickerMessage } from '../../src/utils/stickers';
import { setConfig } from '../../src/services/useConfig';
import { MessageStatus } from '../../src/services/useChatSDK/types';
import { useMessageSender } from '../../src/components/Messages/composables/useMessageSender';
import { getFullMessagesByTopicId } from '../../src/services/useMessages';
import { bindKeyboardMedia } from '../../src/services/useKeyboardMedia';
import ChatStickerPicker from '../../src/components/Messages/ChatStickerPicker.vue';
import { loadStickerPage } from '../../src/services/sticker-catalog';
import type { IMedia } from '../../src/components/interfaces/interfaces';

const draft = ref('<p>Несохранённый черновик</p>');
const messages = ref<
  { id: number; text: string; ex: string; status: string; media?: IMedia[] }[]
>([]);
const offline = new URLSearchParams(window.location.search).has('offline');
const catalog = new URLSearchParams(window.location.search).has('catalog');
const composer = new URLSearchParams(window.location.search).has('composer');
const composerRef = ref<InstanceType<typeof MessageListInput> | null>(null);
const initialPack = new URLSearchParams(window.location.search).get(
  'message-pack'
);
const stickerApi = new URLSearchParams(window.location.search).get(
  'sticker-api'
);
if (stickerApi)
  setConfig({ CHAT_API_DOMAIN: `${window.location.origin}${stickerApi}` });
const offlineTopicId = 'd9fe27c7-0bb1-48c3-b00d-1120524bb070';
let offlineSend: ((id: string) => Promise<void>) | undefined;
let keyboardSend: ((file: File) => Promise<void>) | undefined;
const editorHost = ref<HTMLElement | null>(null);
const stickerPickerRef = ref<InstanceType<typeof ChatStickerPicker> | null>(
  null
);
let unbindKeyboard: (() => void) | null = null;
const openStickerPack = (pack: string) => {
  if (composer) return composerRef.value?.openStickerPack(pack);
  return stickerPickerRef.value?.openPack(pack);
};
if (offline) {
  const sender = useMessageSender(
    ref({ id: offlineTopicId, type: 'favorites' }),
    draft,
    reactive({
      aiMessages: [],
      editMessage: null,
      replyMessage: null,
      forwardMessages: [],
      hideUnreadMarker: false
    }),
    ref({ id: '12d9eaa1-682c-462d-9ed0-509018c42a15', name: 'Проверка' }),
    ref(null),
    () => {},
    () => {}
  );
  offlineSend = sender.handleSendSticker;
  keyboardSend = sender.handleSendKeyboardMedia;
}
const visibleMessages = computed(() =>
  offline
    ? getFullMessagesByTopicId(offlineTopicId).map(message => ({
        id: message.id,
        text: message.text || '',
        ex: message.ex,
        media: message.media,
        status: message.status || MessageStatus.Wait
      }))
    : messages.value
);
onMounted(async () => {
  unbindKeyboard = await bindKeyboardMedia({
    getTargetElement: () => editorHost.value,
    onMedia: file => {
      void keyboardSend?.(file);
    }
  });
  if (catalog && initialPack) {
    const page = await loadStickerPage(initialPack, '');
    if (page.items[0]) sendSticker(page.items[0].id);
  }
});
onBeforeUnmount(() => unbindKeyboard?.());
const setTheme = (theme: string) =>
  document.documentElement.setAttribute('data-theme', theme);
const sendSticker = (id: string) => {
  if (offlineSend) {
    void offlineSend(id);
    return;
  }
  const content = createStickerMessage(id);
  if (!content) return;
  const message = {
    id: messages.value.length,
    text: content.text,
    ex: JSON.stringify(content.metadata),
    status: MessageStatus.Wait
  };
  messages.value.push(message);
  // Фикстура имитирует подтверждение доставки, не отправляя сообщения в настоящий чат.
  setTimeout(() => {
    messages.value.find(item => item.id === message.id)!.status =
      MessageStatus.Delivery;
  }, 500);
};
</script>

<style>
body {
  margin: 0;
  color: var(--text-primary);
  background: var(--surface-main);
  font-family: 'Inter Variable', sans-serif;
}
main {
  max-width: 800px;
  margin: 0 auto;
  padding: 16px;
}
nav {
  display: flex;
  gap: 12px;
  align-items: center;
}
.fixture-messages {
  min-height: 280px;
  max-height: 340px;
  overflow: auto;
  padding: 10px;
  background: var(--chat-wallpaper-background, #e3e9f7);
}
.fixture-editor {
  padding: 16px;
  background: var(--surface-overlay);
  border-radius: 15px;
}
output {
  display: block;
  margin-top: 15px;
}
</style>
