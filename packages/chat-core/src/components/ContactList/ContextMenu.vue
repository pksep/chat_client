<template>
  <div
    v-if="visible"
    ref="menuRef"
    :style="{
      left: position.x + 'px',
      top: position.y + 'px'
    }"
    class="context-menu"
    @click.stop
  >
    <Button
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.little"
      @click="handleEdit"
    >
      Edit
    </Button>
    <Button
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.little"
      @click="handleDelete"
    >
      Delete
    </Button>
  </div>
</template>

<script setup lang="ts">
import { Button, ButtonTypeEnum, SizesEnum, VueToolsCore } from 'sep-yui';
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  position: { x: number; y: number };
}>();

const emit = defineEmits<{
  edit: [];
  delete: [];
  close: [];
}>();

const menuRef = ref<HTMLElement | null>(null);

watch(
  () => props.visible,
  newVal => {
    if (newVal) {
      nextTick(() => {
        VueToolsCore.onClickOutside(menuRef.value, () => emit('close'));
      });
    }
  }
);

const handleEdit = (): void => {
  emit('edit');
  emit('close');
};

const handleDelete = (): void => {
  emit('delete');
  emit('close');
};
</script>

<style lang="css" scoped>
.context-menu {
  position: absolute;
  background: var(--white);
  border: 1px solid var(--grey3);
  border-radius: 4px;
  padding: 4px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  min-width: 120px;
}

.context-menu Button {
  width: 100%;
  justify-content: flex-start;
  margin-bottom: 4px;
  text-align: left;
}

.context-menu Button:last-child {
  margin-bottom: 0;
}
</style>
