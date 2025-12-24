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
  isAddOne: true,
  title: 'Создать диалог',
  contacts: () => [],
  dataTestid: () => 'NewContactModal'
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-new-contact', contact: IUserProps[] | IUserProps);
}>();

const closeModal = (): void => {
  emits('unmount-close');
};

const handleNewContact = (contacts: IUserProps[] | IUserProps): void => {
  if (props.isAddOne) {
    emits('unmount-new-contact', contacts);
  } else {
    emits('unmount-new-contact', contacts);
  }
  closeModal();
};
</script>
