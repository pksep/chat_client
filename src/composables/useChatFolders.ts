import { computed, reactive, readonly, ref, watch } from 'vue';
import { authedUser, getAuthUser } from './useAuth';
import { getChatSDK } from '../services/useChat';
import { sortChatFolders } from '../utils/chat-folder-order';
import { showNotification } from './useNotifications';
import type { ChatSDK } from '../services/useChatSDK';
import { WebSocketEventType } from '../services/useChatSDK/websocketEvents';
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
let sessionRevision = 0;
let changeRevision = 0;
const folderChanges = new Map<string, number>();
const deletedFolderIds = new Set<string>();
let unbindFolderSync: (() => void) | undefined;
let refreshPending = false;
const topicUpdateQueue = new Map<string, Promise<ChatFolder>>();

const sortFolders = sortChatFolders;

const upsertFolder = (folder: ChatFolder): void => {
  if (deletedFolderIds.has(folder.id)) return;
  const index = folders.value.findIndex(item => item.id === folder.id);
  if (
    index !== -1 &&
    new Date(folders.value[index].updatedAt).getTime() >
      new Date(folder.updatedAt).getTime()
  )
    return;
  folderChanges.set(folder.id, ++changeRevision);

  if (index === -1) {
    folders.value = sortFolders([...folders.value, folder]);
    return;
  }

  folders.value.splice(index, 1, folder);
  folders.value = sortFolders(folders.value);
};

const removeFolder = (folderId: string): void => {
  deletedFolderIds.add(folderId);
  folderChanges.set(folderId, ++changeRevision);
  folders.value = folders.value.filter(folder => folder.id !== folderId);
  for (const selection of Object.values(selections)) {
    if (selection.activeFolderId.value === folderId)
      selection.activeFolderId.value = null;
  }
};

const mutationContext = () => {
  const sdk = getChatSDK();
  const userId = getAuthUser()?.id;
  if (!sdk || !userId) throw new Error('Чат ещё не подключён');
  const revision = sessionRevision;
  return {
    sdk,
    userId,
    change: changeRevision,
    isCurrent: () =>
      revision === sessionRevision &&
      getChatSDK() === sdk &&
      getAuthUser()?.id === userId
  };
};

const applyMutation = (
  folder: ChatFolder,
  context: ReturnType<typeof mutationContext>
): void => {
  if (!context.isCurrent()) throw new Error('Сессия пользователя изменилась');
  // Событие может прийти раньше подтверждения операции; поздний ack не откатывает новые данные.
  if ((folderChanges.get(folder.id) || 0) <= context.change)
    upsertFolder(folder);
};

const applySnapshot = (snapshot: ChatFolder[], startedAt: number): void => {
  // Системная папка снова доступна после возвращения права на раздел клиентов.
  for (const folder of snapshot)
    if (folder.isSystem) deletedFolderIds.delete(folder.id);

  const next = new Map(
    snapshot
      .filter(folder => !deletedFolderIds.has(folder.id))
      .map(folder => [folder.id, folder])
  );
  for (const folder of folders.value) {
    if (
      (folderChanges.get(folder.id) || 0) > startedAt ||
      (next.has(folder.id) &&
        new Date(folder.updatedAt).getTime() >
          new Date(next.get(folder.id)!.updatedAt).getTime())
    ) {
      next.set(folder.id, folder);
    } else if (!next.has(folder.id)) {
      removeFolder(folder.id);
    }
  }
  folders.value = sortFolders([...next.values()]);
  for (const folder of folders.value)
    folderChanges.set(folder.id, ++changeRevision);
  for (const selection of Object.values(selections)) {
    if (
      selection.activeFolderId.value &&
      !next.has(selection.activeFolderId.value)
    )
      selection.activeFolderId.value = null;
  }
};

export const configureChatFolderSync = (sdk: ChatSDK, userId: string): void => {
  unbindFolderSync?.();
  ++sessionRevision;
  ++loadRevision;
  isLoading.value = false;
  loadedUserId = '';
  refreshPending = false;
  topicUpdateQueue.clear();
  for (const selection of Object.values(selections))
    selection.isReordering.value = false;
  const revision = sessionRevision;
  const handler: Parameters<
    typeof sdk.subscribeToEvent<WebSocketEventType.CHAT_FOLDER_CHANGED>
  >[1] = event => {
    if (
      revision !== sessionRevision ||
      getChatSDK() !== sdk ||
      getAuthUser()?.id !== userId
    )
      return;
    const change = event.payload;
    if (change.kind === 'delete') removeFolder(change.folderId);
    else if (change.kind === 'upsert') upsertFolder(change.folder);
    else for (const folder of change.folders) upsertFolder(folder);
  };
  sdk.subscribeToEvent(WebSocketEventType.CHAT_FOLDER_CHANGED, handler);
  unbindFolderSync = () =>
    sdk.unsubscribeFromEvent(WebSocketEventType.CHAT_FOLDER_CHANGED, handler);
};

