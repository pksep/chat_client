import { ref, onMounted } from 'vue';

const STORAGE_KEY = 'menu-collapse-state';

export function useMenuCollapse() {
  const isCollapsed = ref(false);

  const loadStateFromStorage = () => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        isCollapsed.value = JSON.parse(stored);
      }
    }
  };

  const saveStateToStorage = () => {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(isCollapsed.value));
    }
  };

  const toggleCollapse = () => {
    isCollapsed.value = !isCollapsed.value;
    saveStateToStorage();
  };

  const setCollapse = (value: boolean) => {
    isCollapsed.value = value;
    saveStateToStorage();
  };

  onMounted(() => {
    loadStateFromStorage();
  });

  return {
    isCollapsed,
    toggleCollapse,
    setCollapse
  };
}
