import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import '../../src/assets/chat-container.css';
import type {
  IMessage,
  ITopic,
  IUser
} from '../../src/components/interfaces/interfaces';

const params = new URLSearchParams(location.search);
const isAi = params.get('kind') === 'ai';
const hasPinnedMessage = !params.has('no-pinned');
const topicId = 'mobile-search-fixture';
document.documentElement.classList.add(
  `theme-${params.get('theme') || 'light'}`
);

// Страница использует отдельное хранилище и не меняет данные открытого приложения.
const storage = new Map<string, string>();
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear()
  }
});
storage.set(
  'sep:chat:ai-assistant:v1',
  JSON.stringify({
    sessions: [
      {
        id: topicId,
        title: 'Проверка поиска',
        description: '',
        time: '10:00',
        messages: []
      }
    ],
    tasks: [],
    permissionMode: 'ask',
    responseMode: 'quick'
  })
);

const [
  { default: Header },
  { default: MessageList },
  { default: AIAssistant },
  { default: PinnedMessageBanner },
  { authedUser },
  { setTopics },
  { saveMessagesToLocal },
  { initRoute },
  { emojiDirective },
  { useAiAssistant },
  { open: callOpen, user: callUser },
  { default: ChatsToolbar }
] = await Promise.all([
  import('../../src/components/Header/Header.vue'),
  import('../../src/components/MessageList.vue'),
  import('../../src/components/AI/AIAssistant.vue'),
  import('../../src/components/Messages/PinnedMessageBanner.vue'),
  import('../../src/composables/useAuth'),
  import('../../src/composables/useTopics'),
  import('../../src/services/useMessages'),
  import('../../src/composables/navigation/useUrlRouting'),
  import('../../src/directives/emoji'),
  import('../../src/composables/useAiAssistant'),
  import('../../src/services/useCallState'),
  import('../../src/components/Menu/ChatsToolbar.vue')
]);
authedUser.value = { id: 'mobile-search-user', initials: 'Тест' } as IUser;
setTopics([
  {
    id: topicId,
    type: 'GROUP',
    name: 'Проверка поиска',
    group: { id: topicId, name: 'Проверка поиска' },
    info: { unreadCount: 0 }
  } as ITopic
]);
saveMessagesToLocal(
  topicId,
  Array.from({ length: 40 }, (_, index) => ({
    id: `message-${index}`,
    topicId,
    senderUserId: 'mobile-search-user',
    senderUser: { id: 'mobile-search-user', initials: 'Тест' },
    text: `Сообщение ${index + 1}: проверка поиска и сохранения прокрутки`,
    createdAt: new Date(2026, 9, 5, 10, index).toISOString(),
    media: [],
    isReadByMe: true
  })) as IMessage[],
  { skipPersist: true, syncLastMessage: false }
);
history.replaceState({}, '', `/${isAi ? 'ai' : 'group'}/${topicId}`);
initRoute();
if (params.has('call')) {
  callUser.value = {
    id: 'fixture-call-peer',
    initials: 'Проверка звонка'
  } as IUser;
  callOpen.value = true;
}
useAiAssistant().sessions.value[0].messages = Array.from(
  { length: 40 },
  (_, index) => ({
    id: `ai-message-${index}`,
    role: index % 2 ? 'assistant' : 'user',
    text: `Сообщение ${index + 1}: проверка поиска и сохранения прокрутки`,
    time: '10:00',
    timestamp: new Date(2026, 9, 5, 10, index).getTime(),
    pinned: hasPinnedMessage && index === 0
  })
);

createApp({
  setup() {
    return () =>
      h('main', { class: 'chat-container' }, [
        h(Header, { class: 'chat__header', dataTestid: 'Fixture' }),
        h('aside', { hidden: true }, [
          h(ChatsToolbar, {
            dataTestid: 'Fixture-Chats',
            modelValue: '',
            showCreate: false
          })
        ]),
        h(
          'section',
          {
            class: `chat chat__messages ${isAi ? 'chat--ai-route' : 'chat--mobile-route'}`
          },
          isAi
            ? [h(AIAssistant)]
            : [
                h(
                  'div',
                  {
                    class:
                      'chat__mobile-route-view chat__mobile-route-view--messages'
                  },
                  [
                    hasPinnedMessage
                      ? h(PinnedMessageBanner, {
                          previewText: 'Проверка закреплённого сообщения'
                        })
                      : null,
                    h(MessageList, { dataTestid: 'Fixture' })
                  ]
                )
              ]
        )
      ]);
  }
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
await nextTick();
