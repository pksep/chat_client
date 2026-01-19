<template>
  <aside
    :class="menuInfoClasses"
    v-if="props.open"
    :data-testid="`${props.dataTestid}-MenuInfo-Container`"
  >
    <header
      class="menu-info__header"
      :data-testid="`${props.dataTestid}-MenuInfo-Header`"
    >
      <h4 :data-testid="`${props.dataTestid}-MenuInfo-Title`">
        {{ 'Общий' }}
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
          :filtered-contacts="filteredMembers"
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
    :contacts="filteredMembers"
    @unmount-new-contact="handleNewContactAdded"
    @unmount-close="handleCloseAddUserModal"
    title="Добавить контакт"
  />
</template>

<script lang="ts" setup>
import { computed, watch, onUnmounted } from 'vue';
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
import type { IMenuRightProps, IUser } from './interfaces/interfaces';
import { useMenuInfo } from '../composables/useMenuInfo';
import NewContactModal from './NewChat/NewContactModal.vue';
import { useUrlWatcher } from '../composables/navigation';
import { fetchGroupMembers } from '../services/useGroup';

const props = withDefaults(defineProps<IMenuRightProps>(), {
  open: false,
  dataTestid: () => 'MenuInfo'
});

const topic = useUrlWatcher();

const menuInfoClasses = computed(() => [
  'menu-info',
  { 'menu-info--open': props.open },
  props.class
]);

/*
@TODO: Implement handleUpdateGroupMembers
*/
const handleUpdateGroupMembers = async (): Promise<void> => {
  if (state.openAddUser) {
    handleCloseAddUserModal();
  }
  await refreshGroupMembers();
};

const emits = defineEmits<{
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-new-group', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-contacts-update', contacts: IUser[]): void;
}>();

const handleCloseMenu = (): void => {
  emits('unmount-collapse', false);
};

const handleNewContactAdded = async (): Promise<void> => {
  await handleUpdateGroupMembers();
};

const {
  state,
  checkGroupId,
  initializeMenuInfo,
  handleContactClick,
  handleUpdateInformation,
  handleCloseAddUserModal,
  filteredMembers
} = useMenuInfo();

let refreshTimeout: ReturnType<typeof setTimeout> | null = null;

// Watch for changes in openAddUser state to refresh data when modal closes
watch(
  () => state.openAddUser,
  (newVal, oldVal) => {
    // When modal closes, refresh the group members to reflect any changes
    if (oldVal && !newVal) {
      // Clear any existing timeout
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      // Small delay to ensure modal closes properly
      refreshTimeout = setTimeout(() => {
        refreshGroupMembers();
        refreshTimeout = null;
      }, 300);
    }
  }
);

const refreshGroupMembers = async (): Promise<void> => {
  if (state.information?.groupId) {
    const updatedContacts = await fetchGroupMembers(state.information.groupId);
    state.contacts = updatedContacts;
    emits('unmount-contacts-update', updatedContacts);
  }
};

onUnmounted(() => {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
});

watch(
  () => [props.open, topic.value.id],
  async () => {
    if (props.open === true) {
      await initializeMenuInfo({
        ...props,
        isEnabled: true,
        topic: topic.value
      });
    }
  }
);
</script>
