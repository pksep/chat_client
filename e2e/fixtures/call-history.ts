import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import CallsPage from '../../src/components/Calls/CallsPage.vue';
import { authedUser } from '../../src/composables/useAuth';
import { useTopics } from '../../src/composables/useTopics';
import { setConfig } from '../../src/services/useConfig';
import { initializeChat, getChatSDK } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import * as history from '../../src/services/useCallHistory';
import { emojiDirective } from '../../src/directives/emoji';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import '@pksep/yui/styles';
import type { IUser } from '../../src/components/interfaces/interfaces';

export async function initializeCallHistoryFixture() {
  authedUser.value = { id: 'call-history-user', name: 'Тест' } as IUser;
  setConfig({ CHAT_API_DOMAIN: `${location.origin}/call-history-api` });
  const joinedTopics: string[] = [];
  ChatSDK.prototype.connect = () => new Promise<void>(() => {});
  ChatSDK.prototype.joinTopic = async topicId => {
    joinedTopics.push(topicId);
  };
  await initializeChat({
    userId: authedUser.value.id,
    token: 'isolated-call-history-test',
    apiUrl: `${location.origin}/call-history-api`,
    wsUrl: 'ws://127.0.0.1:65530'
  });
  history.initializeCallHistorySync(getChatSDK());
  const app = createApp({
    render: () =>
      h(CallsPage, {
        dataTestid: 'History',
        isActive: true,
        style: 'height:100dvh'
      })
  });
  app.use(createPinia());
  app.directive('emoji', emojiDirective);
  app.mount('#app');
  return {
    ...history,
    getChatSDK,
    authedUser,
    joinedTopics,
    topics: useTopics()
  };
}
