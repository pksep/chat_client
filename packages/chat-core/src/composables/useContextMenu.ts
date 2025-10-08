import { ref } from 'vue';

const isOpen = ref(false);
const position = ref({ x: 0, y: 0 });

const open = (pos: { x: number; y: number }): void => {
  position.value = pos;
  isOpen.value = true;
};

const close = (): void => {
  isOpen.value = false;
};

export const useContextMenu = () => ({
  isOpen,
  position,
  open,
  close
});
