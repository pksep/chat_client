import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import ChatContainer from '../../src/components/ChatContainer.vue';
import { authedUser } from '../../src/composables/useAuth';
import { setTopics } from '../../src/composables/useTopics';
import { useMobileApp } from '../../src/composables/useMobileApp';
import {
  navigateToDialogs,
  navigateToDialogsList
} from '../../src/composables/navigation';
import { setConfig } from '../../src/services/useConfig';
import { initializeChat } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import { emojiDirective } from '../../src/directives/emoji';
import '../../src/assets/chat-container.css';
import type { ITopic, IUser } from '../../src/components/interfaces/interfaces';

export async function mountRuStoreUpdateFixture() {
  const user = { id: 'rustore-user', name: 'Тест', initials: 'Т' } as IUser;
  const config = {
    CHAT_API_DOMAIN: `${location.origin}/rustore-test-api`,
    CHAT_WS_DOMAIN: 'ws://127.0.0.1:65530'
  };
  authedUser.value = user;
  setConfig(config);
  ChatSDK.prototype.connect = () => new Promise<void>(() => {});
  await initializeChat({
    userId: user.id,
    token: 'rustore-test',
    apiUrl: config.CHAT_API_DOMAIN,
    wsUrl: config.CHAT_WS_DOMAIN
  });
  setTopics([
    {
      id: 'rustore-topic',
      type: 'DM',
      name: 'Проверка обновления',
      user: { id: 'rustore-peer', name: 'Собеседник' },
      info: {},
      unreadMessageCount: 0
    } as ITopic
  ]);
  navigateToDialogsList();
  let updates!: ReturnType<typeof useMobileApp>;
  const app = createApp({
    setup() {
      updates = useMobileApp();
      return () => h(ChatContainer, { dataTestid: 'RuStore', config });
    }
  });
  app.use(createPinia());
  app.directive('emoji', emojiDirective);
  app.mount('#app');
  await nextTick();
  return {
    updates,
    openTopic: () => navigateToDialogs('rustore-topic'),
    back: navigateToDialogsList
  };
}
