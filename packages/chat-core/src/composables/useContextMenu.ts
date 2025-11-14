import { ref } from 'vue';
import { MAX_W_MD } from '../utils/constants';
import { useResizeState } from '../composables/useResizeState';

export const useContextMenu = () => {
  const isOpen = ref<Record<string, boolean>>({});
  const position = ref({ x: 0, y: 0 });

  const { state: isMobile } = useResizeState(MAX_W_MD);

  const openActivePopover = (id: string, event: MouseEvent): void => {
    if (isMobile) return;
    if (event.altKey) return;
    event.preventDefault();
    position.value = { x: event.pageX, y: event.pageY };
    Object.keys(isOpen.value).forEach(key => {
      if (key !== id) {
        isOpen.value[key] = false;
      }
    });
    isOpen.value[id] = true;
  };

  const closeActivePopover = (id?: string): void => {
    if (id) {
      isOpen.value[id] = false;
    } else {
      Object.keys(isOpen.value).forEach(key => {
        isOpen.value[key] = false;
      });
    }
    position.value = {
      x: 0,
      y: 0
    };
  };

  return {
    isOpen,
    position,
    openActivePopover,
    closeActivePopover
  };
};
