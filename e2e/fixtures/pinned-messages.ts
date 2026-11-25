import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { useThemeStore } from '../../src/stores/theme';
import Chat from '../../src/components/Chat.vue';
import Header from '../../src/components/Header/Header.vue';
import { authedUser } from '../../src/composables/useAuth';
import { setTopics } from '../../src/composables/useTopics';
import { navigateToDialogs } from '../../src/composables/navigation';
import { setConfig } from '../../src/services/useConfig';
import { initializeChat, getChatSDK } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import {
  saveMessagesToLocal,
  savePinnedMessagesToLocal,
  addMessageToLocal,
  editMessageFromLocal,
  deleteMessageFromLocal
} from '../../src/services/useMessages';
import { pinComments } from '../../src/services/usePinComments';
import {
  openPinnedMessagesView,
  closePinnedMessagesView
} from '../../src/services/pinned-messages-view';
import { emojiDirective } from '../../src/directives/emoji';
import { makePinFixtureRows } from './pinned-messages-api';
import DesktopTitleBar from '../../src/components/Desktop/DesktopTitleBar.vue';
import { isTauri } from '@tauri-apps/api/core';
import '../../src/assets/desktop-shell.css';
import type {
  IMessage,
  ITopic,
  IUser
} from '../../src/components/interfaces/interfaces';
import '@pksep/yui/styles';
import '../../src/assets/globals.css';
import '../../src/assets/chat-container.css';
import '../../src/assets/chat.css';
import '../../src/assets/message-bubble.css';
import '../../src/assets/header.css';
import '../../src/assets/pinned-messages.css';

const ownerId = '01f0a010-7ff7-4e7b-b97b-cfe5c7ab0101';
const peerId = '01f0a010-7ff7-4e7b-b97b-cfe5c7ab0102';
const topicId = '01f0a010-7ff7-4e7b-b97b-cfe5c7ab0103';
const id = (index: number) =>
  `01f0a010-7ff7-4e7b-b97b-${String(index).padStart(12, '0')}`;
const user = {
  id: ownerId,
  initials: 'Иванов И.И.',
  name: 'Иван',
  surname: 'Иванов'
} as IUser;
const peer = {
  id: peerId,
  initials: 'Петров П.П.',
  name: 'Пётр',
  surname: 'Петров'
} as IUser;
const rows = makePinFixtureRows();
const base = location.origin + '/pin-fixture-api';
authedUser.value = user;
setConfig({ CHAT_API_DOMAIN: base });
ChatSDK.prototype.connect = () => new Promise<void>(() => {});
await initializeChat({
  userId: ownerId,
  token: 'synthetic-pin-fixture',
  apiUrl: base,
  wsUrl: 'ws://127.0.0.1:65530'
});
const sdk = getChatSDK();
const defaultPins = rows.filter(row => row.isPin);
// Настоящий SDK/Reqi обращается только к локальному синтетическому серверу/route.
(window as any).pinFixtureSeed = { rows, ownerId, peerId, topicId, id };
setTopics([
  {
    id: topicId,
    type: 'DM',
    name: 'Иванов И.И.',
    user: peer,
    info: { unreadCount: 0 }
  } as ITopic
]);
saveMessagesToLocal(topicId, rows, {
  syncLastMessage: false,
  skipPersist: true
});
savePinnedMessagesToLocal(topicId, defaultPins, { skipCache: true });
navigateToDialogs(topicId);
document.body.style.margin = '0';
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'pin-fixture',
        style: 'height:100dvh;display:flex;flex-direction:column'
      },
      [
        ...(isTauri() ? [h(DesktopTitleBar)] : []),
        h(Header, { user, dataTestid: 'PinFixture' }),
        h(Chat, {
          user,
          dataTestid: 'PinFixture',
          style: 'width:100%;flex:1;min-height:0;height:auto'
        })
      ]
    )
});
app.use(createPinia());
const themeStore = useThemeStore();
themeStore.initTheme();
app.directive('emoji', emojiDirective);
app.mount('#app');
await nextTick();
(window as any).pins = {
  topicId,
  ownerId,
  peerId,
  rows,
  sdk,
  store: pinComments,
  open: () => openPinnedMessagesView(topicId),
  close: closePinnedMessagesView,
  append: (message: IMessage) => addMessageToLocal(topicId, message),
  edit: (message: IMessage) => editMessageFromLocal(topicId, message),
  remove: (messageId: string) => deleteMessageFromLocal(topicId, messageId),
  seed: (messages: IMessage[]) =>
    savePinnedMessagesToLocal(topicId, messages, { skipCache: true }),
  setUser: (next: IUser) => {
    authedUser.value = next;
  },
  setTheme: (theme: 'light' | 'dark') => themeStore.setTheme(theme === 'dark'),
  refresh: () => pinComments.refresh(topicId),
  ready: true
};
