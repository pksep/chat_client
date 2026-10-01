import { computed, reactive, readonly, ref, watch } from 'vue';
import { authedUser, getAuthUser } from './useAuth';
import { getChatSDK } from '../services/useChat';
import type {
  ChatFolder,
  ChatFolderIcon,
  ChatFolderScope,
  SaveChatFolderPayload
} from '../services/useChatSDK/chat-folder';

const folders = ref<ChatFolder[]>([]);
const selections = {
  chats: {
    activeFolderId: ref<string | null>(null),
    isManagingFolders: ref(false)
  },
  clients: {
    activeFolderId: ref<string | null>(null),
    isManagingFolders: ref(false)
  }
};
const isLoading = ref(false);
const state = reactive({ error: '' });
let loadedUserId = '';
let loadRevision = 0;

const sortFolders = (items: ChatFolder[]): ChatFolder[] =>
  [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const upsertFolder = (folder: ChatFolder): void => {
  const index = folders.value.findIndex(item => item.id === folder.id);

  if (index === -1) {
    folders.value = sortFolders([...folders.value, folder]);
    return;
  }

  folders.value.splice(index, 1, folder);
};

const loadFolders = async (force = false): Promise<void> => {
  const userId = getAuthUser()?.id || '';
  const sdk = getChatSDK();

  if (!userId || !sdk || isLoading.value) return;
  if (!force && loadedUserId === userId) return;

  isLoading.value = true;
  state.error = '';
  const revision = ++loadRevision;

  try {
    const loadedFolders = await sdk.getChatFolders();
    if (revision !== loadRevision || getAuthUser()?.id !== userId) return;
    folders.value = sortFolders(loadedFolders);
    loadedUserId = userId;
  } catch (error) {
    if (revision !== loadRevision) return;
    state.error =
      error instanceof Error ? error.message : 'Не удалось загрузить папки';
  } finally {
    if (revision === loadRevision) isLoading.value = false;
  }
};

const createFolder = async (
  name: string,
  topicIds: string[],
  icon: ChatFolderIcon = 'folder',
  scope: ChatFolderScope = 'chats'
): Promise<ChatFolder> => {
  const normalizedName = name.trim();
  const uniqueTopicIds = [...new Set(topicIds)];

  const sdk = getChatSDK();
  if (!sdk) throw new Error('Чат ещё не подключён');

  const folder = await sdk.createChatFolder({
    name: normalizedName,
    icon,
    scope,
    topicIds: uniqueTopicIds
  });
  upsertFolder(folder);
  return folder;
};

const updateFolder = async (
  folderId: string,
  payload: SaveChatFolderPayload
): Promise<ChatFolder> => {
  const normalizedPayload: SaveChatFolderPayload = {
    ...(payload.name === undefined ? {} : { name: payload.name.trim() }),
    ...(payload.icon === undefined ? {} : { icon: payload.icon }),
    ...(payload.topicIds === undefined
      ? {}
      : { topicIds: [...new Set(payload.topicIds)] })
  };

  const sdk = getChatSDK();
  if (!sdk) throw new Error('Чат ещё не подключён');

  const folder = await sdk.updateChatFolder(folderId, normalizedPayload);
  upsertFolder(folder);
  return folder;
};

const deleteFolder = async (folderId: string): Promise<void> => {
  const sdk = getChatSDK();
  if (!sdk) throw new Error('Чат ещё не подключён');
  await sdk.deleteChatFolder(folderId);

  folders.value = folders.value.filter(folder => folder.id !== folderId);
  for (const selection of Object.values(selections)) {
    if (selection.activeFolderId.value === folderId)
      selection.activeFolderId.value = null;
  }
};

const selectFolder = (
  folderId: string | null,
  scope: ChatFolderScope
): void => {
  selections[scope].activeFolderId.value = folderId;
  closeFolderManager();
};

const openFolderManager = (scope: ChatFolderScope): void => {
  closeFolderManager();
  selections[scope].isManagingFolders.value = true;
};

const closeFolderManager = (): void => {
  for (const selection of Object.values(selections)) {
    selection.isManagingFolders.value = false;
  }
};

watch(
  () => authedUser.value?.id,
  () => {
    ++loadRevision;
    loadedUserId = '';
    folders.value = [];
    isLoading.value = false;
    state.error = '';
    closeFolderManager();
    for (const selection of Object.values(selections)) {
      selection.activeFolderId.value = null;
    }
  },
  { flush: 'sync' }
);

export const useChatFolders = (scope: ChatFolderScope = 'chats') => ({
  folders: computed(() =>
    folders.value.filter(folder => (folder.scope || 'chats') === scope)
  ),
  activeFolderId: readonly(selections[scope].activeFolderId),
  activeFolder: computed(
    () =>
      folders.value.find(
        folder =>
          folder.id === selections[scope].activeFolderId.value &&
          (folder.scope || 'chats') === scope
      ) || null
  ),
  isManagingFolders: readonly(selections[scope].isManagingFolders),
  isLoading: readonly(isLoading),
  state,
  loadFolders,
  createFolder: (
    name: string,
    topicIds: string[],
    icon: ChatFolderIcon = 'folder'
  ) => createFolder(name, topicIds, icon, scope),
  updateFolder,
  deleteFolder,
  selectFolder: (folderId: string | null) => selectFolder(folderId, scope),
  openFolderManager: () => openFolderManager(scope),
  closeFolderManager
});
