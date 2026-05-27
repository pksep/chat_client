<template>
  <aside
    :class="menuInfoClasses"
    v-if="props.open && !!currentGroup"
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
            {{ currentGroup.members.length }}
          </div>
        </span>
      </template>
      <template #header2> Информация </template>
      <template #tab1>
        <ContactListInModal
          :show-add-button="currentGroup.isAdmin"
          :contacts="currentGroup.members"
          :filtered-contacts="filteredMembers"
          :excluded-contact-ids="excludedContactIds"
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
              :is-admin="currentGroup.isAdmin"
              :model-value="state.information"
              @update:model-value="handleUpdateInformation"
              @unmount-open-chat="handleCloseMenu"
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
    :excluded-contact-ids="excludedContactIds"
    @unmount-new-contact="handleNewContactAdded"
    @unmount-close="handleCloseAddUserModal"
    title="Добавить контакт"
  />
</template>

<script lang="ts" setup>
import { computed, watch } from 'vue';
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
import type { IMenuRightProps, IUser, ITopic } from './interfaces/interfaces';
import { useMenuInfo } from '../composables/useMenuInfo';
import NewContactModal from './NewChat/NewContactModal.vue';
import { useUrlWatcher } from '../composables/navigation';
import { currentGroup, useGroup } from '../composables/useGroup';

const props = withDefaults(defineProps<IMenuRightProps>(), {
  open: false,
  dataTestid: () => 'MenuInfo'
});

const {
  state,
  initializeMenuInfo,
  handleContactClick,
  handleUpdateInformation,
  handleCloseAddUserModal,
  filteredMembers
} = useMenuInfo();

const { addGroupMembers } = useGroup();

const topic = useUrlWatcher();

const menuInfoClasses = computed(() => [
  'menu-info',
  { 'menu-info--open': props.open },
  props.class
]);

const excludedContactIds = computed(() => {
  const ids = new Set<string | number>();
  if (currentGroup.value?.members) {
    currentGroup.value?.members.forEach(contact => {
      if (contact && contact.id) {
        ids.add(contact.id);
      }
    });
  }
  return ids;
});

const emits = defineEmits<{
  (e: 'unmount-collapse', isCollapse: boolean): void;
  (e: 'unmount-new-contact', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-new-group', config: { isChapterOpen?: boolean }): void;
  (e: 'unmount-contacts-update', contacts: IUser[]): void;
}>();

const handleCloseMenu = (): void => {
  emits('unmount-collapse', false);
};

const handleNewContactAdded = async (
  contact: IUser | ITopic[]
): Promise<void> => {
  if (Array.isArray(contact)) {
    if (contact.length > 0 && 'initials' in contact[0]) {
      const users = contact as unknown as IUser[];
      if (state.information?.groupId) {
        await addGroupMembers(state.information.groupId, users);
      }
    }
  } else {
    if (state.information?.groupId) {
      const users = [contact as unknown as IUser];
      await addGroupMembers(state.information.groupId, users);
    }
  }
};

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
  },
  { immediate: true }
);
</script>
