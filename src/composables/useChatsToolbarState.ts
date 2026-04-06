import { reactive, readonly } from 'vue';

export type ChatsToolbarFilter = 'all' | 'chats' | 'groups';

const state = reactive({
  search: '',
  filter: 'all' as ChatsToolbarFilter
});

export const useChatsToolbarState = () => {
  const setSearch = (value: string): void => {
    state.search = value;
  };

  const setFilter = (value: ChatsToolbarFilter): void => {
    state.filter = value;
  };

  return {
    state: readonly(state),
    setSearch,
    setFilter
  };
};
