<template>
  <main>
    <nav>
      <button @click="setTheme('light')">Светлая тема</button>
      <button @click="setTheme('dark')">Тёмная тема</button>
      <button @click="status = MessageStatus.Delivery">
        Подтвердить доставку
      </button>
      <button @click="withReactions = !withReactions">
        Переключить реакции
      </button>
    </nav>
    <form @submit.prevent="send">
      <label>Сообщение <input v-model="draft" aria-label="Сообщение" /></label>
      <button type="submit">Отправить</button>
    </form>
    <div class="emoji-fixture-messages">
      <MessageBubble
        v-for="(message, index) in messages"
        :key="index"
        :message="message"
        :message-id="String(index)"
        :message-status="status"
        :is-me-sender="true"
        :is-dialog="true"
        :reactions="withReactions ? reactions : []"
        time="12:30"
        :data-testid="`EmojiMessage-${index}`"
      />
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { Reaction } from '@pksep/zod-shared-chat';
import MessageBubble from '../../src/components/Messages/MessageBubble.vue';
import { MessageStatus } from '../../src/services/useChatSDK/types';

const draft = ref('🙂');
const messages = ref<string[]>([]);
const status = ref(MessageStatus.Wait);
const withReactions = ref(false);
const reactions = [
  { id: 'reaction-1', messageId: '0', senderUserId: 'peer-1', text: '👍' }
] as Reaction[];
const send = () => {
  messages.value.push(`<p>${draft.value}</p>`);
  draft.value = '';
};
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
  max-width: 700px;
  margin: 0 auto;
  padding: 16px;
}
nav,
form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.emoji-fixture-messages {
  padding: 16px;
  min-height: 300px;
  background: var(--chat-wallpaper-background, #e3e9f7);
}
</style>
