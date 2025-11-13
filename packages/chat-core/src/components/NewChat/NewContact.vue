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
    <section class="new-contact__section">
      <Search class="new-contact__search" />
      <ul class="new-contact__list">
        <li
          v-for="contact in contacts"
          :key="contact.id"
          class="new-contact__item"
          @click="handleNewContact(contact)"
        >
          <UserProfile
            :name="contact.name"
            :nickname="contact.nickname"
            :avatar-url="contact.avatarUrl"
            :avatar-alt="contact.avatarAlt"
          />
          <Checkbox
            :size="CheckboxSizeEnum.small"
            @update:model-value="value => handleCheckbox(value, contact.id)"
          />
        </li>
      </ul>
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.little"
        class="new-contact__add"
        :disabled="isButtonDisabled"
        @click="handleOpenUser"
      >
        Добавить
      </Button>
    </section>
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
  Checkbox,
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum,
  Search,
  ButtonTypeEnum,
  Button,
  CheckboxSizeEnum
} from 'sep-yui';
import UserProfile from '../UserProfile/UserProfile.vue';
import AddUser from './AddUser.vue';

interface Contact {
  userID: string;
  nickname: string;
  faceURL?: string;
}

const props = withDefaults(
  defineProps<{
    open: boolean;
    contacts?: Contact[];
  }>(),
  {
    open: false,
    contacts: () => []
  }
);

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-contact', contact: Contact);
}>();

const state = reactive({
  open: false,
  checkUsers: new Set(),
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

const handleNewContact = (contact: Contact): void => {
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

<style></style>