export const refreshChatFoldersFromSocket = async (): Promise<void> => {
  const sdk = getChatSDK();
  const userId = getAuthUser()?.id;
  if (!sdk || !userId) return;
  const session = sessionRevision;
  const revision = ++loadRevision;
  const startedAt = changeRevision;
  try {
    const snapshot = await sdk.syncChatFolders();
    if (
      session !== sessionRevision ||
      revision !== loadRevision ||
      getChatSDK() !== sdk ||
      getAuthUser()?.id !== userId
    )
      return;
    applySnapshot(snapshot, startedAt);
    loadedUserId = userId;
    state.error = '';
  } catch (error) {
    if (session === sessionRevision && revision === loadRevision)
      console.warn('Не удалось синхронизировать папки:', error);
  } finally {
    if (revision === loadRevision) {
      isLoading.value = false;

      if (refreshPending) {
        refreshPending = false;
        await loadFolders(true);
      }
    }
  }
};

const loadFolders = async (force = false): Promise<void> => {
  const userId = getAuthUser()?.id || '';
  const sdk = getChatSDK();

  if (!userId || !sdk) return;

  if (isLoading.value) {
    if (force) refreshPending = true;
    return;
  }
  if (!force && loadedUserId === userId) return;

  isLoading.value = true;
  state.error = '';
  const revision = ++loadRevision;
  const startedAt = changeRevision;

  try {
    const loadedFolders = await sdk.getChatFolders();
    if (
      revision !== loadRevision ||
      getAuthUser()?.id !== userId ||
      getChatSDK() !== sdk
    )
      return;
    applySnapshot(loadedFolders, startedAt);
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
    if (revision === loadRevision) {
      isLoading.value = false;

      if (refreshPending) {
        refreshPending = false;
        await loadFolders(true);
      }
    }
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

  const context = mutationContext();
  const folder = await context.sdk.createChatFolder({
    name: normalizedName,
    icon,
    scope,
    topicIds: uniqueTopicIds
  });
  applyMutation(folder, context);
  return folder;
};

const updateFolder = async (
  folderId: string,
  payload: SaveChatFolderPayload
): Promise<ChatFolder> => {
  if (folders.value.find(folder => folder.id === folderId)?.isSystem)
    throw new Error('Системную папку нельзя изменять');

  const normalizedPayload: SaveChatFolderPayload = {
    ...(payload.name === undefined ? {} : { name: payload.name.trim() }),
    ...(payload.icon === undefined ? {} : { icon: payload.icon }),
    ...(payload.topicIds === undefined
      ? {}
      : { topicIds: [...new Set(payload.topicIds)] })
  };

  const context = mutationContext();
  const folder = await context.sdk.updateChatFolder(
    folderId,
    normalizedPayload
  );
  applyMutation(folder, context);
  return folder;
};

const deleteFolder = async (folderId: string): Promise<void> => {
  if (folders.value.find(folder => folder.id === folderId)?.isSystem)
    throw new Error('Системную папку нельзя удалить');

  const context = mutationContext();
  await context.sdk.deleteChatFolder(folderId);
  if (!context.isCurrent()) throw new Error('Сессия пользователя изменилась');
  removeFolder(folderId);
};

const setTopicInFolder = (
  folderId: string,
  topicId: string,
  scope: ChatFolderScope,
  included: boolean
): Promise<ChatFolder> => {
  const revision = sessionRevision;
  const userId = getAuthUser()?.id;
  // Сохраняем порядок действий этого устройства; состав папки меняется атомарно на сервере.
  const previous = topicUpdateQueue.get(folderId);
  const update = (previous || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      if (
        !userId ||
        revision !== sessionRevision ||
        getAuthUser()?.id !== userId
      )
        throw new Error('Сессия пользователя изменилась');
      const folder = folders.value.find(item => item.id === folderId);
      if (!folder || (folder.scope || 'chats') !== scope)
        throw new Error('Папка больше недоступна');
      if (folder.isSystem)
        throw new Error('Состав системной папки определяется автоматически');

      if (folder.topicIds.includes(topicId) === included) return folder;
      const context = mutationContext();
      const savedFolder = await context.sdk.setChatFolderTopic(
        folderId,
        topicId,
        included
      );
      applyMutation(savedFolder, context);
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
    folder => (folder.scope || 'chats') === scope && !folder.isSystem
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
  const context = mutationContext();
  const startedAt = changeRevision;
  const applyPositions = (
    nextPositions: Map<string, number | undefined>
  ): void => {
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
    const savedFolders = await context.sdk.reorderChatFolders(scope, folderIds);
    if (!context.isCurrent()) return;
    for (const folder of savedFolders) applyMutation(folder, context);
  } catch (error) {
    if (!context.isCurrent()) return;
    applyPositions(
      new Map(
        [...positions].filter(
          ([id]) => (folderChanges.get(id) || 0) <= startedAt
        )
      )
    );
    showNotification({
      title: 'Не удалось изменить порядок папок',
      description: error
    });
  } finally {
    if (context.isCurrent()) selection.isReordering.value = false;
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
    ++sessionRevision;
    unbindFolderSync?.();
    unbindFolderSync = undefined;
    changeRevision = 0;
    folderChanges.clear();
    deletedFolderIds.clear();
    loadedUserId = '';
    refreshPending = false;
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
