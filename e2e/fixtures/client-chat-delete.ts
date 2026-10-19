import { createApp, h, nextTick, type VNode } from 'vue';
import { createPinia } from 'pinia';
import '../../src/assets/chat-container.css';
import Header from '../../src/components/Header/Header.vue';
import MessageList from '../../src/components/MessageList.vue';
import NotificationStack from '../../src/components/UI/NotificationStack.vue';
import { emojiDirective } from '../../src/directives/emoji';
import { authedUser } from '../../src/composables/useAuth';
import { getTopicList, setTopics } from '../../src/composables/useTopics';
import {
  initRoute,
  navigateToGroup
} from '../../src/composables/navigation/useUrlRouting';
import { initializeChat, waitForChatSDK } from '../../src/services/useChat';
import { saveMessagesToLocal } from '../../src/services/useMessages';
import { setConfig } from '../../src/services/useConfig';
import { setAuthToken } from '../../src/composables/useLogin';
import type {
  ITopic,
  IMessage,
  IUser
} from '../../src/components/interfaces/interfaces';

const topicId = 'client-delete-fixture';
const topic = {
  id: topicId,
  type: 'GROUP',
  name: 'Клиент сайта',
  group: {
    id: 'client-delete-group',
    name: 'Клиент сайта',
    description: 'sep-chat:external-inquiry:v1'
  },
  info: { unreadCount: 0 },
  members: []
} as ITopic;
const oldMessage = {
  id: 'old-client-message',
  topicId,
  senderUserId: 'guest',
  senderUser: { id: 'guest', initials: 'Клиент сайта' },
  text: 'Старая переписка клиента',
  createdAt: '2026-10-13T08:30:00.000Z',
  media: [],
  reactions: [],
  isReadByMe: true,
  isSystem: false
} as IMessage;

// Настоящие Header, SDK и список сообщений без рабочих серверов и чужих сессий.
localStorage.clear();
document.documentElement.classList.add('theme-light');
authedUser.value = { id: 'delete-test-user', initials: 'Тест' } as IUser;
setAuthToken('synthetic-delete-test');
const apiUrl = `${location.origin}/fixture-api`;
setConfig({ CHAT_API_DOMAIN: apiUrl, CHAT_AUTH_API: apiUrl });
void initializeChat({
  token: 'synthetic-delete-test',
  userId: 'delete-test-user',
  apiUrl,
  wsUrl: location.origin,
  // SDK готов для HTTP, но фоновая синхронизация и рабочий Socket.IO не запускаются.
  cacheReady: new Promise<void>(() => {})
});
await waitForChatSDK();
setTopics([topic]);
saveMessagesToLocal(topicId, [oldMessage], {
  skipPersist: true,
  syncLastMessage: false
});
history.replaceState({}, '', `/group/${topicId}`);
initRoute();

createApp({
  setup(): () => VNode {
    return () =>
      h('main', { class: 'chat-container' }, [
        h(Header, { class: 'chat__header', dataTestid: 'Fixture' }),
        h(
          'ul',
          { 'data-testid': 'Fixture-Topics' },
          getTopicList().map(item => h('li', { key: item.id }, item.name))
        ),
        h('section', { class: 'chat chat__messages chat--mobile-route' }, [
          h(MessageList, { dataTestid: 'Fixture' })
        ]),
        h(NotificationStack)
      ]);
  }
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
await nextTick();

window.addEventListener('fixture-restore-client', (): void => {
  setTopics([topic]);
  navigateToGroup(topicId);
});
