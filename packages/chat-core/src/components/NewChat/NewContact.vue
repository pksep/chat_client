<template>
  <Modal
    :open="state.open"
    class="new-contact"
    position="center"
    @close="closeModal"
  >
    <header class="new-contact__header">
      Добавить участника
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="closeModal"
        class="new-contact__button-close"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </Button>
    </header>
    <ContactSelector
      :contacts="contacts"
      :selected-contact-ids="state.checkUsers"
      @contact-select="handleNewContact"
      @checkbox-change="handleCheckbox"
      @add-click="handleOpenUser"
    />
  </Modal>
  <KeepAlive>
    <component
      :is="AddUser"
      :open="state.openAddUser"
      @unmount-close="handleCloseAddUser"
    />
  </KeepAlive>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import {
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum,
  ButtonTypeEnum,
  Button
} from 'sep-yui';
import ContactSelector from './ContactSelector.vue';
import AddUser from './AddUser.vue';
import type { INewContactProps } from './interfaces/new-contact';
import { IUserProps } from '../interfaces/interfaces';

const props = withDefaults(defineProps<INewContactProps>(), {
  open: false,
  contacts: () => []
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-contact', contact: IUserProps);
}>();

const state = reactive({
  open: false,
  checkUsers: new Set<string | number>(),
  openAddUser: false
});

const isButtonDisabled = computed(() => state.checkUsers.size === 0);

watch(
  () => props.open,
  () => {
    state.open = props.open;
  }
);

watch(
  () => state.openAddUser,
  () => {
    state.open = !state.openAddUser;
  }
);

const closeModal = (): void => {
  state.open = false;
  state.openAddUser = false;
  emits('unmount-close');
};

const handleCheckbox = (isCheck: boolean, contactId: string | number): void => {
  if (isCheck) {
    state.checkUsers.add(contactId);
  } else {
    state.checkUsers.delete(contactId);
  }
};

const handleNewContact = (contact: IUserProps): void => {
  emits('unmount-new-contact', contact);
  closeModal();
};

const handleCloseAddUser = (): void => {
  state.openAddUser = false;
};

const handleOpenUser = (): void => {
  if (isButtonDisabled.value) return;
  state.openAddUser = true;
};
</script>
