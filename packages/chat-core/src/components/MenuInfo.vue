<template>
  <aside :class="menuInfoClasses" v-if="props.open">
    <header class="menu-info__header">
      <h4>Общий</h4>
      <Button
        class="menu-info__close-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="handleCloseMenu"
      >
        <Icon :name="IconNameEnum.crossLarge" class="menu-info__close-icon" />
      </Button>
    </header>
    <Tabs :tabCount="2">
      <template #header1>
        <span class="menu-info__user-header">
          Участники
          <div class="menu-info__user-count">{{ [props.contact].length }}</div>
        </span>
      </template>
      <template #header2> Информация </template>
      <template #tab1>
        <ContactListInModal :contacts="[props.contact]" />
      </template>
      <template #tab2>
        <section class="menu-info__info-section">
          <slot name="information-menu">
            <InformationMenu />
          </slot>
        </section>
      </template>
    </Tabs>
  </aside>
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
import { useResizeState } from '../composables/useResizeState';
import {
  Tabs,
  Button,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum,
  Icon
} from '@pksep/yui';
import ContactListInModal from './ContactList/ContactListInModal.vue';
import InformationMenu from './InformationMenu.vue';
import type { IMenuProps, IMenuEmits } from './interfaces/interfaces';
import { MAX_W_XL } from '../utils/constants';

const props = withDefaults(defineProps<IMenuProps>(), {
  open: false
});

const emits = defineEmits<IMenuEmits>();

const menuInfoClasses = computed(() => [
  'menu-info',
  { 'menu-info--open': props.open }
]);

const { state: isOpen, setState } = useResizeState({
  breakpoint: MAX_W_XL,
  onStateChange: (val: boolean) => emits('unmount-collapse', val)
});

const close = () => setState(false);

const handleCloseMenu = (): void => {
  close();
};

/*
const unmountUserAdd = (): void => {
  emits('unmount-new-contact', { isChapterOpen: true });
};
 */

watch(
  () => props.open,
  newVal => {
    isOpen.value = newVal;
  },
  { immediate: true }
);
</script>
