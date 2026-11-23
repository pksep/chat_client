<template>
  <div v-if="!hidden" @contextmenu="openMenu">
    <slot />
    <Teleport to="body">
      <ContextMenu
        :visible="menuOpen"
        :position="position"
        data-testid="DesktopAppButton-ContextMenu"
        @unmount-close="menuOpen = false"
      >
        <Button
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click="hideButton"
        >
          Скрыть кнопку
        </Button>
      </ContextMenu>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onKeyStroke, useLocalStorage } from '@vueuse/core';
import { Button, ButtonTypeEnum, SizesEnum } from '@pksep/yui';
import ContextMenu from '../ContactList/ContextMenu.vue';

const emit = defineEmits<{ hide: [] }>();
const hidden = useLocalStorage('chat.desktop.open-app-button.hidden.v1', false);
const menuOpen = ref(false);
const position = ref({ x: 0, y: 0 });
const openMenu = (event: MouseEvent) => {
  if (event.altKey) return;
  event.preventDefault();
  event.stopPropagation();
  position.value = { x: event.clientX, y: event.clientY };
  menuOpen.value = true;
};
const hideButton = () => {
  emit('hide');
  menuOpen.value = false;
  hidden.value = true;
};
onKeyStroke('Escape', () => {
  menuOpen.value = false;
});
</script>
