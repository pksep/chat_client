import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import ChatContainer from '../../src/components/ChatContainer.vue';
import { authedUser } from '../../src/composables/useAuth';
import { useChatsToolbarState } from '../../src/composables/useChatsToolbarState';
import { setTopics } from '../../src/composables/useTopics';
import { initRoute } from '../../src/composables/navigation/useUrlRouting';
import { setConfig } from '../../src/services/useConfig';
import { initializeChat, getChatSDK } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import {
  saveMessagesToLocal,
  deleteMessageFromLocal
} from '../../src/services/useMessages';
import { emojiDirective } from '../../src/directives/emoji';
import type {
  IUser,
  ITopic,
  IMessage
} from '../../src/components/interfaces/interfaces';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import { searchMessages } from './slow-network-search-data';

export async function initializeSearchFixture() {
  authedUser.value = { id: 'search-user', initials: 'Тест' } as IUser;
  setConfig({ CHAT_API_DOMAIN: `${location.origin}/search-api` });
  ChatSDK.prototype.connect = () => new Promise<void>(() => {});
  await initializeChat({
    userId: 'search-user',
    token: 'isolated-search-test',
    apiUrl: `${location.origin}/search-api`,
    wsUrl: 'ws://127.0.0.1:65530'
  });
  setTopics([
    {
      id: 'search-topic',
      type: 'DM',
      name: 'Собеседник',
      user: { id: 'search-peer', initials: 'Собеседник' },
      info: { unreadCount: 0 }
    } as ITopic
  ]);
  saveMessagesToLocal('search-topic', searchMessages as IMessage[], {
    skipPersist: true,
    syncLastMessage: false
  });
  history.replaceState({}, '', '/dialogs');
  initRoute();
  createApp({ render: () => h(ChatContainer, { dataTestid: 'Search' }) })
    .use(createPinia())
    .directive('emoji', emojiDirective)
    .mount('#app');
  await nextTick();
  return {
    sdk: getChatSDK(),
    authedUser,
    toolbar: useChatsToolbarState(),
    deleteMessageFromLocal,
    editLocalResult() {
      saveMessagesToLocal(
        'search-topic',
        searchMessages.map(message =>
          message.id === 'search-local-2'
            ? {
                ...message,
                text: 'Локальный поиск: новая правка',
                updatedAt: '2026-10-26T01:00:00Z'
              }
            : message
        ) as IMessage[],
        { skipPersist: true, syncLastMessage: false }
      );
    }
  };
}
