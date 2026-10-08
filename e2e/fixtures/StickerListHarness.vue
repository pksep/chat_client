<template>
  <main>
    <nav>
      <button @click="appendSticker">Добавить стикер</button>
      <button @click="confirmDelivery">Подтвердить доставку</button>
      <button @click="appendText">Добавить текст</button>
    </nav>
    <div class="chat__message-wrapper">
      <MessageListUserItems
        :messages="messages"
        :auth-user-id="userId"
        :hide-unread-marker="true"
        data-testid="StickerList"
      />
    </div>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import MessageListUserItems from '../../src/components/Messages/MessageListUserItems.vue';
import type { IMessage } from '../../src/components/interfaces/interfaces';
import { MessageStatus } from '../../src/services/useChatSDK/types';
import { createStickerMessage } from '../../src/utils/stickers';

const userId = 'sticker-test-user';
const messages = ref<IMessage[]>([]);
const appendMessage = (sticker: boolean) => {
  const clientId = `local-${messages.value.length + 1}`;
  const content = sticker ? createStickerMessage('sep-robot-heart')! : null;
  messages.value.push({
    id: clientId,
    topicId: 'sticker-test-topic',
    senderUserId: userId,
    text: content?.text || 'Тестовое сообщение',
    ex: JSON.stringify({ clientId, ...content?.metadata }),
    createdAt: new Date('2026-10-07T10:00:00Z'),
    status: MessageStatus.Wait,
    isSystem: false
  } as IMessage);
};
const appendSticker = () => appendMessage(true);
const appendText = () => appendMessage(false);
const confirmDelivery = () => {
  messages.value = messages.value.map(message => ({
    ...message,
    id: message.id.replace('local-', 'server-'),
    status: MessageStatus.Delivery
  }));
};
</script>

<style>
body {
  margin: 0;
  color: var(--text-primary);
  background: var(--surface-main);
  font-family: 'Inter Variable', sans-serif;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 15px;
}
.chat__message-wrapper {
  height: 480px;
  overflow: auto;
  padding: 15px;
}
</style>
