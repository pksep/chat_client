import { createApp, h, ref, type VNode } from 'vue';
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import '../../src/assets/chat-folders.css';
import TopicList from '../../src/components/ContactList/TopicList.vue';
import ChatFoldersPanel from '../../src/components/Menu/ChatFoldersPanel.vue';
import NotificationStack from '../../src/components/UI/NotificationStack.vue';
import { authedUser } from '../../src/composables/useAuth';
import { useChatFolders } from '../../src/composables/useChatFolders';
import { useNotifications } from '../../src/composables/useNotifications';
import { setConfig } from '../../src/services/useConfig';
import { getChatSDK, initializeChat } from '../../src/services/useChat';
import { installFolderFixtureSocket } from './folder-fixture-socket';
import { ChatSDK } from '../../src/services/useChatSDK';
import { WebSocketEventType } from '../../src/services/useChatSDK/websocketEvents';
import type { ChatFolderChange } from '../../src/services/useChatSDK/chat-folder';
import type { ChatWS } from '../../src/services/useChatSDK/ws';
import { setTopics } from '../../src/composables/useTopics';
import { emojiDirective } from '../../src/directives/emoji';
import type { ITopic, IUser } from '../../src/components/interfaces/interfaces';

// Настоящие компоненты и SDK; сервер и авторизация изолированы от локальной БД.
const scope = new URLSearchParams(location.search).has('clients')
  ? 'clients'
  : 'chats';
const showPanel = new URLSearchParams(location.search).has('panel');
const showMobileShell = new URLSearchParams(location.search).has(
  'mobile-shell'
);
const wrapTopicList = (list: VNode) =>
  showMobileShell
    ? h('div', { class: 'mobile-list-container' }, [
        h('div', { class: 'mobile-list-container__content' }, [
          h('div', { class: 'mobile-list-container__section-track' }, [
            h(
              'div',
              {
                class:
                  'mobile-list-container__section mobile-list-container__section--chats'
              },
              [list]
            )
          ])
        ])
      ])
    : list;
const user = {
  id: 'folder-menu-user',
  name: 'Тест',
  surname: 'Папок'
} as IUser;
authedUser.value = user;
setConfig({ CHAT_API_DOMAIN: `${location.origin}/folder-menu-api` });
ChatSDK.prototype.connect = () => new Promise<void>(() => {});
await initializeChat({
  userId: user.id,
  token: 'folder-menu-fixture',
  apiUrl: `${location.origin}/folder-menu-api`,
  wsUrl: 'ws://127.0.0.1:65530'
});
installFolderFixtureSocket(getChatSDK()!);
(window as any).folderFixtureEvent = (change: ChatFolderChange) =>
  (getChatSDK() as unknown as { ws: ChatWS }).ws.handleWebSocketEvent({
    type: WebSocketEventType.CHAT_FOLDER_CHANGED,
    payload: change
  });
const topics = ['Офис', 'Второй топик'].map((name, index) => ({
  id: `menu-topic-${index}`,
  type: 'GROUP',
  name,
  group: { id: `menu-group-${index}`, name },
  info: { isPin: false, isMute: false, unreadCount: 0 },
  unreadMessageCount: 0
})) as ITopic[];
setTopics(topics);
const folderState = useChatFolders(scope);
const { state: notifications } = useNotifications();
await folderState.loadFolders();

createApp({
  setup() {
    const panelVisible = ref(showPanel);
    const selection = ref(false);
    const concurrencyResult = ref('');
    const topicOpens = ref(0);
    const switchUser = () => {
      authedUser.value = { ...user, id: 'folder-menu-other-user' };
    };
    return () =>
      h(
        'main',
        { style: 'height:100dvh;background:var(--surface-input-primary)' },
        [
          h(
            'nav',
            { style: 'display:flex;gap:10px;padding:10px;flex-wrap:wrap' },
            [
              h(
                'button',
                {
                  'data-testid': 'Fixture-Theme',
                  onClick: () => {
                    document.documentElement.dataset.theme =
                      document.documentElement.dataset.theme === 'dark'
                        ? 'light'
                        : 'dark';
                  }
                },
                'Сменить тему'
              ),
              h(
                'button',
                {
                  'data-testid': 'Fixture-Selection',
                  onClick: () => {
                    selection.value = !selection.value;
                  }
                },
                'Выбор чатов'
              ),
              h(
                'button',
                {
                  'data-testid': 'Fixture-Refresh',
                  onClick: () => folderState.loadFolders(true)
                },
                'Перезагрузить папки'
              ),
              h(
                'button',
                { 'data-testid': 'Fixture-SwitchUser', onClick: switchUser },
                'Сменить пользователя'
              ),
              h(
                'button',
                {
                  'data-testid': 'Fixture-Concurrent',
                  onClick: async () => {
                    await Promise.all([
                      folderState.addTopicToFolder('folder-0', topics[0].id),
                      folderState.addTopicToFolder('folder-0', topics[1].id)
                    ]);
                    concurrencyResult.value = 'Готово';
                  }
                },
                'Добавить два топика'
              ),
              h(
                'button',
                {
                  'data-testid': 'Fixture-ConcurrentChanges',
                  onClick: async () => {
                    await Promise.all([
                      folderState.removeTopicFromFolder(
                        'folder-0',
                        'existing-topic'
                      ),
                      folderState.addTopicToFolder('folder-0', topics[0].id),
                      folderState.removeTopicFromFolder(
                        'folder-0',
                        'existing-topic'
                      )
                    ]);
                    concurrencyResult.value = 'Готово';
                  }
                },
                'Убрать и добавить топики'
              ),
              h(
                'button',
                {
                  'data-testid': 'Fixture-CrossScope',
                  onClick: async () => {
                    try {
                      await folderState.addTopicToFolder(
                        'client-folder',
                        topics[0].id
                      );
                    } catch (error) {
                      concurrencyResult.value = (error as Error).message;
                    }
                  }
                },
                'Папка другого раздела'
              )
            ]
          ),
          panelVisible.value
            ? h('div', { style: 'width:min(345px,100%);height:600px' }, [
                h(ChatFoldersPanel, {
                  topics,
                  folders: folderState.folders.value,
                  mobile: matchMedia('(max-width: 768px)').matches,
                  scope,
                  onClose: () => {
                    panelVisible.value = false;
                  }
                })
              ])
            : wrapTopicList(
                h(TopicList, {
                  topics,
                  folderScope: scope,
                  showCheckbox: selection.value,
                  onUnmountTopic: () => {
                    topicOpens.value++;
                  },
                  dataTestid: 'Fixture-Topics',
                  style: 'width:min(345px,100%);margin:0;padding:10px 0'
                })
              ),
          h(
            'output',
            { 'data-testid': 'Fixture-ConcurrentResult' },
            concurrencyResult.value
          ),
          h(
            'output',
            { 'data-testid': 'Fixture-TopicOpens' },
            String(topicOpens.value)
          ),
          h(
            'section',
            { 'data-testid': 'Fixture-FolderState', style: 'padding:10px' },
            folderState.folders.value.map(folder =>
              h(
                'div',
                { 'data-testid': `Fixture-State-${folder.id}` },
                `${folder.name}: ${folder.topicIds.join(',')}`
              )
            )
          ),
          showPanel
            ? h(NotificationStack, { dataTestid: 'Fixture-Notification' })
            : h(
                'section',
                notifications.items.map(item =>
                  h(
                    'p',
                    { role: 'alert' },
                    `${item.title}: ${item.description}`
                  )
                )
              )
        ]
      );
  }
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
