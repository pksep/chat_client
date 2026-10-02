import { createApp, h, ref } from 'vue';
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import '../../src/assets/menu-layout.css';
import '../../src/assets/chat-folders.css';
import ChatFolderRail from '../../src/components/Menu/ChatFolderRail.vue';
import ChatFoldersPanel from '../../src/components/Menu/ChatFoldersPanel.vue';
import ChatFolderIcon from '../../src/components/Menu/ChatFolderIcon.vue';
import { chatFolderIcons } from '../../src/services/useChatSDK/chat-folder';
import type { ChatFolder } from '../../src/services/useChatSDK/chat-folder';
import type { ITopic } from '../../src/components/interfaces/interfaces';

// Изолированная проверка настоящих компонентов без аккаунта и запросов к БД.
const mobile = matchMedia('(max-width: 768px)').matches;
const params = new URLSearchParams(location.search);
const showIcons = params.has('icons');
const showUnread = params.has('unread');
const scope = params.has('clients') ? 'clients' : 'chats';
const folders: ChatFolder[] = ['Работа', 'Клиенты', 'Личные'].map(
  (name, index) => ({
    id: `folder-${index}`,
    name,
    icon: index === 1 ? 'settings' : 'folder',
    scope,
    topicIds: showUnread
      ? [
          ['unread-0', 'unread-1'],
          ['unread-1'],
          ['unread-3', 'unread-4', 'unread-5']
        ][index]
      : [],
    position: index,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z'
  })
);

createApp({
  setup() {
    const loading = ref(!showUnread);
    const loaded = ref(showUnread);
    const authUserId = ref('folder-unread-user');
    const selectedFolderId = ref<string | null>(null);
    const isManaging = ref(false);
    const topics = ref<ITopic[]>(
      showUnread
        ? ([3, 4, 2, 20, 10, 0].map((unreadMessageCount, index) => ({
            id: `unread-${index}`,
            type: 'GROUP',
            name: `Топик ${index}`,
            unreadMessageCount,
            info: { isMarkedUnread: index === 5, isMute: index === 2 },
            lastMessage: {
              senderUserId: index === 3 ? authUserId.value : 'other-user',
              isSystem: index === 4
            }
          })) as ITopic[])
        : []
    );
    return () =>
      h('div', [
        h(
          'nav',
          { style: 'display:flex;flex-wrap:wrap;gap:12px;padding:12px' },
          [
            h(
              'button',
              {
                'data-testid': 'Fixture-Ready',
                onClick: () => {
                  loaded.value = true;
                  loading.value = false;
                }
              },
              'Показать папки'
            ),
            h(
              'button',
              {
                'data-testid': 'Fixture-Refresh',
                onClick: () => {
                  loading.value = true;
                }
              },
              'Фоновое обновление'
            ),
            h(
              'button',
              {
                'data-testid': 'Fixture-Theme',
                onClick: () => {
                  const root = document.documentElement;
                  root.dataset.theme =
                    root.dataset.theme === 'dark' ? 'light' : 'dark';
                }
              },
              'Сменить тему'
            ),
            ...(showUnread
              ? [
                  h(
                    'button',
                    {
                      'data-testid': 'Fixture-Incoming',
                      onClick: () => {
                        topics.value[0].unreadMessageCount!++;
                      }
                    },
                    'Новое сообщение'
                  ),
                  h(
                    'button',
                    {
                      'data-testid': 'Fixture-ManyUnread',
                      onClick: () => {
                        topics.value[0].unreadMessageCount = 100;
                      }
                    },
                    'Много сообщений'
                  ),
                  h(
                    'button',
                    {
                      'data-testid': 'Fixture-ReadFirst',
                      onClick: () => {
                        topics.value[0].unreadMessageCount = 0;
                      }
                    },
                    'Прочитать первый чат'
                  ),
                  h(
                    'button',
                    {
                      'data-testid': 'Fixture-ReadAll',
                      onClick: () => {
                        topics.value.forEach(topic => {
                          topic.unreadMessageCount = 0;
                        });
                      }
                    },
                    'Прочитать всё'
                  ),
                  h(
                    'button',
                    {
                      'data-testid': 'Fixture-NoFolders',
                      onClick: () => {
                        loaded.value = false;
                        selectedFolderId.value = null;
                        isManaging.value = false;
                      }
                    },
                    'Убрать папки'
                  ),
                  h(
                    'button',
                    {
                      'data-testid': 'Fixture-Auth',
                      onClick: () => {
                        authUserId.value = authUserId.value
                          ? ''
                          : 'folder-unread-user';
                      }
                    },
                    'Сменить авторизацию'
                  )
                ]
              : [])
          ]
        ),
        showIcons
          ? h(
              'section',
              {
                class: 'chat-folder-rail',
                style:
                  'position:relative;inset:auto;width:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:10px;padding:15px;max-width:700px;overflow:visible;background:var(--surface-overlay)',
                'data-testid': 'Fixture-Icons'
              },
              chatFolderIcons.map(name =>
                h(
                  'div',
                  {
                    style:
                      'display:grid;gap:8px;justify-items:center;color:var(--text-secondary)',
                    'data-testid': `Fixture-Icon-${name}`
                  },
                  [
                    h(ChatFolderIcon, {
                      name,
                      style: 'width:40px;height:40px'
                    }),
                    h('span', { class: 'chat-folder-rail__avatar' }, [
                      h(ChatFolderIcon, { name })
                    ]),
                    h('span', { class: 'chat-folder-rail__item--active' }, [
                      h('span', { class: 'chat-folder-rail__avatar' }, [
                        h(ChatFolderIcon, { name })
                      ])
                    ]),
                    h('small', name)
                  ]
                )
              )
            )
          : h(
              'main',
              {
                class: mobile ? 'mobile-list-container' : 'menu',
                style: mobile
                  ? 'position:relative;height:600px;display:flex;flex-direction:column;background:var(--surface-input-primary)'
                  : 'position:relative;box-sizing:border-box;width:345px;height:600px;padding-left:100px;background:var(--surface-input-primary)'
              },
              [
                h(ChatFolderRail, {
                  mobile,
                  loading: loading.value,
                  folders: loaded.value ? folders : [],
                  topics: topics.value,
                  authUserId: authUserId.value,
                  scope,
                  selectedFolderId: showUnread
                    ? selectedFolderId.value
                    : loaded.value
                      ? 'folder-0'
                      : null,
                  isManaging: showUnread ? isManaging.value : !loaded.value,
                  isActive: true,
                  onSelect: (folderId: string | null) => {
                    selectedFolderId.value = folderId;
                    isManaging.value = false;
                  },
                  onManage: () => {
                    isManaging.value = true;
                  }
                }),
                h(ChatFoldersPanel, {
                  mobile,
                  loading: loading.value,
                  folders: loaded.value ? folders : [],
                  topics: [],
                  selectedFolderId: null,
                  style: mobile ? 'flex:1;min-height:0' : ''
                })
              ]
            )
      ]);
  }
})
  .use(createPinia())
  .mount('#app');
