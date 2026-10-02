import { computed, reactive, readonly, ref, watch } from 'vue';
import { authedUser, getAuthUser } from './useAuth';
import { getChatSDK } from '../services/useChat';
import { sortChatFolders } from '../utils/chat-folder-order';
import { showNotification } from './useNotifications';
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
    isManagingFolders: ref(false),
    isReordering: ref(false)
  },
  clients: {
    activeFolderId: ref<string | null>(null),
    isManagingFolders: ref(false),
    isReordering: ref(false)
  }
};
const isLoading = ref(false);
const state = reactive({ error: '' });
let loadedUserId = '';
let loadRevision = 0;
const topicUpdateQueue = new Map<string, Promise<ChatFolder>>();

const sortFolders = sortChatFolders;

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
    showNotification({
      title: 'Не удалось загрузить папки',
      description: error
    });
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

const setTopicInFolder = (
  folderId: string,
  topicId: string,
  scope: ChatFolderScope,
  included: boolean
): Promise<ChatFolder> => {
  const revision = loadRevision;
  const userId = getAuthUser()?.id;
  // Добавления и удаления используют свежий список, не затирая друг друга.
  const previous = topicUpdateQueue.get(folderId);
  const update = (previous || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      if (!userId || revision !== loadRevision || getAuthUser()?.id !== userId)
        throw new Error('Сессия пользователя изменилась');
      const folder = folders.value.find(item => item.id === folderId);
      if (!folder || (folder.scope || 'chats') !== scope)
        throw new Error('Папка больше недоступна');
      if (folder.topicIds.includes(topicId) === included) return folder;
      const sdk = getChatSDK();
      if (!sdk) throw new Error('Чат ещё не подключён');
      const savedFolder = await sdk.updateChatFolder(folderId, {
        topicIds: included
          ? [...new Set([...folder.topicIds, topicId])]
          : folder.topicIds.filter(id => id !== topicId)
      });
      if (revision !== loadRevision || getAuthUser()?.id !== userId)
        throw new Error('Сессия пользователя изменилась');
      upsertFolder(savedFolder);
      return savedFolder;
    });
  topicUpdateQueue.set(folderId, update);
  const clearUpdate = () => {
    if (topicUpdateQueue.get(folderId) === update)
      topicUpdateQueue.delete(folderId);
  };
  void update.then(clearUpdate, clearUpdate);
  return update;
};

const reorderFolders = async (
  scope: ChatFolderScope,
  folderIds: string[]
): Promise<void> => {
  const selection = selections[scope];
  if (selection.isReordering.value) return;
  const scopedFolders = folders.value.filter(
    folder => (folder.scope || 'chats') === scope
  );
  const positions = new Map(
    scopedFolders.map(folder => [folder.id, folder.position])
  );
  if (
    new Set(folderIds).size !== folderIds.length ||
    folderIds.length !== scopedFolders.length ||
    folderIds.some(id => !positions.has(id)) ||
    scopedFolders.every((folder, index) => folder.id === folderIds[index])
  )
    return;
  const sdk = getChatSDK();
  if (!sdk) return;
  const revision = loadRevision;
  const applyPositions = (nextPositions: Map<string, number | undefined>) => {
    folders.value = sortFolders(
      folders.value.map(folder =>
        nextPositions.has(folder.id)
          ? { ...folder, position: nextPositions.get(folder.id) }
          : folder
      )
    );
  };
  selection.isReordering.value = true;
  applyPositions(new Map(folderIds.map((id, position) => [id, position])));
  try {
    const savedFolders = await sdk.reorderChatFolders(scope, folderIds);
    if (revision !== loadRevision) return;
    applyPositions(
      new Map(savedFolders.map(folder => [folder.id, folder.position]))
    );
  } catch (error) {
    if (revision !== loadRevision) return;
    applyPositions(positions);
    showNotification({
      title: 'Не удалось изменить порядок папок',
      description: error
    });
  } finally {
    if (revision === loadRevision) selection.isReordering.value = false;
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
    topicUpdateQueue.clear();
    isLoading.value = false;
    state.error = '';
    closeFolderManager();
    for (const selection of Object.values(selections)) {
      selection.activeFolderId.value = null;
      selection.isReordering.value = false;
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
  isReordering: readonly(selections[scope].isReordering),
  isLoading: readonly(isLoading),
  state,
  loadFolders,
  createFolder: (
    name: string,
    topicIds: string[],
    icon: ChatFolderIcon = 'folder'
  ) => createFolder(name, topicIds, icon, scope),
  updateFolder,
  addTopicToFolder: (folderId: string, topicId: string) =>
    setTopicInFolder(folderId, topicId, scope, true),
  removeTopicFromFolder: (folderId: string, topicId: string) =>
    setTopicInFolder(folderId, topicId, scope, false),
  deleteFolder,
  reorderFolders: (folderIds: string[]) => reorderFolders(scope, folderIds),
  selectFolder: (folderId: string | null) => selectFolder(folderId, scope),
  openFolderManager: () => openFolderManager(scope),
  closeFolderManager
});
