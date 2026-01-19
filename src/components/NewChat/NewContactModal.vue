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
  dataTestid: () => 'NewContactModal'
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-contact', contact: ITopic[] | IUser);
}>();

const contacts = computed(() => getUsersList());

const closeModal = (): void => {
  emits('unmount-close');
};

const handleNewContact = (user: ITopic): void => {
  if (props.isAddOne && user.id) {
    navigateToDialogs(user.id as string);
    const sdk = getChatSDK();
    sdk.createTopic({ peerId: user.id });
  }
  closeModal();
};
</script>
