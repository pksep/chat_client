import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import MessageList from '../../src/components/MessageList.vue';
import Chat from '../../src/components/Chat.vue';
import TopicList from '../../src/components/ContactList/TopicList.vue';
import { authedUser } from '../../src/composables/useAuth';
import { useSelectedMessages } from '../../src/composables/useSelectedMessages';
import {
  setTopics,
  topics as topicState,
  getSelectedTopic,
  updateLocalLastMessageTopic,
  hydrateTopicsFromCache
} from '../../src/composables/useTopics';
import {
  navigateToDialogs,
  navigateToDialogsList
} from '../../src/composables/navigation';
import { setConfig } from '../../src/services/useConfig';
import {
  initializeChat,
  getChatSDK,
  deleteMessageChat
} from '../../src/services/useChat';
import * as telemetry from '../../src/services/useTelemetry';
import { ChatSDK } from '../../src/services/useChatSDK';
import { navigateToNotificationTarget } from '../../src/services/useNotificationNavigation';
import * as messages from '../../src/services/useMessages';
import * as shadow from '../../src/services/useShadowChatSync';
import { importChatBackgroundSnapshot } from '../../src/services/useChatBackgroundSync';
import { emojiDirective } from '../../src/directives/emoji';
import { setTopicMessageVisibilityChecker } from '../../src/services/useTopicViewportState';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import '@pksep/yui/styles';
import type {
  IMessage,
  ITopic,
  IUser
} from '../../src/components/interfaces/interfaces';

export async function initializeTopicPerformanceFixture(
  topicCount = 4,
  shell = false,
  unreadCount = 0
) {
  const user = {
    id: 'performance-user',
    name: 'Тест',
    surname: 'Скорости'
  } as IUser;
  authedUser.value = user;
  setConfig({ CHAT_API_DOMAIN: `${location.origin}/performance-api` });
  // HTTP проходит через настоящий SDK; WebSocket изолирован от рабочих серверов.
  ChatSDK.prototype.connect = () => new Promise<void>(() => {});
  await initializeChat({
    userId: user.id,
    token: 'performance-test',
    apiUrl: `${location.origin}/performance-api`,
    wsUrl: 'ws://127.0.0.1:65530'
  });
  const topics = Array.from({ length: topicCount }, (_, index) => ({
    id: `performance-${index}`,
    type: 'DM',
    name: `Топик ${index}`,
    user: { ...user, id: `peer-${index}`, name: `Собеседник ${index}` },
    info: { unreadCount },
    unreadMessageCount: unreadCount
  })) as ITopic[];
  setTopics(topics);
  const metrics = {
    skeletonFrames: 0,
    frames: 0,
    maxMessageNodes: 0,
    longTasks: [] as number[],
    skeletonSamples: [] as { at: number; messages: number }[]
  };
  const sample = () => {
    metrics.frames++;
    if (document.querySelector('[data-testid$="-MessageList-Skeleton"]')) {
      metrics.skeletonFrames++;
      metrics.skeletonSamples.push({
        at: performance.now(),
        messages: document.querySelectorAll('[data-message-id]').length
      });
    }
    metrics.maxMessageNodes = Math.max(
      metrics.maxMessageNodes,
      document.querySelectorAll('[data-message-id]').length
    );
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  new PerformanceObserver(list => {
    metrics.longTasks.push(...list.getEntries().map(entry => entry.duration));
  }).observe({ type: 'longtask', buffered: false });
  const app = createApp({
    render: () =>
      h(
        'div',
        {
          class: shell ? '' : 'chat',
          style: 'height:100dvh;display:flex;flex-direction:column'
        },
        [
          h(
            'nav',
            { style: 'position:relative;z-index:100;flex-shrink:0' },
            topics.map(topic =>
              h(
                'button',
                {
                  'data-testid': `open-${topic.id}`,
                  onClick: () => navigateToDialogs(topic.id)
                },
                topic.name
              )
            )
          ),
          h(shell ? Chat : MessageList, {
            dataTestid: 'Performance',
            user,
            contacts: topics,
            ...(shell
              ? { style: 'position:relative;flex:1;min-height:0;width:100%' }
              : {})
          })
        ]
      )
  });
  app.use(createPinia());
  app.directive('emoji', emojiDirective);
  app.mount('#app');
  await nextTick();
  return {
    topics,
    messages,
    telemetry,
    deleteMessageChat,
    shadow,
    importChatBackgroundSnapshot,
    selection: useSelectedMessages(),
    getSelectedTopic,
    setTopics,
    updateLocalLastMessageTopic,
    hydrateTopicsFromCache,
    sdk: getChatSDK(),
    initializeChat,
    metrics,
    navigate: navigateToDialogs,
    back: navigateToDialogsList,
    notify: (index: number, messageId?: string) =>
      navigateToNotificationTarget({
        topicId: topics[index].id,
        topicType: 'DM',
        messageId
      }),
    resetMetrics() {
      metrics.skeletonFrames = 0;
      metrics.frames = 0;
      metrics.maxMessageNodes = 0;
      metrics.longTasks = [];
      metrics.skeletonSamples = [];
    },
    mountTopicList() {
      const root = document.createElement('div');
      root.style.cssText =
        'position:fixed;inset:0;z-index:1000;background:white';
      document.body.append(root);
      const listApp = createApp({
        render: () =>
          h(TopicList, { topics: topicState.value, dataTestid: 'Status' })
      });
      listApp.directive('emoji', emojiDirective);
      listApp.mount(root);
    },
    seed(topicId: string, rows: IMessage[]) {
      messages.saveMessagesToLocal(topicId, rows, {
        syncLastMessage: false,
        skipPersist: true
      });
    },
    appendOwnMessage(topicId: string) {
      const message = {
        id: `${topicId}-local-${Date.now()}`,
        topicId,
        text: 'Локальное сообщение для проверки реакции',
        type: 'TEXT',
        senderUserId: user.id,
        senderUser: user,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'DELIVERED',
        media: [],
        reactions: [],
        messageRead: [],
        isReadByMe: true
      } as IMessage;
      messages.addMessageToLocal(topicId, message);
      return message;
    },
    emitChatEvent(event: { type: string; payload: unknown }) {
      (getChatSDK() as any)?.ws.handleWebSocketEvent(event);
    },
    setMessageVisibility(topicId: string, visible: boolean) {
      setTopicMessageVisibilityChecker(topicId, () => visible);
    }
  };
}
