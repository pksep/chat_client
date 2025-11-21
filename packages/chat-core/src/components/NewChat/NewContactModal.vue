<template>
  <Modal
    :open="state.open"
    class="new-contact"
    position="center"
    @close="closeModal"
  >
    <header class="new-contact__header">
      {{ props.title }}
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
      is-add-one
      :contacts="contacts"
      :selected-contact-ids="state.checkUsers"
      @unmount-contact="handleNewContact"
      @unmount-checkbox="handleCheckbox"
    />
  </Modal>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import {
  Icon,
  IconNameEnum,
  Modal,
  SizesEnum,
  ButtonTypeEnum,
  Button
} from '@pksep/yui';
import ContactSelector from './ContactSelector.vue';
import type { INewContactProps } from './interfaces/new-contact';
import { IUserProps } from '../interfaces/interfaces';

const props = withDefaults(defineProps<INewContactProps>(), {
  open: false,
  title: 'Создать диалог',
  contacts: () => []
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-contact', contact: IUserProps);
}>();

const state = reactive({
  open: false,
  checkUsers: new Set<string>()
});

watch(
  () => props.open,
  () => {
    state.open = props.open;
  }
);

const closeModal = (): void => {
  state.open = false;
  emits('unmount-close');
};

const handleCheckbox = (isCheck: boolean, contactId: string): void => {
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
</script>
