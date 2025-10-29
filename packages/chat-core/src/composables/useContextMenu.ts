import { ref } from 'vue';

export const useContextMenu = () => {
  const isOpen = ref(false);
  const position = ref({ x: 0, y: 0 });

  const openActivePopover = (event: MouseEvent): void => {
    if (event.altKey) return;
    event.preventDefault();
    position.value = { x: event.pageX, y: event.pageY };
    isOpen.value = true;
  };

  const closeActivePopover = (): void => {
    isOpen.value = false;
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
