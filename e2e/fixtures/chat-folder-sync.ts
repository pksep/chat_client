import { createApp, h } from 'vue';
import { io } from 'socket.io-client';
import { authedUser } from '../../src/composables/useAuth';
import {
  refreshChatFoldersFromSocket,
  useChatFolders
} from '../../src/composables/useChatFolders';
import { getChatSDK, initializeChat } from '../../src/services/useChat';
import { ChatSDK } from '../../src/services/useChatSDK';
import { ChatWS } from '../../src/services/useChatSDK/ws';
import { bindIncomingChatEvents } from '../../src/services/useChatSDK/incoming-events';
import type { IUser } from '../../src/components/interfaces/interfaces';

const params = new URLSearchParams(location.search);
const origin = params.get('server')!;
const userId = params.get('user')!;
authedUser.value = {
  id: userId,
  name: 'Тест',
  surname: 'Синхронизации'
} as IUser;
ChatSDK.prototype.connect = () => new Promise<void>(() => {});
await initializeChat({
  userId,
  token: 'fixture',
  apiUrl: origin,
  wsUrl: origin
});
const sdk = getChatSDK()!;
const socket = io(`${origin}/chat`, {
  auth: { userId },
  transports: ['websocket'],
  autoConnect: false
});
const ws = (sdk as unknown as { ws: ChatWS }).ws;
ws.setSocket(socket);
bindIncomingChatEvents(socket, event => ws.handleWebSocketEvent(event));
const chats = useChatFolders('chats');
const clients = useChatFolders('clients');
const snapshot = () => ({
  folders: [...chats.folders.value, ...clients.folders.value],
  selected: chats.activeFolderId.value,
  connected: socket.connected
});
socket.on('connect', () => {
  void refreshChatFoldersFromSocket();
});
socket.connect();

(window as any).folderHarness = {
  snapshot,
  create: (name: string, scope: 'chats' | 'clients' = 'chats') =>
    (scope === 'chats' ? chats : clients).createFolder(name, []),
  update: chats.updateFolder,
  remove: chats.deleteFolder,
  add: chats.addTopicToFolder,
  removeTopic: chats.removeTopicFromFolder,
  reorder: chats.reorderFolders,
  select: chats.selectFolder,
  load: () => chats.loadFolders(true),
  disconnect: () => socket.disconnect(),
  connect: () => socket.connect(),
  switchUser: () => {
    authedUser.value = { id: 'another-account' } as IUser;
  }
};
createApp({
  render: () =>
    h('pre', { 'data-testid': 'FolderSync-State' }, JSON.stringify(snapshot()))
}).mount('#app');
