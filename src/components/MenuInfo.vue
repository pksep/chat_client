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
    @unmount-new-contact="contacts => handleUpdateGroupMembers(contacts)"
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
import type {
  IMenuRightProps,
  IMenuEmits,
  IUserProps
} from './interfaces/interfaces';
import { useMenuInfo } from '../composables/useMenuInfo';
import NewContactModal from './NewChat/NewContactModal.vue';
import { fetchGroupMembers } from '../services/useGroup';

const props = withDefaults(defineProps<IMenuRightProps>(), {
  open: false,
  dataTestid: () => 'MenuInfo'
});

const menuInfoClasses = computed(() => [
  'menu-info',
  { 'menu-info--open': props.open },
  props.class
]);

const handleUpdateGroupMembers = async (
  contacts: IUserProps | IUserProps[]
): Promise<void> => {
  if (Array.isArray(contacts)) {
    await handleNewContact(contacts);
    if (props.contact?.groupId) {
      const updatedContacts = await fetchGroupMembers(props.contact.groupId);
      state.contacts = updatedContacts;
      emits('unmount-contacts-update', updatedContacts);

      const updatedContact = {
        ...props.contact,
        membersLength: updatedContacts.length
      };
      emits('unmount-contact', updatedContact);
    }
  }
};

const emits = defineEmits<IMenuEmits>();

const handleCloseMenu = (): void => {
  emits('unmount-collapse', false);
};

watch(
  () => props.open,
  async newVal => {
    if (newVal && props.contact) {
      await initializeMenuInfo({ ...props, isEnabled: true });
    }
  }
);

watch(
  () => props.contact,
  async (newContact, oldContact) => {
    if (newContact && props.open) {
      const wasGroup = !!oldContact?.groupId;
      const isGroup = !!newContact.groupId;

      if (wasGroup !== isGroup) {
        handleCloseMenu();
        return;
      }

      if (isGroup && newContact.groupId !== oldContact?.groupId) {
        await initializeMenuInfo({ ...props, isEnabled: true });
      } else if (!isGroup && newContact.id !== oldContact?.id) {
        await initializeMenuInfo({ ...props, isEnabled: true });
      }
    }
  },
  { deep: true }
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
