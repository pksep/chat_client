import { computed, ref } from 'vue';
import type { ChatFolderScope } from '../services/useChatSDK/chat-folder';

type ChatListSelection =
  | { type: 'filter'; filter: string }
  | { type: 'folder'; folderId: string };

const selections = {
  chats: ref<ChatListSelection>({ type: 'filter', filter: 'all' }),
  clients: ref<ChatListSelection>({ type: 'filter', filter: 'all' })
};

export const useChatListSelection = (scope: ChatFolderScope = 'chats') => {
  const selection = selections[scope];
  const selectFilter = (filter: string): void => {
    selection.value = { type: 'filter', filter };
  };
  const activeFolderId = computed({
    get: () =>
      selection.value.type === 'folder' ? selection.value.folderId : null,
    set: (folderId: string | null) => {
      selection.value = folderId
        ? { type: 'folder', folderId }
        : { type: 'filter', filter: 'all' };
    }
  });
  const selectedFilter = computed(() =>
    selection.value.type === 'filter' ? selection.value.filter : null
  );

  return { activeFolderId, selectedFilter, selectFilter };
};
