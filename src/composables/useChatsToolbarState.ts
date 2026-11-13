import { reactive, readonly } from 'vue';
import { useChatListSelection } from './useChatListSelection';

export type ChatsToolbarFilter = 'all' | 'chats' | 'groups' | 'bots';

export const chatsToolbarFilterOptions: Array<{
  value: ChatsToolbarFilter;
  label: string;
}> = [
  { value: 'all', label: 'Все' },
  { value: 'chats', label: 'Чаты' },
  { value: 'groups', label: 'Группы' },
  { value: 'bots', label: 'Боты' }
];

const { selectedFilter, selectFilter } = useChatListSelection();
const state = reactive({
  search: '',
  get filter(): ChatsToolbarFilter {
    return (selectedFilter.value || 'all') as ChatsToolbarFilter;
  },
  get selectedFilter(): ChatsToolbarFilter | null {
    return selectedFilter.value as ChatsToolbarFilter | null;
  }
});

export const useChatsToolbarState = () => {
  const setSearch = (value: string): void => {
    state.search = value;
  };

  const setFilter = (value: ChatsToolbarFilter): void => {
    selectFilter(value);
  };

  return {
    state: readonly(state),
    setSearch,
    setFilter
  };
};
