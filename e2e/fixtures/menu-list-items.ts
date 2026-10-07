import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import '../../src/assets/chat-container.css';
import type { ITopic, IUser } from '../../src/components/interfaces/interfaces';
import type { ChatFolder } from '../../src/services/useChatSDK/chat-folder';

// Изолируем сохранение ИИ в этой странице от данных открытого приложения.
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
    sessions: ['chat', 'task'].flatMap(kind =>
      [0, 1, 2].map(index => ({
        id: `row-${kind}-${index}`,
        kind,
        title: `Строка ${index + 1}`,
        description: 'Проверка оформления списка',
        time: '10:00',
        messages: []
      }))
    ),
    tasks: [],
    permissionMode: 'ask',
    responseMode: 'quick'
  })
);

const [
  { default: TopicList },
  { default: CallsPage },
  { default: AIMenuPanel },
  { default: ChatFoldersPanel },
  { default: ChatsToolbar },
  { default: MenuSearch },
  { authedUser },
  { setTopics },
  { hydrateCallHistoryCache, useCallHistoryStore },
  { useAiAssistant },
  { navigateToCall, navigateToDefault },
  { emojiDirective }
] = await Promise.all([
  import('../../src/components/ContactList/TopicList.vue'),
  import('../../src/components/Calls/CallsPage.vue'),
  import('../../src/components/AI/AIMenuPanel.vue'),
  import('../../src/components/Menu/ChatFoldersPanel.vue'),
  import('../../src/components/Menu/ChatsToolbar.vue'),
  import('../../src/components/UI/MenuSearch.vue'),
  import('../../src/composables/useAuth'),
  import('../../src/composables/useTopics'),
  import('../../src/services/useCallHistory'),
  import('../../src/composables/useAiAssistant'),
  import('../../src/composables/navigation'),
  import('../../src/directives/emoji')
]);
authedUser.value = { id: 'menu-list-items-fixture' } as IUser;
const topics = [0, 1, 2].map(index => ({
  id: `row-topic-${index}`,
  type: 'GROUP',
  name: `Строка ${index + 1}`,
  group: { id: `row-topic-${index}`, name: `Строка ${index + 1}` },
  info: { unreadCount: 0 },
  unreadMessageCount: 0
})) as ITopic[];
setTopics(topics);
await hydrateCallHistoryCache();
useCallHistoryStore().rawCallHistory.value = topics.map((topic, index) => ({
  id: `row-call-${index}`,
  topicId: topic.id,
  callTopicId: `row-call-topic-${index}`,
  topicType: 'GROUP',
  topicName: topic.name!,
  senderUserId: 'other-user',
  text: '',
  createdAt: `2026-10-05T10:0${2 - index}:00Z`,
  ex: {
    type: 'call',
    call: { event: 'end', durationSec: 60, wasAnswered: true }
  }
}));
const folders: ChatFolder[] = topics.map((topic, index) => ({
  id: `row-folder-${index}`,
  name: topic.name!,
  icon: 'folder',
  scope: 'chats',
  position: index,
  topicIds: [topic.id],
  createdAt: '',
  updatedAt: ''
}));
const params = new URLSearchParams(location.search);
const mobile = matchMedia('(max-width: 768px)').matches;
document.documentElement.dataset.theme = params.get('theme') || 'light';
const ai = useAiAssistant();

createApp({
  setup() {
    const section = ref(params.get('section') || 'chats');
    const selected = ref(false);
    const clear = () => {
      selected.value = false;
      ai.activeSessionId.value = null;
      navigateToDefault();
    };
    const select = () => {
      selected.value = true;
      if (section.value === 'calls') navigateToCall('row-call-topic-1');
      if (section.value === 'ai' || section.value === 'tasks')
        ai.activeSessionId.value = `row-${section.value === 'tasks' ? 'task' : 'chat'}-1`;
    };
    const renderList = () => {
      if (section.value === 'calls') return h(CallsPage, { isActive: false });
      if (section.value === 'ai' || section.value === 'tasks')
        return h(AIMenuPanel);
      if (section.value === 'folders')
        return h(ChatFoldersPanel, {
          topics,
          folders,
          mobile,
          selectedFolderId: selected.value ? 'row-folder-1' : null
        });
      return h(
        'section',
        {
          class: section.value === 'clients' ? 'clients-panel' : '',
          style:
            section.value === 'folder-topics' && !mobile
              ? 'padding-inline:10px'
              : ''
        },
        [
          section.value === 'folder-topics'
            ? h(MenuSearch)
            : h(ChatsToolbar, {
                modelValue: '',
                title: section.value === 'clients' ? 'Клиенты' : 'Чаты',
                showCreate: false,
                class: mobile ? 'mobile-list-container__toolbar' : ''
              }),
          h(TopicList, {
            topics,
            class:
              section.value === 'folder-topics'
                ? 'chat-folder-editor__topics'
                : '',
            showCheckbox: section.value === 'folder-topics',
            folderScope: section.value === 'clients' ? 'clients' : 'chats',
            selectedTopicIds: new Set(selected.value ? ['row-topic-1'] : []),
            dataTestid: 'Fixture-Topics'
          })
        ]
      );
    };
    ai.activeTab.value = section.value === 'tasks' ? 'tasks' : 'chats';
    return () =>
      h('main', [
        h(
          'nav',
          { style: 'display:flex;flex-wrap:wrap;gap:12px;padding:12px' },
          [
            ...[
              'chats',
              'calls',
              'ai',
              'tasks',
              'clients',
              'folders',
              'folder-topics'
            ].map(name =>
              h(
                'button',
                {
                  'data-testid': `Fixture-Section-${name}`,
                  onClick: () => {
                    clear();
                    section.value = name;
                    ai.activeTab.value = name === 'tasks' ? 'tasks' : 'chats';
                  }
                },
                name
              )
            ),
            h(
              'button',
              { 'data-testid': 'Fixture-Select', onClick: select },
              'Выбрать вторую строку'
            ),
            h(
              'button',
              { 'data-testid': 'Fixture-Clear', onClick: clear },
              'Снять выбор'
            ),
            h(
              'button',
              {
                'data-testid': 'Fixture-Theme',
                onClick: () => {
                  document.documentElement.dataset.theme =
                    document.documentElement.dataset.theme === 'light'
                      ? 'dark'
                      : 'light';
                }
              },
              'Сменить тему'
            )
          ]
        ),
        h(
          'div',
          {
            class: mobile ? 'mobile-list-container' : 'menu',
            'data-testid': 'Fixture-Menu',
            style: `width:${mobile ? '100%' : '360px'};height:640px;box-sizing:border-box`
          },
          [
            mobile
              ? h(
                  'div',
                  {
                    class: `mobile-list-container__section mobile-list-container__section--${section.value}`
                  },
                  [renderList()]
                )
              : h('div', { class: 'menu__start' }, [renderList()])
          ]
        )
      ]);
  }
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
