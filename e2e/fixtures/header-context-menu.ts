import { createApp, defineAsyncComponent, h, ref } from 'vue';
import { desktopCallPreparationRequested } from '../../src/services/desktop-call-presentation';
import { open as callOpen } from '../../src/services/useCallState';
const DesktopCallWindow = defineAsyncComponent(
  () => import('../../src/components/Desktop/DesktopCallWindow.vue')
);
import { createPinia } from 'pinia';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import Header from '../../src/components/Header/Header.vue';
import TopicList from '../../src/components/ContactList/TopicList.vue';
import { authedUser } from '../../src/composables/useAuth';
import { useChatFolders } from '../../src/composables/useChatFolders';
import { useNotifications } from '../../src/composables/useNotifications';
import { setConfig } from '../../src/services/useConfig';
import { getChatSDK, initializeChat } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import { installFolderFixtureSocket } from './folder-fixture-socket';
import { setTopics, topics } from '../../src/composables/useTopics';
import { emojiDirective } from '../../src/directives/emoji';
import type { ITopic, IUser } from '../../src/components/interfaces/interfaces';
import { mountMessageSender } from './message-send-harness';

const params = new URLSearchParams(location.search);
const kind = params.get('kind') || 'group';
const scope = kind === 'clients' ? 'clients' : 'chats';
const user = { id: 'header-menu-user', name: 'Тест' } as IUser;
authedUser.value = user;
setConfig({ CHAT_API_DOMAIN: `${location.origin}/folder-menu-api` });
ChatSDK.prototype.connect = () => new Promise<void>(() => {});
await initializeChat({
  userId: user.id,
  token: 'header-menu-fixture',
  apiUrl: `${location.origin}/folder-menu-api`,
  wsUrl: 'ws://127.0.0.1:65530'
});
installFolderFixtureSocket(getChatSDK()!);

const topic = {
  id: 'header-topic',
  type: kind === 'dm' ? 'DM' : 'GROUP',
  name: 'Офис',
  user:
    kind === 'dm'
      ? { id: 'other-user', name: 'Анна', initials: 'А' }
      : undefined,
  group: {
    id: 'header-group',
    title: 'Офис',
    description: kind === 'clients' ? 'sep-chat:external-inquiry:v1' : ''
  },
  isFavorite: kind === 'favorites',
  members: [
    { id: 'other-user', initials: 'Иванов И.И.' },
    { id: 'second-user', initials: 'Петров П.П.' }
  ],
  info: { isPin: false, isMute: false, unreadCount: 2 },
  unreadMessageCount: 2
} as ITopic;
setTopics([topic]);
const { folders, loadFolders } = useChatFolders(scope);
await loadFolders();
const { state: notifications } = useNotifications();

if (params.has('activity')) {
  const sdk = getChatSDK() as any;
  sdk.isConnected = () => true;
  const activity = {
    events: [] as { type: string; payload: any }[],
    uploads: [] as { resolve: () => void; reject: () => void }[],
    receive: (type: string, payload: any) =>
      sdk.ws.handleWebSocketEvent({ type, payload }),
    loseConnection: () => {
      sdk.isConnected = () => false;
      sdk.emitConnectionState(false);
    },
    changeUser: () => {
      authedUser.value = { ...authedUser.value, id: 'new-user' };
    },
    sender: mountMessageSender('header-topic'),
    done: Promise.resolve()
  };
  sdk.uploadFile = async () => {
    await new Promise<void>((resolve, reject) =>
      activity.uploads.push({
        resolve,
        reject: () => reject(new Error('Ошибка тестовой загрузки'))
      })
    );
    return { objectName: 'uploaded-file', thumbnailObjectName: null };
  };
  sdk.ws.setSocket({
    connected: true,
    emit(type: string, raw: string, ack?: (value: unknown) => void) {
      activity.events.push({ type, payload: JSON.parse(raw) });
      ack?.({ success: true, data: [] });
    }
  });
  sdk.emitConnectionState(true);
  (window as any).activity = activity;
}

createApp({
  setup() {
    const displayRoute = ref({
      type: ['ai', 'call', 'favorites'].includes(kind)
        ? kind
        : kind === 'dm'
          ? 'dialogs'
          : 'group',
      id: kind === 'ai' ? null : topic.id
    });
    return () =>
      h(
        'main',
        { style: 'height:100dvh;background:var(--surface-input-primary)' },
        [
          h(Header, {
            dataTestid: 'Fixture',
            displayRoute: displayRoute.value
          }),
          params.has('native-call-test') &&
          (desktopCallPreparationRequested.value || callOpen.value)
            ? h(DesktopCallWindow)
            : null,
          h('div', { style: 'padding:24px 8px' }, [
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
                'data-testid': 'Fixture-SwitchTopic',
                onClick: () => {
                  const next = {
                    ...topic,
                    id: 'second-topic',
                    name: 'Второй топик',
                    group: { ...topic.group, title: 'Второй топик' }
                  };
                  setTopics([...topics.value, next]);
                  displayRoute.value = { type: 'group', id: next.id };
                }
              },
              'Открыть другой топик'
            ),
            h(TopicList, {
              topics: topics.value,
              folderScope: scope,
              dataTestid: 'Fixture-Topics',
              style: 'width:min(345px,100%);margin:0;padding:10px 0'
            }),
            h(
              'section',
              { 'data-testid': 'Fixture-FolderState' },
              folders.value.map(folder =>
                h(
                  'p',
                  { 'data-testid': `Fixture-State-${folder.id}` },
                  `${folder.name}: ${folder.topicIds.join(',')}`
                )
              )
            ),
            h(
              'output',
              { 'data-testid': 'Fixture-PinState' },
              String(topics.value[0].info.isPin)
            ),
            h(
              'output',
              { 'data-testid': 'Fixture-MuteState' },
              String(topics.value[0].info.isMute)
            ),
            ...notifications.items.map(item =>
              h('p', { role: 'alert' }, `${item.title}: ${item.description}`)
            )
          ])
        ]
      );
  }
})
  .use(createPinia())
  .directive('emoji', emojiDirective)
  .mount('#app');
