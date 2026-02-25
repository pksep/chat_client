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
      :excluded-contact-ids="props.excludedContactIds"
      @unmount-contact="handleNewContact"
    />
  </Modal>
</template>

<script setup lang="ts">
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
import { getChatSDK } from '../../services/useChat';

const props = withDefaults(defineProps<INewContactProps>(), {
  open: false,
  isAddOne: true,
  title: 'Создать диалог',
  excludedContactIds: () => new Set<string | number>(),
  dataTestid: 'NewContactModal'
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-contact', contact: ITopic[] | IUser);
}>();

const closeModal = (): void => {
  emits('unmount-close');
};

const handleNewContact = async (contact: ITopic[] | IUser): Promise<void> => {
  const sdk = getChatSDK();
  if (props.isAddOne && 'id' in contact && contact.id) {
    const topic = await sdk.createTopic({ peerId: contact.id });
    navigateToDialogs(topic.id as string);
  } else {
    emits('unmount-new-contact', contact);
  }
  closeModal();
};
</script>
