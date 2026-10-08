<template>
  <main>
    <nav>
      <button @click="setTheme('light')">Светлая тема</button>
      <button @click="setTheme('dark')">Тёмная тема</button>
      <button @click="withReactions = !withReactions">
        Переключить реакции
      </button>
      <button @click="status = MessageStatus.Wait">Отправка</button>
      <button @click="status = MessageStatus.Delivery">Доставлено</button>
      <button @click="status = MessageStatus.NotDelivered">Ошибка</button>
    </nav>
    <section v-for="outgoing in [true, false]" :key="String(outgoing)">
      <h3>{{ outgoing ? 'Исходящие' : 'Входящие' }}</h3>
      <div class="footer-comparison">
        <div v-for="sticker in [false, true]" :key="String(sticker)">
          <p>{{ sticker ? 'Стикер' : 'Один эмодзи' }}</p>
          <MessageBubble
            :class="{ message__other: outgoing }"
            :message="sticker ? content.text : '🙂'"
            :message-ex="sticker ? content.metadata : undefined"
            :message-status="status"
            :reactions="withReactions ? reactions : []"
            :is-me-sender="outgoing"
            :is-dialog="true"
            time="12:30"
            :data-testid="`${sticker ? 'Sticker' : 'Emoji'}-${outgoing ? 'Outgoing' : 'Incoming'}`"
          />
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Reaction } from '@pksep/zod-shared-chat';
import MessageBubble from '../../src/components/Messages/MessageBubble.vue';
import { MessageStatus } from '../../src/services/useChatSDK/types';
import { createStickerMessage } from '../../src/utils/stickers';

const content = createStickerMessage('sep-robot-heart')!;
const withReactions = ref(false);
const status = ref(MessageStatus.Wait);
const reactions = [1, 2].map(index => ({
  id: `reaction-${index}`,
  messageId: 'footer-preview',
  senderUserId: `peer-${index}`,
  text: '👍'
})) as Reaction[];
const setTheme = (theme: string) =>
  document.documentElement.setAttribute('data-theme', theme);
</script>

<style>
body {
  margin: 0;
  background: var(--surface-main);
  color: var(--text-primary);
  font-family: 'Inter Variable', sans-serif;
}
main {
  max-width: 850px;
  margin: 0 auto;
  padding: 16px;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.footer-comparison {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  padding: 16px;
  background: var(--chat-wallpaper-background, #e3e9f7);
}

@media (max-width: 600px) {
  .footer-comparison {
    grid-template-columns: 1fr;
  }
}
</style>
