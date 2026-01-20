<template>
  <Modal
    :open="props.open"
    class="new-contact"
    position="center"
    @close="closeModal"
    :data-testid="`${props.dataTestid}-NewContactModal-Container`"
  >
    <header class="new-contact__header">
      {{ props.title }}
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="closeModal"
        class="new-contact__button-close"
      >
        <Icon :name="IconNameEnum.crossSmall" />
      </Button>
    </header>
    <ContactSelector
      :is-add-one="props.isAddOne"
      :contacts="contacts"
      :excluded-contact-ids="props.excludedContactIds"
      @unmount-contact="handleNewContact"
    />
  </Modal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
import { ITopic, IUser } from '../interfaces/interfaces';
import { navigateToDialogs } from '../../composables/navigation';
import { getUsersList } from '../../composables/useUsers';
import { getChatSDK } from '../../services/useChat';

const props = withDefaults(defineProps<INewContactProps>(), {
  open: false,
  isAddOne: true,
  title: 'Создать диалог',
  excludedContactIds: () => new Set<string | number>(),
  dataTestid: () => 'NewContactModal'
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-contact', contact: ITopic[] | IUser);
}>();

const contacts = computed(() => {
  // Create a new array to ensure reactivity
  const userContacts = props.contacts || getUsersList();
  // Return a new array reference to ensure Vue reactivity
  return [...userContacts];
});

const closeModal = (): void => {
  emits('unmount-close');
};

const handleNewContact = (contact: ITopic[] | IUser): void => {
  const sdk = getChatSDK();
  if (props.isAddOne && 'id' in contact && contact.id) {
    navigateToDialogs(contact.id as string);
    sdk.joinTopic(contact.id);
  } else {
    emits('unmount-new-contact', contact);
  }
  closeModal();
};
</script>
