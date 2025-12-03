<template>
  <aside
    :class="menuInfoClasses"
    v-if="isOpen"
    :data-testid="`${props.dataTestid}-MenuInfo-Container`"
  >
    <header
      class="menu-info__header"
      :data-testid="`${props.dataTestid}-MenuInfo-Header`"
    >
      <h4 :data-testid="`${props.dataTestid}-MenuInfo-Title`">
        {{ props.contact?.nickname || 'Общий' }}
      </h4>
      <Button
        class="menu-info__close-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="handleCloseMenu"
        :data-testid="`${props.dataTestid}-MenuInfo-CloseButton`"
      >
        <Icon
          :name="IconNameEnum.crossLarge"
          class="menu-info__close-icon"
          :data-testid="`${props.dataTestid}-MenuInfo-CloseIcon`"
        />
      </Button>
    </header>
    <Tabs
      :tab-count="2"
      :default-active-tab-id="props.activeTabId"
      class="menu-info__tabs"
      :data-testid="`${props.dataTestid}-MenuInfo-Tabs`"
    >
      <template #header1>
        <span
          class="menu-info__user-header"
          :data-testid="`${props.dataTestid}-MenuInfo-Tab1Header`"
        >
          Участники
          <div
            class="menu-info__user-count"
            :data-testid="`${props.dataTestid}-MenuInfo-UserCount`"
          >
            {{ state.contacts.length }}
          </div>
        </span>
      </template>
      <template #header2> Информация </template>
      <template #tab1>
        <ContactListInModal
          :show-add-button="!checkGroupId"
          :contacts="state.contacts"
          @unmount-click-add-button="handleContactClick"
          :data-testid="`${props.dataTestid}-MenuInfo-ContactListInModal`"
        />
      </template>
      <template #tab2>
        <section
          class="menu-info__info-section"
          :data-testid="`${props.dataTestid}-MenuInfo-InfoSection`"
        >
          <slot name="information-menu">
            <InformationMenu
              :model-value="state.information"
              @update:model-value="handleUpdateInformation"
              :data-testid="`${props.dataTestid}-MenuInfo-InformationMenu`"
            />
          </slot>
        </section>
      </template>
    </Tabs>
  </aside>
  <NewContactModal
    :open="state.openAddUser"
    :isAddOne="false"
    :contacts="state.filteredMembers"
    @unmount-new-contact="handleNewContact"
    @unmount-close="handleCloseAddUserModal"
    title="Добавить контакт"
  />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
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
import type { IMenuRightProps, IMenuEmits } from './interfaces/interfaces';
import { useMenuInfo } from '../composables/useMenuInfo';
import NewContactModal from './NewChat/NewContactModal.vue';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_XL } from '../utils/constants';
import { watch } from 'vue';

const props = withDefaults(defineProps<IMenuRightProps>(), {
  open: false,
  dataTestid: () => 'MenuInfo'
});

const menuInfoClasses = computed(() => [
  'menu-info',
  { 'menu-info--open': props.open },
  props.class
]);

const emits = defineEmits<IMenuEmits>();

const { state: isOpen, setState } = useResizeState({
  breakpoint: MAX_W_XL,
  onStateChange: (val: boolean) => emits('unmount-collapse', val)
});

const handleCloseMenu = (): void => {
  setState(false);
};

watch(
  () => props.open,
  async newVal => {
    isOpen.value = newVal;
    console.log(props);
    if (newVal) {
      await initializeMenuInfo({ ...props, isEnabled: true });
    }
  }
);

watch(
  () => props.contact?.id,
  (newId, oldId) => {
    if (newId !== oldId) {
      handleCloseMenu();
    }
  }
);

const {
  state,
  checkGroupId,
  initializeMenuInfo,
  handleContactClick,
  handleNewContact,
  handleUpdateInformation,
  handleCloseAddUserModal
} = useMenuInfo({ ...props, isEnabled: true }, emits);
</script>
