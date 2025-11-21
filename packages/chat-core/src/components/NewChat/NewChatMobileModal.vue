<template>
  <MobileModal
    :open="props.open"
    @unmount-close="handleCloseModal"
    title="Написать сообщение"
    back-button-text="Отмена"
  >
    <template #default>
      <ContactSelector
        class="mobile__list-modal__contact-selector"
        is-add-one
        :contacts="props.contacts"
        :selected-contact-ids="props.selectedContactIds"
        @unmount-contact="contact => emits('unmount-contact', contact)"
        @unmount-checkbox="
          (isCheck, contactId) => emits('unmount-checkbox', isCheck, contactId)
        "
        @unmount-click="handleOpenUser"
      />
    </template>
  </MobileModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import MobileModal from '../UI/MobileModal.vue';
import ContactSelector from './ContactSelector.vue';
import type { IUserProps } from '../interfaces/interfaces';

interface IProps {
  open: boolean;
  contacts: IUserProps[];
  selectedContactIds: Set<string | number>;
}

interface IEmits {
  'unmount-close': [];
  'unmount-contact': [contact: IUserProps | IUserProps[]];
  'unmount-checkbox': [isCheck: boolean, contactId: string | number];
  'unmount-click': [];
}

const props = withDefaults(defineProps<IProps>(), {
  open: false,
  contacts: () => [],
  selectedContactIds: () => new Set<string | number>()
});

const emits = defineEmits<IEmits>();

const isButtonDisabled = computed(() => props.selectedContactIds.size === 0);

const handleOpenUser = () => {
  if (isButtonDisabled.value) return;
  emits('unmount-click');
};

const handleCloseModal = () => {
  emits('unmount-close');
};
</script>
